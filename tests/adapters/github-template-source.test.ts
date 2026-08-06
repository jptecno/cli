import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  createGitHubArchiveUrl,
  GitHubTemplateSource,
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
});

async function createTemporaryDirectory(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'jp-cli-test-'));
  temporaryDirectories.push(directory);
  return directory;
}
