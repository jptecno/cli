import { CliError } from './cli-error.js';

export interface InitCommandOptions {
  kind: 'init';
  destination: string;
  templateId?: string;
  values: Record<string, string>;
  initializeGit: boolean;
  install: boolean;
  noInstall: boolean;
  validate: boolean;
  allowStaleRegistry: boolean;
  allowStaleTemplateCreation: boolean;
}

export interface TemplateListCommandOptions {
  kind: 'template-list';
  allowStaleRegistry: boolean;
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
    '  jp template list [--allow-stale-registry]',
    '',
    'Opções:',
    '  --template <id>                  Seleciona o template sem abrir o seletor.',
    '  --set chave=valor                Define uma variável do template. Pode ser repetido.',
    '  --no-git                         Não executa git init.',
    '  --install                        Executa somente npm install após criar o projeto.',
    '  --no-install                     Não executa npm install.',
    '  --validate                       Executa as validações declaradas pelo template.',
    '  --allow-stale-registry           Autoriza usar catálogo desatualizado em modo não interativo.',
    '  --allow-stale-template-creation  Autoriza criar projeto com catálogo desatualizado em modo não interativo (somente init).',
    '  --help, -h                       Mostra esta ajuda.',
    '  --version, -v                    Mostra a versão instalada.',
    '',
    'Exemplos:',
    '  jp init billing-api --template api-nodejs-typescript',
    '  jp template list --allow-stale-registry',
  ].join('\n');
}

function isHelpFlag(argument: string | undefined): boolean {
  return argument === '--help' || argument === '-h' || argument === 'help';
}

function isVersionFlag(argument: string | undefined): boolean {
  return argument === '--version' || argument === '-v';
}

function parseInitCommand(arguments_: string[]): InitCommandOptions {
  const destination = arguments_[1];

  if (!destination || destination.startsWith('--')) {
    throw new CliError('Informe o diretório de destino: jp init <diretório>');
  }

  const options: InitCommandOptions = {
    kind: 'init',
    destination,
    values: Object.create(null) as Record<string, string>,
    initializeGit: true,
    install: false,
    noInstall: false,
    validate: false,
    allowStaleRegistry: false,
    allowStaleTemplateCreation: false,
  };

  for (let index = 2; index < arguments_.length; index += 1) {
    const argument = arguments_[index];

    if (argument === '--no-git') {
      options.initializeGit = false;
      continue;
    }

    if (argument === '--install') {
      options.install = true;
      continue;
    }

    if (argument === '--no-install') {
      options.noInstall = true;
      continue;
    }

    if (argument === '--validate') {
      options.validate = true;
      continue;
    }

    if (argument === '--allow-stale-registry') {
      options.allowStaleRegistry = true;
      continue;
    }

    if (argument === '--allow-stale-template-creation') {
      options.allowStaleTemplateCreation = true;
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

  if (options.install && options.noInstall) {
    throw new CliError(
      'As opções --install e --no-install não podem ser usadas juntas',
    );
  }

  if (options.install && options.validate) {
    throw new CliError(
      'As opções --install e --validate não podem ser usadas juntas',
    );
  }

  return options;
}

function parseTemplateListCommand(
  arguments_: string[],
): TemplateListCommandOptions {
  const options: TemplateListCommandOptions = {
    kind: 'template-list',
    allowStaleRegistry: false,
  };

  for (const argument of arguments_) {
    if (argument === '--allow-stale-registry') {
      options.allowStaleRegistry = true;
      continue;
    }

    throw new CliError(
      `Opção desconhecida: ${argument}. Use jp --help para ver as opções disponíveis.`,
    );
  }

  return options;
}
