import { access, mkdtemp, rm, writeFile } from 'node:fs/promises';
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
import type {
  NodeToolchain,
  ToolInspector,
} from '../../src/contracts/node-toolchain.types.js';
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
const availableInspector: ToolInspector = {
  inspect: async () => ({ status: 'available', versionOutput: '99.0.0' }),
};

const defaultToolchain: NodeToolchain = {
  ecosystem: 'node',
  requirements: [
    { tool: 'node', minimumVersion: '1.0.0' },
    { tool: 'npm', minimumVersion: '1.0.0' },
  ],
  steps: {
    install: {
      command: 'npm',
      args: ['install'],
      dependsOn: [],
      recommended: true,
    },
  },
};

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

  it('sai com 0 e mostra ajuda e versão', async () => {
    const logs: string[] = [];

    await expect(
      runCli(
        ['--help'],
        createDependencies({ log: (message) => logs.push(message) }),
      ),
    ).resolves.toBe(0);
    await expect(
      runCli(
        ['--version'],
        createDependencies({
          cliVersion: '9.9.9',
          log: (message) => logs.push(message),
        }),
      ),
    ).resolves.toBe(0);

    expect(logs.join('\n')).toContain('--validate');
    expect(logs).toContain('jp 9.9.9');
  });

  it('não inspeciona nem executa toolchain sem flags em entrada não interativa', async () => {
    const destination = await createTemporaryDirectory();
    const commands: string[][] = [];
    let inspections = 0;

    const exitCode = await runCli(
      ['init', destination, '--template', 'api-nodejs-typescript', '--no-git'],
      createDependencies({
        templateSource: createTemplateSource(defaultToolchain),
        commandExecutor: captureCommands(commands),
        toolInspector: {
          inspect: async () => {
            inspections += 1;
            return { status: 'available', versionOutput: '99.0.0' };
          },
        },
      }),
    );

    expect(exitCode).toBe(0);
    expect(inspections).toBe(0);
    expect(commands).toEqual([]);
  });

  it('em TTY pergunta cada etapa elegível na ordem canônica e usa o padrão recomendado', async () => {
    const destination = await createTemporaryDirectory();
    const commands: string[][] = [];
    const confirmations: Array<{ question: string; defaultValue: boolean }> =
      [];
    const toolchain = withSteps({
      install: step(['install'], [], true),
      lint: step(['run', 'lint'], ['install'], false),
    });

    const exitCode = await runCli(
      ['init', destination, '--template', 'api-nodejs-typescript', '--no-git'],
      createDependencies({
        templateSource: createTemplateSource(toolchain),
        commandExecutor: captureCommands(commands),
        prompt: createPrompt(true, async (question, defaultValue) => {
          confirmations.push({ question, defaultValue });
          return true;
        }),
      }),
    );

    expect(exitCode).toBe(0);
    expect(confirmations).toEqual([
      { question: 'Executar instalação?', defaultValue: true },
      { question: 'Executar lint?', defaultValue: false },
    ]);
    expect(commands).toEqual([
      ['npm', 'install'],
      ['npm', 'run', 'lint'],
    ]);
  });

  it('--install executa somente npm install sem prompt', async () => {
    const destination = await createTemporaryDirectory();
    const commands: string[][] = [];
    const confirm = async () => {
      throw new Error('não deve perguntar');
    };

    const exitCode = await runCli(
      [
        'init',
        destination,
        '--template',
        'api-nodejs-typescript',
        '--no-git',
        '--install',
      ],
      createDependencies({
        templateSource: createTemplateSource(
          withSteps({
            install: step(['install']),
            lint: step(['run', 'lint'], ['install']),
          }),
        ),
        commandExecutor: captureCommands(commands),
        prompt: createPrompt(true, confirm),
      }),
    );

    expect(exitCode).toBe(0);
    expect(commands).toEqual([['npm', 'install']]);
  });

  it('--validate executa somente validações declaradas e não executa instalação', async () => {
    const destination = await createTemporaryDirectory();
    const commands: string[][] = [];

    const exitCode = await runCli(
      [
        'init',
        destination,
        '--template',
        'api-nodejs-typescript',
        '--no-git',
        '--validate',
      ],
      createDependencies({
        templateSource: createTemplateSource(
          withSteps({
            install: step(['install']),
            lint: step(['run', 'lint']),
            test: step(['test']),
          }),
        ),
        commandExecutor: captureCommands(commands),
      }),
    );

    expect(exitCode).toBe(0);
    expect(commands).toEqual([
      ['npm', 'run', 'lint'],
      ['npm', 'test'],
    ]);
  });

  it('--no-install --validate mantém ramos independentes, ignora cascatas e falha para validação solicitada', async () => {
    const destination = await createTemporaryDirectory();
    const commands: string[][] = [];
    const errors: string[] = [];

    const exitCode = await runCli(
      [
        'init',
        destination,
        '--template',
        'api-nodejs-typescript',
        '--no-git',
        '--no-install',
        '--validate',
      ],
      createDependencies({
        templateSource: createTemplateSource(
          withSteps({
            install: step(['install']),
            lint: step(['run', 'lint']),
            test: step(['test'], ['install']),
          }),
        ),
        commandExecutor: captureCommands(commands),
        errorLog: (message) => errors.push(message),
      }),
    );

    expect(exitCode).toBe(1);
    expect(commands).toEqual([['npm', 'run', 'lint']]);
    expect(errors).toContain('Toolchain: instalação não foi executada.');
    expect(errors).toContain(
      'Toolchain: testes foi ignorada por dependência não concluída.',
    );
  });

  it('reporta requisito bloqueado sem expor o erro bruto da inspeção', async () => {
    const destination = await createTemporaryDirectory();
    const errors: string[] = [];

    const exitCode = await runCli(
      [
        'init',
        destination,
        '--template',
        'api-nodejs-typescript',
        '--no-git',
        '--install',
      ],
      createDependencies({
        templateSource: createTemplateSource(defaultToolchain),
        toolInspector: { inspect: async () => ({ status: 'failed' }) },
        errorLog: (message) => errors.push(message),
      }),
    );

    expect(exitCode).toBe(1);
    expect(errors).toEqual([
      'Toolchain: instalação foi bloqueada por requisito não atendido.',
    ]);
  });

  it('preserva o projeto renderizado quando uma etapa da toolchain falha', async () => {
    const destination = await createTemporaryDirectory();
    const commands: string[][] = [];

    const exitCode = await runCli(
      [
        'init',
        destination,
        '--template',
        'api-nodejs-typescript',
        '--no-git',
        '--validate',
      ],
      createDependencies({
        templateSource: createTemplateSource(
          withSteps({ lint: step(['run', 'lint']) }),
        ),
        commandExecutor: {
          run: async (command, args) => {
            commands.push([command, ...args]);
            throw new CliError('stderr sigiloso');
          },
        },
      }),
    );

    expect(exitCode).toBe(1);
    expect(commands).toEqual([['npm', 'run', 'lint']]);
    await expect(access(destination)).resolves.toBeUndefined();
  });

  it('converte CliError em exit 1 com a mensagem original', async () => {
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
});

function step(
  args: string[],
  dependsOn: Array<
    'install' | 'formatCheck' | 'lint' | 'typecheck' | 'test' | 'build'
  > = [],
  recommended = true,
) {
  return { command: 'npm' as const, args, dependsOn, recommended };
}

function withSteps(steps: NodeToolchain['steps']): NodeToolchain {
  return { ...defaultToolchain, steps };
}

function createTemplateSource(toolchain: NodeToolchain): TemplateSource {
  return {
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
          toolchain,
        }),
      );
    },
  };
}

function captureCommands(commands: string[][]): CommandExecutor {
  return {
    run: async (command, arguments_) => {
      commands.push([command, ...arguments_]);
    },
  };
}

function createPrompt(
  interactive = false,
  confirm: Prompt['confirm'] = async () => true,
): Prompt {
  return {
    isInteractive: () => interactive,
    ask: async (_question, defaultValue) => defaultValue ?? '',
    confirm,
    selectTemplate: async () => 'api-nodejs-typescript',
  };
}

function createDependencies(
  overrides: Partial<RunCliTestDependencies> = {},
): RunCliTestDependencies {
  return {
    registryClient: overrides.registryClient ?? { load: async () => registry },
    templateSource:
      overrides.templateSource ?? createTemplateSource(defaultToolchain),
    commandExecutor: overrides.commandExecutor ?? {
      run: async () => undefined,
    },
    toolInspector: overrides.toolInspector ?? availableInspector,
    prompt: overrides.prompt ?? createPrompt(),
    cliVersion: overrides.cliVersion ?? '0.0.0',
    log: overrides.log ?? (() => undefined),
    errorLog: overrides.errorLog ?? (() => undefined),
  };
}

type RunCliTestDependencies = {
  registryClient: RegistryClient;
  templateSource: TemplateSource;
  commandExecutor: CommandExecutor;
  toolInspector: ToolInspector;
  prompt: Prompt;
  cliVersion: string;
  log: (message: string) => void;
  errorLog: (message: string) => void;
};

async function createTemporaryDirectory(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'jp-cli-run-test-'));
  temporaryDirectories.push(directory);
  return directory;
}
