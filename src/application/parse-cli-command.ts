import { CliError } from './cli-error.js';

export interface InitCommandOptions {
  kind: 'init';
  destination: string;
  templateId?: string;
  registryUrl: string;
  values: Record<string, string>;
  installDependencies: boolean;
  initializeGit: boolean;
  validateProject: boolean;
}

export interface TemplateListCommandOptions {
  kind: 'template-list';
  registryUrl: string;
}

export type CliCommandOptions = InitCommandOptions | TemplateListCommandOptions;

const defaultRegistryUrl =
  'https://raw.githubusercontent.com/jptecno/template-registry/main/registry.json';

export function parseCliCommand(arguments_: string[]): CliCommandOptions {
  if (arguments_[0] === 'init') {
    return parseInitCommand(arguments_);
  }

  if (arguments_[0] === 'template' && arguments_[1] === 'list') {
    return parseTemplateListCommand(arguments_.slice(2));
  }

  throw new CliError(
    'Uso: jp init <diretório> [--template <id>] [--set chave=valor] ou jp template list',
  );
}

function parseInitCommand(arguments_: string[]): InitCommandOptions {
  const destination = arguments_[1];

  if (!destination || destination.startsWith('--')) {
    throw new CliError('Informe o diretório de destino: jp init <diretório>');
  }

  const options: InitCommandOptions = {
    kind: 'init',
    destination,
    registryUrl: defaultRegistryUrl,
    values: {},
    installDependencies: true,
    initializeGit: true,
    validateProject: true,
  };

  for (let index = 2; index < arguments_.length; index += 1) {
    const argument = arguments_[index];

    if (argument === '--no-install') {
      options.installDependencies = false;
      options.validateProject = false;
      continue;
    }

    if (argument === '--no-git') {
      options.initializeGit = false;
      continue;
    }

    if (argument === '--no-validate') {
      options.validateProject = false;
      continue;
    }

    const value = arguments_[index + 1];

    if (!value) {
      throw new CliError(`A opção ${argument} exige um valor`);
    }

    if (argument === '--template') {
      options.templateId = value;
    } else if (argument === '--registry') {
      options.registryUrl = value;
    } else if (argument === '--set') {
      const separator = value.indexOf('=');
      const name = value.slice(0, separator);
      const variableValue = value.slice(separator + 1);

      if (separator < 1) {
        throw new CliError('Use --set no formato chave=valor');
      }

      options.values[name] = variableValue;
    } else {
      throw new CliError(`Opção desconhecida: ${argument}`);
    }

    index += 1;
  }

  return options;
}

function parseTemplateListCommand(
  arguments_: string[],
): TemplateListCommandOptions {
  const options: TemplateListCommandOptions = {
    kind: 'template-list',
    registryUrl: defaultRegistryUrl,
  };

  for (let index = 0; index < arguments_.length; index += 1) {
    const argument = arguments_[index];

    if (argument !== '--registry') {
      throw new CliError(`Opção desconhecida: ${argument}`);
    }

    const value = arguments_[index + 1];

    if (!value) {
      throw new CliError('A opção --registry exige um valor');
    }

    options.registryUrl = value;
    index += 1;
  }

  return options;
}
