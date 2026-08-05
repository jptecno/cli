import {
  access,
  mkdtemp,
  readFile,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';
import { CliError } from '../../src/application/cli-error.js';
import { createProject } from '../../src/application/create-project.js';

import type {
  CommandExecutor,
  Prompt,
  TemplateSource,
} from '../../src/contracts/cli-ports.js';
import type { TemplateRegistry } from '../../src/contracts/template-registry.types.js';

const registry: TemplateRegistry = {
  schemaVersion: 1,
  templates: [
    {
      id: 'api-nodejs-typescript',
      name: 'API Node.js + TypeScript',
      description: 'Template de API',
      repository: 'jptecno/template-api-nodejs-typescript',
      version: 'v0.1.0',
      ref: 'v0.1.0',
    },
  ],
};

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { force: true, recursive: true })),
  );
});

describe('createProject', () => {
  it('renderiza o template e executa somente os comandos selecionados', async () => {
    const destination = await createTemporaryDirectory();
    const commands: Array<{
      command: string;
      arguments_: string[];
      cwd: string;
    }> = [];

    const template = await createProject(
      registry,
      {
        destination,
        templateId: 'api-nodejs-typescript',
        values: { projectName: 'billing-api' },
        initializeGit: true,
        installDependencies: true,
        validateProject: true,
      },
      {
        templateSource: createTemplateSource(),
        commandExecutor: {
          run: async (command, arguments_, cwd) => {
            commands.push({ command, arguments_, cwd });
          },
        },
        prompt: createPrompt(),
      },
    );

    expect(template.id).toBe('api-nodejs-typescript');
    await expect(
      readFile(join(destination, 'package.json'), 'utf8'),
    ).resolves.toContain('billing-api');
    await expect(
      readFile(join(destination, 'package.json'), 'utf8'),
    ).resolves.toContain('Descrição padrão');
    await expect(
      readFile(join(destination, '.env.example'), 'utf8'),
    ).resolves.toContain('/billing-api');
    await expect(access(join(destination, 'template.json'))).rejects.toThrow();
    await expect(access(join(destination, 'TEMPLATE.md'))).rejects.toThrow();
    expect(commands).toEqual([
      { command: 'git', arguments_: ['init'], cwd: destination },
      { command: 'npm', arguments_: ['install'], cwd: destination },
      { command: 'npm', arguments_: ['run', 'check'], cwd: destination },
    ]);
  });

  it('preserva valores com aspas como dados JSON, sem injetar scripts npm', async () => {
    const destination = await createTemporaryDirectory();
    const description =
      'API "financeira", "scripts": {"preinstall":"malicioso"}';

    await createProject(
      registry,
      {
        destination,
        templateId: 'api-nodejs-typescript',
        values: { projectName: 'billing-api', description },
        initializeGit: false,
        installDependencies: false,
        validateProject: false,
      },
      {
        templateSource: createTemplateSource(),
        commandExecutor: createCommandExecutor(),
        prompt: createPrompt(),
      },
    );

    const packageJson = JSON.parse(
      await readFile(join(destination, 'package.json'), 'utf8'),
    ) as { description: string; scripts?: unknown };

    expect(packageJson.description).toBe(description);
    expect(packageJson.scripts).toBeUndefined();
  });

  it('rejeita arquivos declarados como links simbólicos', async () => {
    const destination = await createTemporaryDirectory();

    await expect(
      createProject(
        registry,
        {
          destination,
          templateId: 'api-nodejs-typescript',
          values: { projectName: 'billing-api' },
          initializeGit: false,
          installDependencies: false,
          validateProject: false,
        },
        {
          templateSource: {
            materialize: async (_template, target) => {
              await createTemplateSource().materialize(
                registry.templates[0],
                target,
              );
              await writeFile(
                join(target, 'outside.json'),
                '{"name":"outside"}',
              );
              await rm(join(target, 'package.json'));
              await symlink(
                join(target, 'outside.json'),
                join(target, 'package.json'),
              );
            },
          },
          commandExecutor: createCommandExecutor(),
          prompt: createPrompt(),
        },
      ),
    ).rejects.toThrow('O template declarou um arquivo inválido');
  });

  it('rejeita template.json quando é um link simbólico', async () => {
    const destination = await createTemporaryDirectory();

    await expect(
      createProject(
        registry,
        {
          destination,
          templateId: 'api-nodejs-typescript',
          values: { projectName: 'billing-api' },
          initializeGit: false,
          installDependencies: false,
          validateProject: false,
        },
        {
          templateSource: {
            materialize: async (_template, target) => {
              await createTemplateSource().materialize(
                registry.templates[0],
                target,
              );
              await writeFile(join(target, 'manifest-source.json'), '{}');
              await rm(join(target, 'template.json'));
              await symlink(
                join(target, 'manifest-source.json'),
                join(target, 'template.json'),
              );
            },
          },
          commandExecutor: createCommandExecutor(),
          prompt: createPrompt(),
        },
      ),
    ).rejects.toThrow('O template declarou um arquivo inválido');
  });

  it('não sobrescreve um diretório não vazio', async () => {
    const destination = await createTemporaryDirectory();
    await writeFile(join(destination, 'existing-file.txt'), 'preservar');

    await expect(
      createProject(
        registry,
        {
          destination,
          templateId: 'api-nodejs-typescript',
          values: { projectName: 'billing-api' },
          initializeGit: false,
          installDependencies: false,
          validateProject: false,
        },
        {
          templateSource: createTemplateSource(),
          commandExecutor: createCommandExecutor(),
          prompt: createPrompt(),
        },
      ),
    ).rejects.toThrow(
      new CliError(`O diretório de destino não está vazio: ${destination}`),
    );

    await expect(
      readFile(join(destination, 'existing-file.txt'), 'utf8'),
    ).resolves.toBe('preservar');
  });

  it('rejeita um valor que não atende ao padrão definido pelo template', async () => {
    const destination = await createTemporaryDirectory();

    await expect(
      createProject(
        registry,
        {
          destination,
          templateId: 'api-nodejs-typescript',
          values: { projectName: 'Billing API' },
          initializeGit: false,
          installDependencies: false,
          validateProject: false,
        },
        {
          templateSource: createTemplateSource(),
          commandExecutor: createCommandExecutor(),
          prompt: createPrompt(),
        },
      ),
    ).rejects.toThrow('O valor da variável projectName é inválido');
  });
});

function createTemplateSource(): TemplateSource {
  return {
    materialize: async (_template, destination) => {
      await Promise.all([
        writeFile(
          join(destination, 'template.json'),
          JSON.stringify({
            schemaVersion: 1,
            id: 'api-nodejs-typescript',
            name: 'API Node.js + TypeScript',
            description: 'Template de API',
            variables: [
              {
                name: 'projectName',
                prompt: 'Nome do projeto',
                required: true,
                pattern: '^[a-z0-9]+(?:-[a-z0-9]+)*$',
              },
              {
                name: 'description',
                prompt: 'Descrição do projeto',
                required: false,
                default: 'Descrição padrão',
              },
            ],
            render: {
              include: [
                'package.json',
                'package-lock.json',
                '.env.example',
                'README.md',
              ],
            },
            postCreate: {
              packageManager: 'npm',
              installCommand: 'npm install',
              validateCommand: 'npm run check',
            },
          }),
        ),
        writeFile(
          join(destination, 'package.json'),
          '{"name":"{{projectName}}","description":"{{description}}"}',
        ),
        writeFile(
          join(destination, 'package-lock.json'),
          '{"name":"{{projectName}}","description":"{{description}}"}',
        ),
        writeFile(
          join(destination, '.env.example'),
          'DATABASE_URL=postgresql://localhost/{{projectName}}',
        ),
        writeFile(
          join(destination, 'README.md'),
          '# {{projectName}}\n\n{{description}}',
        ),
        writeFile(join(destination, 'TEMPLATE.md'), 'Metadados do template'),
      ]);
    },
  };
}

function createCommandExecutor(): CommandExecutor {
  return { run: async () => undefined };
}

function createPrompt(): Prompt {
  return {
    ask: async (_question, defaultValue) => defaultValue ?? '',
    selectTemplate: async () => 'api-nodejs-typescript',
  };
}

async function createTemporaryDirectory(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'jp-cli-test-'));
  temporaryDirectories.push(directory);
  return directory;
}
