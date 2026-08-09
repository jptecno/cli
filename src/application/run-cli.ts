import type {
  CommandExecutor,
  Prompt,
  TemplateSource,
} from '../contracts/cli-ports.js';
import type { ToolInspector } from '../contracts/node-toolchain.types.js';
import {
  applyTrustedRegistry,
  projectActiveTemplates,
} from './apply-trusted-registry.js';
import { authorizeStaleRegistryUse } from './authorize-stale-registry.js';
import { CliError } from './cli-error.js';
import { executeToolchainPlan } from './execute-toolchain-plan.js';
import { formatTemplateList } from './format-template-list.js';
import type { LoadedTrustedRegistry } from './load-trusted-registry.js';
import {
  buildHelpText,
  type InitCommandOptions,
  parseCliCommand,
} from './parse-cli-command.js';
import type {
  ToolchainExecutionResult,
  ToolchainStepName,
} from './toolchain.types.js';

export interface RunCliDependencies {
  loadTrustedRegistry: () => Promise<LoadedTrustedRegistry>;
  templateSource: TemplateSource;
  commandExecutor: CommandExecutor;
  toolInspector: ToolInspector;
  prompt: Prompt;
  cliVersion: string;
  log: (message: string) => void;
  errorLog: (message: string) => void;
}

const successExitCode = 0;
const failureExitCode = 1;
const validationSteps: ToolchainStepName[] = [
  'formatCheck',
  'lint',
  'typecheck',
  'test',
  'build',
];

export async function runCli(
  argv: string[],
  dependencies: RunCliDependencies,
): Promise<number> {
  try {
    const command = parseCliCommand(argv);

    if (command.kind === 'help') {
      dependencies.log(buildHelpText());
      return successExitCode;
    }

    if (command.kind === 'version') {
      dependencies.log(`jp ${dependencies.cliVersion}`);
      return successExitCode;
    }

    const loadedRegistry = await dependencies.loadTrustedRegistry();

    if (command.kind === 'template-list') {
      await authorizeStaleRegistryUse(
        loadedRegistry,
        {
          allowStaleRegistry: command.allowStaleRegistry,
          allowStaleTemplateCreation: false,
        },
        { prompt: dependencies.prompt },
      );
      dependencies.log(
        formatTemplateList(projectActiveTemplates(loadedRegistry.registry)),
      );
      return successExitCode;
    }

    const project = await applyTrustedRegistry(loadedRegistry, command, {
      templateSource: dependencies.templateSource,
      commandExecutor: dependencies.commandExecutor,
      prompt: dependencies.prompt,
    });

    dependencies.log(
      `Projeto criado com ${project.template.name} ${project.template.version} em ${command.destination}`,
    );

    if (!shouldExecuteToolchain(command, dependencies.prompt)) {
      return successExitCode;
    }

    const result = await executeToolchainPlan(
      project.toolchain,
      {
        cwd: command.destination,
        requestedSteps: requestedSteps(command, project.toolchain.steps),
      },
      {
        toolInspector: dependencies.toolInspector,
        run: (tool, args, cwd) =>
          dependencies.commandExecutor.run(tool, args, cwd),
        shouldRun: (step, definition) =>
          shouldRunToolchainStep(
            command,
            step,
            definition.recommended,
            dependencies.prompt,
          ),
      },
    );

    reportToolchainStatuses(result, dependencies.errorLog);
    return result.exitCode;
  } catch (error) {
    dependencies.errorLog(`Erro: ${buildFallbackErrorMessage(error, argv)}`);
    return failureExitCode;
  }
}

function shouldExecuteToolchain(
  command: InitCommandOptions,
  prompt: Prompt,
): boolean {
  return (
    command.install ||
    command.noInstall ||
    command.validate ||
    prompt.isInteractive()
  );
}

function requestedSteps(
  command: InitCommandOptions,
  steps: Partial<Record<ToolchainStepName, unknown>>,
): ToolchainStepName[] {
  if (command.install) {
    return ['install'];
  }

  if (command.validate) {
    return validationSteps.filter((step) => steps[step] !== undefined);
  }

  return [];
}

function shouldRunToolchainStep(
  command: InitCommandOptions,
  step: ToolchainStepName,
  recommended: boolean,
  prompt: Prompt,
): Promise<boolean> {
  if (command.install) {
    return Promise.resolve(step === 'install');
  }

  if (command.noInstall || command.validate) {
    return Promise.resolve(step !== 'install' && command.validate);
  }

  return prompt.confirm(`Executar ${formatStepName(step)}?`, recommended);
}

function reportToolchainStatuses(
  result: ToolchainExecutionResult,
  errorLog: (message: string) => void,
): void {
  for (const item of result.steps) {
    if (item.status === 'succeeded') {
      continue;
    }

    errorLog(
      `Toolchain: ${formatStepName(item.step)} ${formatStepStatus(item.status)}.`,
    );
  }
}

function formatStepName(step: ToolchainStepName): string {
  const names: Record<ToolchainStepName, string> = {
    install: 'instalação',
    formatCheck: 'verificação de formatação',
    lint: 'lint',
    typecheck: 'verificação de tipos',
    test: 'testes',
    build: 'build',
  };

  return names[step];
}

function formatStepStatus(
  status: Exclude<
    ToolchainExecutionResult['steps'][number]['status'],
    'succeeded'
  >,
): string {
  const statuses = {
    failed: 'falhou',
    declined: 'não foi executada',
    'blocked-requirement': 'foi bloqueada por requisito não atendido',
    'skipped-dependency': 'foi ignorada por dependência não concluída',
  } as const;

  return statuses[status];
}

function buildFallbackErrorMessage(error: unknown, argv: string[]): string {
  if (error instanceof CliError) {
    return error.message;
  }

  if (argv[0] === 'init') {
    return 'Erro inesperado ao criar o projeto';
  }

  if (argv[0] === 'template') {
    return 'Erro inesperado ao listar os templates';
  }

  return 'Erro inesperado ao executar o comando';
}
