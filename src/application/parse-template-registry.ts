import type {
  TemplateDefinition,
  TemplateRegistry,
} from '../contracts/template-registry.types.js';
import { CliError } from './cli-error.js';

export function parseTemplateRegistry(value: unknown): TemplateRegistry {
  if (
    !isRecord(value) ||
    value.schemaVersion !== 1 ||
    !Array.isArray(value.templates)
  ) {
    throw new CliError('O catálogo de templates possui formato inválido');
  }

  const templates = value.templates.map(parseTemplateDefinition);

  if (templates.length === 0) {
    throw new CliError('O catálogo de templates não possui entradas');
  }

  ensureTemplateIdsAreUnique(templates);

  return { schemaVersion: 1, templates };
}

function parseTemplateDefinition(value: unknown): TemplateDefinition {
  if (!isRecord(value)) {
    throw new CliError('Uma entrada do catálogo de templates é inválida');
  }

  const id = readRequiredString(value, 'id');
  const name = readRequiredString(value, 'name');
  const description = readRequiredString(value, 'description');
  const repository = readRequiredString(value, 'repository');
  const version = readRequiredString(value, 'version');
  const ref = readRequiredString(value, 'ref');

  if (!isKebabCase(id)) {
    throw new CliError(
      `O identificador do template deve usar kebab-case: ${id}`,
    );
  }

  if (!/^[\w.-]+\/[\w.-]+$/.test(repository)) {
    throw new CliError(
      `O repositório do template possui formato inválido: ${repository}`,
    );
  }

  if (!isImmutableVersion(ref) || version !== ref) {
    throw new CliError(`O template deve usar uma tag SemVer imutável: ${id}`);
  }

  return { id, name, description, repository, version, ref };
}

function ensureTemplateIdsAreUnique(templates: TemplateDefinition[]): void {
  const ids = new Set<string>();

  for (const template of templates) {
    if (ids.has(template.id)) {
      throw new CliError(
        'O catálogo possui identificadores de template duplicados: ' +
          template.id,
      );
    }

    ids.add(template.id);
  }
}

function isKebabCase(value: string): boolean {
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value);
}

function isImmutableVersion(value: string): boolean {
  return /^v\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(value);
}

function readRequiredString(
  value: Record<string, unknown>,
  field: string,
): string {
  const fieldValue = value[field];

  if (typeof fieldValue !== 'string' || fieldValue.trim() === '') {
    throw new CliError(
      `A entrada do catálogo possui o campo inválido: ${field}`,
    );
  }

  return fieldValue;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
