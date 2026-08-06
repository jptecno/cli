import {
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  rm,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import * as tar from 'tar';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  createGitHubArchiveUrl,
  GitHubTemplateSource,
  maximumArchiveBytes,
} from '../../src/adapters/github-template-source.js';

import type { TemplateDefinition } from '../../src/contracts/template-registry.types.js';

const template: TemplateDefinition = {
  id: 'api-nodejs-typescript',
  name: 'API Node.js + TypeScript',
  description: 'Template de API',
  repository: 'jptecno/template-api-nodejs-typescript',
  version: 'v0.1.0',
  ref: 'v0.1.0',
};

const temporaryDirectories: string[] = [];

afterEach(async () => {
  vi.unstubAllGlobals();
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { force: true, recursive: true })),
  );
});

describe('createGitHubArchiveUrl', () => {
  it('cria a URL codeload para a tag imutável do template', () => {
    expect(
      createGitHubArchiveUrl(
        'jptecno/template-api-nodejs-typescript',
        'v0.1.0',
      ),
    ).toBe(
      'https://codeload.github.com/jptecno/template-api-nodejs-typescript/tar.gz/v0.1.0',
    );
  });

  it('codifica referências que contêm caracteres reservados', () => {
    expect(
      createGitHubArchiveUrl(
        'jptecno/template-api-nodejs-typescript',
        'release/test',
      ),
    ).toBe(
      'https://codeload.github.com/jptecno/template-api-nodejs-typescript/tar.gz/release%2Ftest',
    );
  });
});

describe('GitHubTemplateSource', () => {
  it('informa em português quando o download do archive excede o tempo limite', async () => {
    const destination = await createTemporaryDirectory();
    const fetchMock = vi
      .fn()
      .mockRejectedValue(new DOMException('', 'TimeoutError'));
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      new GitHubTemplateSource().materialize(template, destination),
    ).rejects.toThrow(
      'Não foi possível baixar api-nodejs-typescript: a solicitação excedeu o tempo limite de 30 segundos',
    );
    expect(fetchMock).toHaveBeenCalledWith(
      'https://codeload.github.com/jptecno/template-api-nodejs-typescript/tar.gz/v0.1.0',
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
  });

  it('preserva uma mensagem acionável para erro de rede ao baixar o archive', async () => {
    const destination = await createTemporaryDirectory();
    vi.stubGlobal(
      'fetch',
      vi.fn().mockRejectedValue(new Error('falha de rede')),
    );

    await expect(
      new GitHubTemplateSource().materialize(template, destination),
    ).rejects.toThrow(
      'Não foi possível baixar api-nodejs-typescript: falha de rede',
    );
  });

  it('baixa o archive em stream e extrai o conteúdo no destino (regressão do carregamento integral em memória)', async () => {
    const destination = await createTemporaryDirectory();
    const archiveBuffer = await createFakeArchiveBuffer({
      'arquivo.txt': 'conteúdo do template',
    });
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(archiveBuffer, {
          status: 200,
          headers: { 'content-length': String(archiveBuffer.length) },
        }),
      ),
    );

    await new GitHubTemplateSource().materialize(template, destination);

    await expect(
      readFile(join(destination, 'arquivo.txt'), 'utf8'),
    ).resolves.toBe('conteúdo do template');
  });

  it('rejeita com CliError em português e remove o diretório temporário quando o Content-Length declarado excede o limite', async () => {
    const destination = await createTemporaryDirectory();
    const temporaryDirectoriesBefore = await listTemplateTemporaryDirectories();
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(new Uint8Array([1, 2, 3]), {
          status: 200,
          headers: {
            'content-length': String(maximumArchiveBytes + 1),
          },
        }),
      ),
    );

    await expect(
      new GitHubTemplateSource().materialize(template, destination),
    ).rejects.toThrow(
      `Não foi possível baixar api-nodejs-typescript: o archive excede o limite de ${maximumArchiveBytes} bytes`,
    );

    expect(await listTemplateTemporaryDirectories()).toEqual(
      temporaryDirectoriesBefore,
    );
  });

  it('rejeita com CliError quando o corpo baixado excede o limite mesmo sem um Content-Length confiável', async () => {
    const destination = await createTemporaryDirectory();
    const oversizedBody = new Uint8Array(maximumArchiveBytes + 1);
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response(oversizedBody, { status: 200 })),
    );

    await expect(
      new GitHubTemplateSource().materialize(template, destination),
    ).rejects.toThrow(
      `Não foi possível baixar api-nodejs-typescript: o archive excede o limite de ${maximumArchiveBytes} bytes`,
    );
  });

  it('rejeita com CliError, sem quebrar o processo, quando a resposta não possui corpo', async () => {
    const destination = await createTemporaryDirectory();
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response(null, { status: 200 })),
    );

    await expect(
      new GitHubTemplateSource().materialize(template, destination),
    ).rejects.toThrow(
      'Não foi possível baixar api-nodejs-typescript: GitHub não retornou conteúdo para o archive',
    );
  });

  it('aborta a extração quando a razão de descompressão excede o limite (proteção contra zip bomb)', async () => {
    const destination = await createTemporaryDirectory();
    const archiveBuffer = await createFakeArchiveBuffer({
      'zeros.bin': Buffer.alloc(3 * 1024 * 1024),
    });
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response(archiveBuffer, { status: 200 })),
    );

    await expect(
      new GitHubTemplateSource().materialize(template, destination),
    ).rejects.toThrow('Não foi possível baixar api-nodejs-typescript:');
  });
});

async function createTemporaryDirectory(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'jp-cli-test-'));
  temporaryDirectories.push(directory);
  return directory;
}

async function listTemplateTemporaryDirectories(): Promise<string[]> {
  const entries = await readdir(tmpdir());
  return entries.filter((entry) => entry.startsWith('jp-template-')).sort();
}

async function createFakeArchiveBuffer(
  files: Record<string, string | Buffer>,
): Promise<Buffer> {
  const sourceRoot = await mkdtemp(join(tmpdir(), 'jp-cli-fixture-'));
  temporaryDirectories.push(sourceRoot);

  const projectRoot = join(sourceRoot, 'template-root');
  await mkdir(projectRoot, { recursive: true });

  for (const [relativePath, content] of Object.entries(files)) {
    await writeFile(join(projectRoot, relativePath), content);
  }

  const chunks: Buffer[] = [];
  const packStream = tar.c({ gzip: true, cwd: sourceRoot }, ['template-root']);
  for await (const chunk of packStream) {
    chunks.push(chunk as Buffer);
  }

  return Buffer.concat(chunks);
}
