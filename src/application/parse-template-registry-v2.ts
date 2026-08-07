import type {
  RegistryContext,
  TemplateDefinitionV2,
  TemplateRegistryV2,
} from '../contracts/template-registry-v2.types.js';
import { CliError } from './cli-error.js';
import { assertTemplateRegistryV2Schema } from './validate-external-document.js';

export function parseTemplateRegistryV2(
  value: unknown,
  context: RegistryContext = 'official',
): TemplateRegistryV2 {
  assertTemplateRegistryV2Schema(value, context);

  validatePublishedAt(value.publishedAt);
  validateTemplateIds(value.templates);

  for (const template of value.templates) {
    validateTemplate(template, context);
  }

  validateReplacements(value);

  return value;
}

function validatePublishedAt(publishedAt: string): void {
  const date = new Date(publishedAt);

  if (Number.isNaN(date.getTime())) {
    throw new CliError('A data de publicação do catálogo é inválida');
  }

  const match =
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d+))?Z$/.exec(
      publishedAt,
    );
  if (match === null) {
    throw new CliError('A data de publicação do catálogo é inválida');
  }

  const [, year, month, day, hour, minute, second, fraction] = match;
  const milliseconds = Number((fraction ?? '').padEnd(3, '0').slice(0, 3));

  if (
    date.getUTCFullYear() !== Number(year) ||
    date.getUTCMonth() + 1 !== Number(month) ||
    date.getUTCDate() !== Number(day) ||
    date.getUTCHours() !== Number(hour) ||
    date.getUTCMinutes() !== Number(minute) ||
    date.getUTCSeconds() !== Number(second) ||
    date.getUTCMilliseconds() !== milliseconds
  ) {
    throw new CliError('A data de publicação do catálogo é inválida');
  }
}

function validateTemplateIds(templates: TemplateDefinitionV2[]): void {
  const ids = new Set<string>();

  for (const { id } of templates) {
    if (ids.has(id)) {
      throw new CliError(
        'O catálogo possui identificadores de template duplicados',
      );
    }
    ids.add(id);
  }
}

function validateTemplate(
  template: TemplateDefinitionV2,
  context: RegistryContext,
): void {
  if (context === 'official' && !template.repository.startsWith('jptecno/')) {
    throw new CliError(
      'O catálogo oficial contém um repositório não autorizado',
    );
  }

  const versions = new Set<string>();
  let activeVersions = 0;

  for (const version of template.versions) {
    if (versions.has(version.version)) {
      throw new CliError('O template possui versões duplicadas');
    }
    versions.add(version.version);

    if (version.version !== version.ref) {
      throw new CliError(
        'A versão e a referência do template devem ser iguais',
      );
    }

    if (!/^[0-9a-f]{40}$/.test(version.commit)) {
      throw new CliError(
        'O commit do template deve ter 40 caracteres hexadecimais',
      );
    }

    if (version.status === 'active') {
      activeVersions += 1;
    }
  }

  if (activeVersions !== 1) {
    throw new CliError('O template deve possuir exatamente uma versão ativa');
  }
}

function validateReplacements(registry: TemplateRegistryV2): void {
  const templatesById = new Map(
    registry.templates.map((template) => [template.id, template]),
  );

  for (const template of registry.templates) {
    for (const version of template.versions) {
      if (version.replacement === undefined) {
        continue;
      }

      const replacement = templatesById.get(version.replacement);
      if (replacement === undefined || replacement.id === template.id) {
        throw new CliError(
          'A substituição do template deve referenciar outro template existente',
        );
      }

      if (!replacement.versions.some((item) => item.status === 'active')) {
        throw new CliError(
          'A substituição do template não possui versão ativa disponível',
        );
      }
    }
  }
}
