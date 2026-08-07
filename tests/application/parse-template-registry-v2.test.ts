import { describe, expect, it } from 'vitest';

import { CliError } from '../../src/application/cli-error.js';
import { parseTemplateRegistryV2 } from '../../src/application/parse-template-registry-v2.js';

function buildRegistry(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    schemaVersion: 2,
    revision: 4,
    publishedAt: '2026-08-07T12:00:00.123Z',
    templates: [
      {
        id: 'api',
        name: 'API',
        description: 'Template de API',
        repository: 'jptecno/template-api',
        versions: [
          {
            version: 'v2.0.0',
            ref: 'v2.0.0',
            commit: 'a'.repeat(40),
            status: 'active',
          },
          {
            version: 'v1.0.0',
            ref: 'v1.0.0',
            commit: 'b'.repeat(40),
            status: 'deprecated',
            statusReason: 'Use a versão atual',
          },
        ],
      },
      {
        id: 'web',
        name: 'Web',
        description: 'Template web',
        repository: 'jptecno/template-web',
        versions: [
          {
            version: 'v1.0.0',
            ref: 'v1.0.0',
            commit: 'c'.repeat(40),
            status: 'active',
          },
        ],
      },
    ],
    ...overrides,
  };
}

function firstTemplate(
  registry: Record<string, unknown>,
): Record<string, unknown> {
  const templates = registry.templates as Array<Record<string, unknown>>;
  const template = templates[0];
  if (template === undefined) {
    throw new Error('Fixture sem template');
  }
  return template;
}

function templateVersions(
  template: Record<string, unknown>,
): Array<Record<string, unknown>> {
  return template.versions as Array<Record<string, unknown>>;
}

function versionAt(
  versions: Array<Record<string, unknown>>,
  index: number,
): Record<string, unknown> {
  const version = versions[index];
  if (version === undefined) {
    throw new Error('Fixture sem versão');
  }
  return version;
}

describe('parseTemplateRegistryV2', () => {
  it('aceita histórico válido no contexto oficial', () => {
    const registry = parseTemplateRegistryV2(buildRegistry());

    expect(registry.revision).toBe(4);
    expect(registry.templates[0]?.versions).toHaveLength(2);
  });

  it('rejeita data UTC que existe no formato, mas não no calendário', () => {
    expect(() =>
      parseTemplateRegistryV2(
        buildRegistry({ publishedAt: '2026-02-30T12:00:00Z' }),
      ),
    ).toThrow('A data de publicação do catálogo é inválida');
  });

  it('rejeita owner não oficial no contexto oficial e o aceita no customizado', () => {
    const registry = buildRegistry();
    firstTemplate(registry).repository = 'terceiro/template-api';

    expect(() => parseTemplateRegistryV2(registry)).toThrow(
      'O catálogo de templates v2 possui formato inválido',
    );
    expect(() => parseTemplateRegistryV2(registry, 'custom')).not.toThrow();
  });

  it.each([
    (registry: Record<string, unknown>) => {
      const templates = registry.templates as Array<Record<string, unknown>>;
      templates.push({ ...firstTemplate(registry), id: 'api' });
    },
    (registry: Record<string, unknown>) => {
      const versions = templateVersions(firstTemplate(registry));
      versions.push({ ...versionAt(versions, 0) });
    },
    (registry: Record<string, unknown>) => {
      const versions = templateVersions(firstTemplate(registry));
      const deprecated = versionAt(versions, 1);
      deprecated.status = 'active';
      delete deprecated.statusReason;
    },
    (registry: Record<string, unknown>) => {
      const versions = templateVersions(firstTemplate(registry));
      versionAt(versions, 0).ref = 'v9.0.0';
    },
    (registry: Record<string, unknown>) => {
      const versions = templateVersions(firstTemplate(registry));
      versionAt(versions, 0).commit = 'A'.repeat(40);
    },
  ])('rejeita invariantes de IDs, versões, ativa, ref e commit', (change) => {
    const registry = buildRegistry();
    change(registry);

    expect(() => parseTemplateRegistryV2(registry)).toThrow(CliError);
  });

  it('rejeita replacement inexistente ou próprio', () => {
    for (const replacement of ['ausente', 'api']) {
      const registry = buildRegistry();
      const versions = templateVersions(firstTemplate(registry));
      versionAt(versions, 1).replacement = replacement;

      expect(() => parseTemplateRegistryV2(registry)).toThrow(CliError);
    }
  });
});
