import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { CliError } from '../../src/application/cli-error.js';
import { runCli } from '../../src/application/run-cli.js';

import type {
  CommandExecutor,
  Prompt,
  RegistryClient,
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

describe('runCli', () => {
  it('imprime a lista de templates em jp template list', async () => {
    const logs: string[] = [];
    const exitCode = await runCli(
      ['template', 'list'],
      createDependencies({ log: (message) => logs.push(message) }),
    );

    expect(exitCode).toBe(0);
    expect(logs.join('\n')).toContain('api-nodejs-typescript');
  });

  it('sai com 0 e mostra a ajuda em --help', async () => {
    const logs: string[] = [];
    const exitCode = await runCli(
      ['--help'],
      createDependencies({ log: (message) => logs.push(message) }),
    );

    expect(exitCode).toBe(0);
    expect(logs.join('\n')).toContain('jp init <diretório>');
  });

  it('sai com 0 e mostra a ajuda quando não há argumentos', async () => {
    const logs: string[] = [];
    const exitCode = await runCli(
      [],
      createDependencies({ log: (message) => logs.push(message) }),
    );

    expect(exitCode).toBe(0);
    expect(logs.join('\n')).toContain('jp template list');
  });

  it('sai com 0 e mostra a versão em --version', async () => {
    const logs: string[] = [];
    const exitCode = await runCli(
      ['--version'],
      createDependencies({
        cliVersion: '9.9.9',
        log: (message) => logs.push(message),
      }),
    );

    expect(exitCode).toBe(0);
    expect(logs).toEqual(['jp 9.9.9']);
  });

  it('cria o projeto com o template informado e imprime o resultado', async () => {
    const destination = await createTemporaryDirectory();
    const logs: string[] = [];
    const exitCode = await runCli(
      ['init', destination, '--template', 'api-nodejs-typescript', '--no-git'],
      createDependencies({
        log: (message) => logs.push(message),
        templateSource: {
          materialize: async (_template, target) => {
            await writeFile(
              join(target, 'template.json'),
              JSON.stringify({
                schemaVersion: 1,
                id: 'api-nodejs-typescript',
                name: 'API Node.js + TypeScript',
                description: 'Template de API',
                repository: 'jptecno/template-api-nodejs-typescript',
                variables: [],
                render: { include: [] },
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
            );
          },
        },
      }),
    );

    expect(exitCode).toBe(0);
    expect(logs.join('\n')).toContain('Projeto criado com');
  });

  it('converte um CliError em exit 1 com a mensagem original', async () => {
    const errors: string[] = [];
    const exitCode = await runCli(
      ['template', 'list'],
      createDependencies({
        registryClient: {
          load: async () => {
            throw new CliError('Não foi possível acessar o catálogo');
          },
        },
        errorLog: (message) => errors.push(message),
      }),
    );

    expect(exitCode).toBe(1);
    expect(errors).toEqual(['Erro: Não foi possível acessar o catálogo']);
  });

  it('converte um erro inesperado em jp init com mensagem genérica sobre criar o projeto', async () => {
    const errors: string[] = [];
    const exitCode = await runCli(
      ['init', 'billing-api'],
      createDependencies({
        registryClient: {
          load: async () => {
            throw new Error('falha de rede desconhecida');
          },
        },
        errorLog: (message) => errors.push(message),
      }),
    );

    expect(exitCode).toBe(1);
    expect(errors).toEqual(['Erro: Erro inesperado ao criar o projeto']);
  });

  it('converte um erro inesperado em jp template list com mensagem genérica sobre listar templates', async () => {
    const errors: string[] = [];
    const exitCode = await runCli(
      ['template', 'list'],
      createDependencies({
        registryClient: {
          load: async () => {
            throw new Error('falha de rede desconhecida');
          },
        },
        errorLog: (message) => errors.push(message),
      }),
    );

    expect(exitCode).toBe(1);
    expect(errors).toEqual(['Erro: Erro inesperado ao listar os templates']);
  });

  it('avisa em stderr quando o registry informado não é o padrão', async () => {
    const errors: string[] = [];
    const exitCode = await runCli(
      ['template', 'list', '--registry', 'https://example.com/registry.json'],
      createDependencies({ errorLog: (message) => errors.push(message) }),
    );

    expect(exitCode).toBe(0);
    expect(errors.some((message) => message.includes('terceiros'))).toBe(true);
  });

  it('não avisa em stderr quando o registry padrão é usado', async () => {
    const errors: string[] = [];
    const exitCode = await runCli(
      ['template', 'list'],
      createDependencies({ errorLog: (message) => errors.push(message) }),
    );

    expect(exitCode).toBe(0);
    expect(errors).toEqual([]);
  });
});

async function createTemporaryDirectory(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'jp-cli-run-test-'));
  temporaryDirectories.push(directory);
  return directory;
}

function createDependencies(
  overrides: Partial<{
    registryClient: RegistryClient;
    templateSource: TemplateSource;
    commandExecutor: CommandExecutor;
    prompt: Prompt;
    cliVersion: string;
    log: (message: string) => void;
    errorLog: (message: string) => void;
  }> = {},
) {
  return {
    registryClient: overrides.registryClient ?? {
      load: async () => registry,
    },
    templateSource: overrides.templateSource ?? {
      materialize: async () => undefined,
    },
    commandExecutor: overrides.commandExecutor ?? {
      run: async () => undefined,
    },
    prompt: overrides.prompt ?? {
      ask: async (_question: string, defaultValue?: string) =>
        defaultValue ?? '',
      selectTemplate: async () => 'api-nodejs-typescript',
    },
    cliVersion: overrides.cliVersion ?? '0.0.0',
    log: overrides.log ?? (() => undefined),
    errorLog: overrides.errorLog ?? (() => undefined),
  };
}
