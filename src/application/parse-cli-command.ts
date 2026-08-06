import { CliError } from './cli-error.js';

export interface InitCommandOptions {
  kind: 'init';
  destination: string;
  templateId?: string;
  registryUrl: string;
  isCustomRegistry: boolean;
  values: Record<string, string>;
  installDependencies: boolean;
  initializeGit: boolean;
  validateProject: boolean;
}

export interface TemplateListCommandOptions {
  kind: 'template-list';
  registryUrl: string;
  isCustomRegistry: boolean;
}

export interface HelpCommandOptions {
  kind: 'help';
}

export interface VersionCommandOptions {
  kind: 'version';
}

export type CliCommandOptions =
  | InitCommandOptions
  | TemplateListCommandOptions
  | HelpCommandOptions
  | VersionCommandOptions;

const defaultRegistryUrl =
  'https://raw.githubusercontent.com/jptecno/template-registry/main/registry.json';

export function parseCliCommand(arguments_: string[]): CliCommandOptions {
  if (arguments_.length === 0 || isHelpFlag(arguments_[0])) {
    return { kind: 'help' };
  }

  if (isVersionFlag(arguments_[0])) {
    return { kind: 'version' };
  }

  if (arguments_[0] === 'init') {
    if (arguments_.some((argument) => isHelpFlag(argument))) {
      return { kind: 'help' };
    }

    return parseInitCommand(arguments_);
  }

  if (arguments_[0] === 'template' && arguments_[1] === 'list') {
    if (arguments_.some((argument) => isHelpFlag(argument))) {
      return { kind: 'help' };
    }

    return parseTemplateListCommand(arguments_.slice(2));
  }

  throw new CliError(
    `Comando desconhecido: ${arguments_[0]}. Use jp --help para ver os comandos disponíveis.`,
  );
}

export function buildHelpText(): string {
  return [
    'Uso:',
    '  jp init <diretório> [opções]',
    '  jp template list [--registry <url>]',
    '',
    'Opções:',
    '  --template <id>       Seleciona o template sem abrir o seletor.',
    '  --set chave=valor     Define uma variável do template. Pode ser repetido.',
    '  --registry <url>      Sobrescreve a URL do registry (exige https).',
    '  --no-git              Não executa git init.',
    '  --no-install          Não executa npm install nem npm run check.',
    '  --no-validate         Não executa npm run check.',
    '  --help, -h            Mostra esta ajuda.',
    '  --version, -v         Mostra a versão instalada.',
    '',
    'Exemplos:',
    '  jp init billing-api --template api-nodejs-typescript',
    '  jp template list',
  ].join('\n');
}

function isHelpFlag(argument: string | undefined): boolean {
  return argument === '--help' || argument === '-h' || argument === 'help';
}

function isVersionFlag(argument: string | undefined): boolean {
  return argument === '--version' || argument === '-v';
}

function resolveRegistryUrl(value: string): {
  registryUrl: string;
  isCustomRegistry: boolean;
} {
  let parsed: URL;

  try {
    parsed = new URL(value);
  } catch {
    throw new CliError(`URL de registry inválida: ${value}`);
  }

  if (parsed.protocol !== 'https:') {
    throw new CliError(
      `O registry deve usar https. Esquema recebido: ${parsed.protocol.replace(/:$/, '')}`,
    );
  }

  return { registryUrl: value, isCustomRegistry: value !== defaultRegistryUrl };
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
    isCustomRegistry: false,
    values: Object.create(null) as Record<string, string>,
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

    if (value.startsWith('--')) {
      throw new CliError(
        `A opção ${argument} exige um valor, não outra flag: ${value}`,
      );
    }

    if (argument === '--template') {
      options.templateId = value;
    } else if (argument === '--registry') {
      const resolved = resolveRegistryUrl(value);
      options.registryUrl = resolved.registryUrl;
      options.isCustomRegistry = resolved.isCustomRegistry;
    } else if (argument === '--set') {
      const separator = value.indexOf('=');

      if (separator < 1) {
        throw new CliError('Use --set no formato chave=valor');
      }

      const name = value.slice(0, separator);
      const variableValue = value.slice(separator + 1);
      options.values[name] = variableValue;
    } else {
      throw new CliError(
        `Opção desconhecida: ${argument}. Use jp --help para ver as opções disponíveis.`,
      );
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
    isCustomRegistry: false,
  };

  for (let index = 0; index < arguments_.length; index += 1) {
    const argument = arguments_[index];

    if (argument !== '--registry') {
      throw new CliError(
        `Opção desconhecida: ${argument}. Use jp --help para ver as opções disponíveis.`,
      );
    }

    const value = arguments_[index + 1];

    if (!value) {
      throw new CliError('A opção --registry exige um valor');
    }

    if (value.startsWith('--')) {
      throw new CliError(
        `A opção --registry exige um valor, não outra flag: ${value}`,
      );
    }

    const resolved = resolveRegistryUrl(value);
    options.registryUrl = resolved.registryUrl;
    options.isCustomRegistry = resolved.isCustomRegistry;
    index += 1;
  }

  return options;
}
