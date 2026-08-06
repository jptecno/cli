import type {
  CommandExecutor,
  Prompt,
  RegistryClient,
  TemplateSource,
} from '../contracts/cli-ports.js';
import { CliError } from './cli-error.js';
import { createProject } from './create-project.js';
import { formatTemplateList } from './format-template-list.js';
import { buildHelpText, parseCliCommand } from './parse-cli-command.js';

export interface RunCliDependencies {
  registryClient: RegistryClient;
  templateSource: TemplateSource;
  commandExecutor: CommandExecutor;
  prompt: Prompt;
  cliVersion: string;
  log: (message: string) => void;
  errorLog: (message: string) => void;
}

const successExitCode = 0;
const failureExitCode = 1;

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

    warnWhenRegistryIsCustom(command.isCustomRegistry, dependencies.errorLog);

    const registry = await dependencies.registryClient.load(
      command.registryUrl,
    );

    if (command.kind === 'template-list') {
      dependencies.log(formatTemplateList(registry.templates));
      return successExitCode;
    }

    const templateId =
      command.templateId ??
      (await dependencies.prompt.selectTemplate(registry.templates));
    const template = await createProject(
      registry,
      { ...command, templateId },
      {
        templateSource: dependencies.templateSource,
        commandExecutor: dependencies.commandExecutor,
        prompt: dependencies.prompt,
      },
    );

    dependencies.log(
      `Projeto criado com ${template.name} ${template.version} em ${command.destination}`,
    );
    return successExitCode;
  } catch (error) {
    dependencies.errorLog(`Erro: ${buildFallbackErrorMessage(error, argv)}`);
    return failureExitCode;
  }
}

function warnWhenRegistryIsCustom(
  isCustomRegistry: boolean,
  errorLog: (message: string) => void,
): void {
  if (!isCustomRegistry) {
    return;
  }

  errorLog(
    'Aviso: usando um registry de terceiros. Um registry controla qual ' +
      'código (template) é baixado e executado neste computador; use apenas ' +
      'registries em que você confia.',
  );
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
