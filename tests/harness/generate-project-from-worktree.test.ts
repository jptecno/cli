import { execFile } from 'node:child_process';
import { access, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { generateProjectFromWorktree } from '../../src/harness/generate-project-from-worktree.js';

const executeFile = promisify(execFile);
const temporaryDirectories: string[] = [];
const repository = 'jptecno/template-api-nodejs-typescript';
const templateId = 'api-nodejs-typescript';

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { force: true, recursive: true })),
  );
});

describe('generateProjectFromWorktree', () => {
  it('gera e renderiza o projeto sem comandos pós-criação', async () => {
    const fixture = await createTemplateRepository();
    const destination = join(await createTemporaryDirectory(), 'billing-api');
    const run = vi.fn(async () => undefined);
    const inspect = vi.fn(async () => ({ status: 'unavailable' as const }));

    await expect(
      generateProjectFromWorktree(
        {
          sourceDirectory: fixture.directory,
          expectedRepository: repository,
          expectedCommit: fixture.commit,
          destination,
          templateId,
          variables: { projectName: 'billing-api' },
        },
        {
          commandExecutor: { run },
          toolInspector: { inspect },
        },
      ),
    ).resolves.toBe(0);

    expect(run).not.toHaveBeenCalled();
    expect(inspect).not.toHaveBeenCalled();

    await expect(
      readFile(join(destination, 'README.md'), 'utf8'),
    ).resolves.toBe('# billing-api\n');
    await expect(
      readFile(join(destination, 'package.json'), 'utf8').then(JSON.parse),
    ).resolves.toEqual({ name: 'billing-api' });
    await expect(
      access(join(destination, 'template.json')),
    ).rejects.toMatchObject({
      code: 'ENOENT',
    });
    await expect(access(join(destination, '.git'))).rejects.toMatchObject({
      code: 'ENOENT',
    });
    await expect(
      access(join(destination, 'node_modules')),
    ).rejects.toMatchObject({
      code: 'ENOENT',
    });
  });

  it('falha sem gravar o projeto quando o commit esperado não pertence ao worktree', async () => {
    const fixture = await createTemplateRepository();
    const destination = join(await createTemporaryDirectory(), 'billing-api');

    await expect(
      generateProjectFromWorktree({
        sourceDirectory: fixture.directory,
        expectedRepository: repository,
        expectedCommit: 'a'.repeat(40),
        destination,
        templateId,
        variables: { projectName: 'billing-api' },
      }),
    ).resolves.toBe(1);

    await expect(access(destination)).rejects.toMatchObject({ code: 'ENOENT' });
  });
});

async function createTemplateRepository(): Promise<{
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
  await Promise.all([
    writeFile(join(directory, 'README.md'), '# {{projectName}}\n'),
    writeFile(join(directory, 'package.json'), '{"name":"{{projectName}}"}\n'),
    writeFile(
      join(directory, 'template.json'),
      JSON.stringify({
        schemaVersion: 1,
        id: templateId,
        name: 'API Node.js + TypeScript',
        description: 'Template de API',
        repository,
        variables: [
          {
            name: 'projectName',
            prompt: 'Nome do projeto',
            required: true,
          },
        ],
        render: { include: ['README.md', 'package.json'] },
        toolchain: {
          ecosystem: 'node',
          requirements: [
            { tool: 'node', minimumVersion: '24.0.0' },
            { tool: 'npm', minimumVersion: '11.0.0' },
          ],
          steps: {
            install: {
              command: 'npm',
              args: ['install'],
              dependsOn: [],
              recommended: true,
            },
          },
        },
      }),
    ),
  ]);
  await git(directory, ['add', '.']);
  await git(directory, ['commit', '-m', 'template inicial']);

  return {
    directory,
    commit: (await git(directory, ['rev-parse', 'HEAD'])).trim(),
  };
}

async function git(directory: string, arguments_: string[]): Promise<string> {
  const { stdout } = await executeFile('git', ['-C', directory, ...arguments_]);
  return stdout;
}

async function createTemporaryDirectory(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'jp-project-generator-test-'));
  temporaryDirectories.push(directory);
  return directory;
}
