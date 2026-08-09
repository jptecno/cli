import { access, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { CliError } from '../../src/application/cli-error.js';
import type { LoadedTrustedRegistry } from '../../src/application/load-trusted-registry.js';
import { runCli } from '../../src/application/run-cli.js';
import type {
  CommandExecutor,
  Prompt,
  TemplateSource,
} from '../../src/contracts/cli-ports.js';
import type {
  NodeToolchain,
  ToolInspector,
} from '../../src/contracts/node-toolchain.types.js';

const registry: LoadedTrustedRegistry = {
  source: 'network',
  freshness: 'fresh',
  registry: {
    schemaVersion: 2,
    revision: 1,
    publishedAt: '2026-08-08T12:00:00Z',
    templates: [
      {
        id: 'api-nodejs-typescript',
        name: 'API Node.js + TypeScript',
        description: 'Template de API',
        repository: 'jptecno/template-api-nodejs-typescript',
        versions: [
          {
            version: 'v0.3.2',
            ref: 'v0.3.2',
            commit: 'a'.repeat(40),
            status: 'active',
          },
        ],
      },
      {
        id: 'deprecated',
        name: 'Deprecated',
        description: 'Não aparece',
        repository: 'jptecno/deprecated',
        versions: [
          {
            version: 'v1.0.0',
            ref: 'v1.0.0',
            commit: 'b'.repeat(40),
            status: 'deprecated',
          },
        ],
      },
    ],
  },
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
  it('lista somente templates ativos depois de carregar o catálogo confiável', async () => {
    const logs: string[] = [];
    let loaded = 0;

    const exitCode = await runCli(
      ['template', 'list'],
      createDependencies({
        loadTrustedRegistry: async () => {
          loaded += 1;
          return registry;
        },
        log: (message) => logs.push(message),
      }),
    );

    expect(exitCode).toBe(0);
    expect(loaded).toBe(1);
    expect(logs.join('\n')).toContain('api-nodejs-typescript');
    expect(logs.join('\n')).not.toContain('deprecated');
  });

  it('exige autorização para lista non-TTY com catálogo stale', async () => {
    const errors: string[] = [];

    const exitCode = await runCli(
      ['template', 'list'],
      createDependencies({
        loadTrustedRegistry: async () => ({
          ...registry,
          freshness: 'stale',
          source: 'cache',
        }),
        errorLog: (message) => errors.push(message),
      }),
    );

    expect(exitCode).toBe(1);
    expect(errors).toEqual([
      'Erro: É necessária autorização para usar o catálogo desatualizado',
    ]);
  });

  it('permite lista non-TTY stale com --allow-stale-registry', async () => {
    await expect(
      runCli(
        ['template', 'list', '--allow-stale-registry'],
        createDependencies({
          loadTrustedRegistry: async () => ({
            ...registry,
            freshness: 'stale',
            source: 'cache',
          }),
        }),
      ),
    ).resolves.toBe(0);
  });

  it('encaminha as duas autorizações stale ao init', async () => {
    const destination = await createTemporaryDirectory();

    await expect(
      runCli(
        [
          'init',
          destination,
          '--template',
          'api-nodejs-typescript',
          '--no-git',
          '--allow-stale-registry',
          '--allow-stale-template-creation',
        ],
        createDependencies({
          loadTrustedRegistry: async () => ({
            ...registry,
            freshness: 'stale',
            source: 'cache',
          }),
        }),
      ),
    ).resolves.toBe(0);

    await expect(access(destination)).resolves.toBeUndefined();
  });

  it('preserva o resultado de falha da toolchain após criar o projeto', async () => {
    const destination = await createTemporaryDirectory();
    const errors: string[] = [];

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
        templateSource: createTemplateSource({
          ...defaultToolchain,
          steps: {
            lint: {
              command: 'npm',
              args: ['run', 'lint'],
              dependsOn: [],
              recommended: true,
            },
          },
        }),
        commandExecutor: {
          run: async () => {
            throw new CliError('erro interno');
          },
        },
        errorLog: (message) => errors.push(message),
      }),
    );

    expect(exitCode).toBe(1);
    expect(errors).toContain('Toolchain: lint falhou.');
    await expect(access(destination)).resolves.toBeUndefined();
  });

  it('não carrega o catálogo para ajuda e versão', async () => {
    let loaded = 0;
    const dependencies = createDependencies({
      loadTrustedRegistry: async () => {
        loaded += 1;
        return registry;
      },
    });

    await expect(runCli(['--help'], dependencies)).resolves.toBe(0);
    await expect(runCli(['--version'], dependencies)).resolves.toBe(0);
    expect(loaded).toBe(0);
  });
});

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

function createPrompt(): Prompt {
  return {
    isInteractive: () => false,
    ask: async (_question, defaultValue) => defaultValue ?? '',
    confirm: async () => true,
    selectTemplate: async () => 'api-nodejs-typescript',
  };
}

type RunCliTestDependencies = {
  loadTrustedRegistry: () => Promise<LoadedTrustedRegistry>;
  templateSource: TemplateSource;
  commandExecutor: CommandExecutor;
  toolInspector: ToolInspector;
  prompt: Prompt;
  cliVersion: string;
  log: (message: string) => void;
  errorLog: (message: string) => void;
};

function createDependencies(
  overrides: Partial<RunCliTestDependencies> = {},
): RunCliTestDependencies {
  return {
    loadTrustedRegistry:
      overrides.loadTrustedRegistry ?? (async () => registry),
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

async function createTemporaryDirectory(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'jp-cli-run-test-'));
  temporaryDirectories.push(directory);
  return directory;
}
