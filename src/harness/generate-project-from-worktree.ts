import { GitWorktreeTemplateSource } from '../adapters/git-worktree-template-source.js';
import type { CommandExecutor } from '../contracts/cli-ports.js';
import type { ToolInspector } from '../contracts/node-toolchain.types.js';
import { runCliHarness } from './cli-harness.js';

export interface GenerateProjectFromWorktreeOptions {
  sourceDirectory: string;
  expectedRepository: string;
  expectedCommit: string;
  destination: string;
  templateId: string;
  variables: Record<string, string>;
}

export interface GenerateProjectFromWorktreeDependencies {
  commandExecutor?: CommandExecutor;
  toolInspector?: ToolInspector;
}

/**
 * Gera um projeto a partir de um worktree local pelo mesmo fluxo do comando
 * `jp init`, sem depender da interface de linha de comando de produção.
 */
export function generateProjectFromWorktree(
  options: GenerateProjectFromWorktreeOptions,
  dependencies: GenerateProjectFromWorktreeDependencies = {},
): Promise<number> {
  return runCliHarness(
    [
      'init',
      options.destination,
      '--template',
      options.templateId,
      '--no-git',
      '--no-install',
      ...Object.entries(options.variables).flatMap(([name, value]) => [
        '--set',
        `${name}=${value}`,
      ]),
    ],
    {
      registry: {
        schemaVersion: 2,
        revision: 1,
        publishedAt: '2026-08-09T00:00:00.000Z',
        templates: [
          {
            id: options.templateId,
            name: options.templateId,
            description: `Template ${options.templateId}`,
            repository: options.expectedRepository,
            versions: [
              {
                version: 'v0.0.0',
                ref: 'v0.0.0',
                commit: options.expectedCommit,
                status: 'active',
              },
            ],
          },
        ],
      },
      templateSource: new GitWorktreeTemplateSource({
        sourceDirectory: options.sourceDirectory,
        expectedRepository: options.expectedRepository,
        expectedCommit: options.expectedCommit,
      }),
      commandExecutor: dependencies.commandExecutor ?? {
        run: async () => undefined,
      },
      toolInspector: dependencies.toolInspector ?? {
        inspect: async () => ({ status: 'unavailable' }),
      },
      prompt: {
        isInteractive: () => false,
        selectTemplate: async () => options.templateId,
        ask: async (_question, defaultValue) => defaultValue ?? '',
        confirm: async () => false,
      },
      cliVersion: 'harness',
      log: () => undefined,
      errorLog: () => undefined,
    },
  );
}
