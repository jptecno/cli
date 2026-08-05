import { CliError } from './cli-error.js';

export interface InitCommandOptions {
  destination: string;
  templateId?: string;
  registryUrl: string;
  values: Record<string, string>;
  installDependencies: boolean;
  initializeGit: boolean;
  validateProject: boolean;
}

const defaultRegistryUrl =
  'https://raw.githubusercontent.com/jptecno/template-registry/main/registry.json';

export function parseInitCommand(arguments_: string[]): InitCommandOptions {
  if (arguments_[0] !== 'init') {
    throw new CliError(
      'Uso: jp init <diretório> [--template <id>] [--set chave=valor]',
    );
  }

  const destination = arguments_[1];

  if (!destination || destination.startsWith('--')) {
    throw new CliError('Informe o diretório de destino: jp init <diretório>');
  }

  const options: InitCommandOptions = {
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
