import { execFile } from 'node:child_process';
import {
  lstat,
  mkdtemp,
  readdir,
  readFile,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';

import { afterEach, describe, expect, it } from 'vitest';

import { GitWorktreeTemplateSource } from '../../src/adapters/git-worktree-template-source.js';
import { CliError } from '../../src/application/cli-error.js';
import type { TemplateDefinition } from '../../src/contracts/template-registry.types.js';

const executeFile = promisify(execFile);
const temporaryDirectories: string[] = [];
const template: TemplateDefinition = {
  id: 'api-nodejs-typescript',
  name: 'API Node.js + TypeScript',
  description: 'Template de API',
  repository: 'jptecno/template-api-nodejs-typescript',
  version: 'v1.0.0',
  ref: 'v1.0.0',
};

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { force: true, recursive: true })),
  );
});

describe('GitWorktreeTemplateSource', () => {
  it('materializa somente a árvore do commit esperado, ignorando mudanças e arquivos locais', async () => {
    const fixture = await createRepository();
    const destination = await createTemporaryDirectory();

    await writeFile(
      join(fixture.directory, 'arquivo.txt'),
      'conteúdo alterado',
    );
    await writeFile(
      join(fixture.directory, 'não-versionado.txt'),
      'não copiar',
    );

    await new GitWorktreeTemplateSource({
      sourceDirectory: fixture.directory,
      expectedRepository: template.repository,
      expectedCommit: fixture.commit,
    }).materialize(template, destination);

    await expect(
      readFile(join(destination, 'arquivo.txt'), 'utf8'),
    ).resolves.toBe('conteúdo confirmado');
    await expect(
      lstat(join(destination, 'não-versionado.txt')),
    ).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('rejeita repositório ou commit divergentes sem gravar no destino', async () => {
    const fixture = await createRepository();

    for (const options of [
      {
        expectedRepository: 'jptecno/outro-template',
        expectedCommit: fixture.commit,
      },
      {
        expectedRepository: template.repository,
        expectedCommit: 'a'.repeat(40),
      },
    ]) {
      const destination = await createTemporaryDirectory();

      await expect(
        new GitWorktreeTemplateSource({
          sourceDirectory: fixture.directory,
          ...options,
        }).materialize(template, destination),
      ).rejects.toBeInstanceOf(CliError);
      await expect(readdir(destination)).resolves.toEqual([]);
    }
  });

  it('rejeita links simbólicos da árvore Git antes de escrever no destino', async () => {
    const fixture = await createRepository();
    const destination = await createTemporaryDirectory();

    await symlink('arquivo.txt', join(fixture.directory, 'link.txt'));
    await git(fixture.directory, ['add', 'link.txt']);
    const commitSha = await createCommit(fixture.directory, 'adiciona link');

    await expect(
      new GitWorktreeTemplateSource({
        sourceDirectory: fixture.directory,
        expectedRepository: template.repository,
        expectedCommit: commitSha,
      }).materialize(template, destination),
    ).rejects.toThrow('A árvore Git contém uma entrada não segura');
    await expect(readdir(destination)).resolves.toEqual([]);
  });

  it('não preserva hardlinks do worktree na árvore materializada', async () => {
    const fixture = await createRepository();
    const destination = await createTemporaryDirectory();

    await writeFile(join(fixture.directory, 'original.txt'), 'mesmo inode');
    await executeFile('ln', [
      join(fixture.directory, 'original.txt'),
      join(fixture.directory, 'hardlink.txt'),
    ]);
    await git(fixture.directory, ['add', 'original.txt', 'hardlink.txt']);
    const commitSha = await createCommit(
      fixture.directory,
      'adiciona hardlink',
    );

    await new GitWorktreeTemplateSource({
      sourceDirectory: fixture.directory,
      expectedRepository: template.repository,
      expectedCommit: commitSha,
    }).materialize(template, destination);

    expect((await lstat(join(destination, 'original.txt'))).nlink).toBe(1);
    expect((await lstat(join(destination, 'hardlink.txt'))).nlink).toBe(1);
  });

  it('rejeita destino simbólico e preserva seu alvo', async () => {
    const fixture = await createRepository();
    const target = await createTemporaryDirectory();
    const destinationRoot = await createTemporaryDirectory();
    const destination = join(destinationRoot, 'destino');
    await symlink(target, destination);

    await expect(
      new GitWorktreeTemplateSource({
        sourceDirectory: fixture.directory,
        expectedRepository: template.repository,
        expectedCommit: fixture.commit,
      }).materialize(template, destination),
    ).rejects.toThrow('O destino do template deve ser um diretório seguro');
    await expect(readdir(target)).resolves.toEqual([]);
  });
});

async function createRepository(): Promise<{
  directory: string;
  commit: string;
}> {
  const directory = await createTemporaryDirectory();
  await git(directory, ['init']);
  await git(directory, ['config', 'user.email', 'tests@example.com']);
  await git(directory, ['config', 'user.name', 'Testes']);
  await git(directory, [
    'remote',
    'add',
    'origin',
    'https://github.com/jptecno/template-api-nodejs-typescript.git',
  ]);
  await writeFile(join(directory, 'arquivo.txt'), 'conteúdo confirmado');
  await git(directory, ['add', 'arquivo.txt']);

  return { directory, commit: await createCommit(directory, 'commit inicial') };
}

async function createCommit(
  directory: string,
  message: string,
): Promise<string> {
  await git(directory, ['commit', '-m', message]);
  return (await git(directory, ['rev-parse', 'HEAD'])).trim();
}

async function git(directory: string, arguments_: string[]): Promise<string> {
  const { stdout } = await executeFile('git', ['-C', directory, ...arguments_]);
  return stdout;
}

async function createTemporaryDirectory(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'jp-git-worktree-test-'));
  temporaryDirectories.push(directory);
  return directory;
}
