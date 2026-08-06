import type {
  TemplateManifest,
  TemplateVariable,
} from '../contracts/template-manifest.types.js';
import { CliError } from './cli-error.js';

export function parseTemplateManifest(value: unknown): TemplateManifest {
  if (
    !isRecord(value) ||
    value.schemaVersion !== 1 ||
    !isRecord(value.render) ||
    !isRecord(value.postCreate)
  ) {
    throw new CliError('O manifesto do template possui formato inválido');
  }

  if (
    !isNonEmptyString(value.id) ||
    !isNonEmptyString(value.name) ||
    !isNonEmptyString(value.description)
  ) {
    throw new CliError('O manifesto do template possui metadados inválidos');
  }

  if (!Array.isArray(value.variables) || !Array.isArray(value.render.include)) {
    throw new CliError(
      'O manifesto do template possui variáveis ou arquivos inválidos',
    );
  }

  if (
    value.postCreate.packageManager !== 'npm' ||
    value.postCreate.installCommand !== 'npm install' ||
    value.postCreate.validateCommand !== 'npm run check'
  ) {
    throw new CliError(
      'O manifesto do template possui comandos pós-criação não permitidos',
    );
  }

  const variables = value.variables.map(parseTemplateVariable);
  ensureVariableNamesAreUnique(variables);

  return {
    schemaVersion: 1,
    id: value.id,
    name: value.name,
    description: value.description,
    variables,
    render: { include: value.render.include.map(parseRelativePath) },
    postCreate: {
      packageManager: 'npm',
      installCommand: 'npm install',
      validateCommand: 'npm run check',
    },
  };
}

function parseTemplateVariable(value: unknown): TemplateVariable {
  if (
    !isRecord(value) ||
    !isNonEmptyString(value.name) ||
    !isVariableName(value.name) ||
    !isNonEmptyString(value.prompt) ||
    typeof value.required !== 'boolean'
  ) {
    throw new CliError('O manifesto do template possui uma variável inválida');
  }

  if (value.pattern !== undefined && !isNonEmptyString(value.pattern)) {
    throw new CliError(`O padrão da variável ${value.name} é inválido`);
  }

  if (value.pattern !== undefined) {
    try {
      new RegExp(value.pattern);
    } catch {
      throw new CliError(`O padrão da variável ${value.name} é inválido`);
    }
  }

  if (value.default !== undefined && typeof value.default !== 'string') {
    throw new CliError(`O valor padrão da variável ${value.name} é inválido`);
  }

  return {
    name: value.name,
    prompt: value.prompt,
    required: value.required,
    pattern: value.pattern,
    default: value.default,
  };
}

function ensureVariableNamesAreUnique(variables: TemplateVariable[]): void {
  const names = new Set<string>();

  for (const variable of variables) {
    if (names.has(variable.name)) {
      throw new CliError(
        `O manifesto possui variáveis duplicadas: ${variable.name}`,
      );
    }

    names.add(variable.name);
  }
}

function isVariableName(value: string): boolean {
  return /^[A-Za-z][A-Za-z0-9_]*$/.test(value);
}

function parseRelativePath(value: unknown): string {
  if (
    !isNonEmptyString(value) ||
    value.includes('..') ||
    value.startsWith('/') ||
    value.startsWith('\\')
  ) {
    throw new CliError(
      'O manifesto do template possui um caminho de renderização inválido',
    );
  }

  return value;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim() !== '';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
