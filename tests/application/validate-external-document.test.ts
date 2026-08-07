import { describe, expect, it } from 'vitest';

import { CliError } from '../../src/application/cli-error.js';
import {
  assertTemplateManifestV1Schema,
  assertTemplateRegistryV2Schema,
} from '../../src/application/validate-external-document.js';

function validRegistry(): unknown {
  return {
    schemaVersion: 2,
    revision: 1,
    publishedAt: '2026-08-07T12:00:00Z',
    templates: [
      {
        id: 'api',
        name: 'API',
        description: 'Template de API',
        repository: 'jptecno/template-api',
        versions: [
          {
            version: 'v1.0.0',
            ref: 'v1.0.0',
            commit: 'a'.repeat(40),
            status: 'active',
          },
        ],
      },
    ],
  };
}

function validManifest(): unknown {
  return {
    schemaVersion: 1,
    id: 'api',
    name: 'API',
    description: 'Template de API',
    repository: 'jptecno/template-api',
    variables: [],
    render: { include: ['src/index.ts'] },
    toolchain: {
      ecosystem: 'node',
      requirements: [{ tool: 'node', minimumVersion: '24.0.0' }],
      steps: {
        test: {
          command: 'npm',
          args: ['test'],
          dependsOn: [],
          recommended: true,
        },
      },
    },
  };
}

describe('validação estrutural de documentos externos', () => {
  it.each([null, 'texto', 42, []])(
    'rejeita registry v2 raiz inválida: %j',
    (value) => {
      expect(() => assertTemplateRegistryV2Schema(value)).toThrow(CliError);
    },
  );

  it.each([
    (registry: Record<string, unknown>) => delete registry.revision,
    (registry: Record<string, unknown>) => {
      registry.extra = 'não permitido';
    },
    (registry: Record<string, unknown>) => {
      registry.publishedAt = '2026-08-07';
    },
    (registry: Record<string, unknown>) => {
      registry.templates = [];
    },
    (registry: Record<string, unknown>) => {
      const templates = registry.templates as Array<Record<string, unknown>>;
      const template = templates[0];
      if (template === undefined) {
        throw new Error('Fixture sem template');
      }
      template.versions = [
        {
          version: 'v1.0.0',
          ref: 'v1.0.0',
          commit: 'a'.repeat(40),
          status: 'indefinido',
        },
      ];
    },
  ])('rejeita violações do schema do registry v2', (change) => {
    const registry = validRegistry() as Record<string, unknown>;
    change(registry);

    expect(() => assertTemplateRegistryV2Schema(registry)).toThrow(
      'O catálogo de templates v2 possui formato inválido',
    );
  });

  it('não ecoa conteúdo externo sensível nos erros do registry', () => {
    const registry = validRegistry() as Record<string, unknown>;
    registry.extra = 'https://token-secreto@exemplo.test/catalogo';

    expect(() => assertTemplateRegistryV2Schema(registry)).toThrow(
      'O catálogo de templates v2 possui formato inválido',
    );
    expect(() => assertTemplateRegistryV2Schema(registry)).not.toThrow(
      'token-secreto',
    );
  });

  it.each([null, 'texto', 42, []])(
    'rejeita manifesto v1 raiz inválida: %j',
    (value) => {
      expect(() => assertTemplateManifestV1Schema(value)).toThrow(CliError);
    },
  );

  it.each([
    (manifest: Record<string, unknown>) => delete manifest.toolchain,
    (manifest: Record<string, unknown>) => {
      manifest.postCreate = {};
    },
    (manifest: Record<string, unknown>) => {
      manifest.render = { include: ['../fora.txt'] };
    },
    (manifest: Record<string, unknown>) => {
      const toolchain = manifest.toolchain as Record<string, unknown>;
      toolchain.ecosystem = 'shell';
    },
    (manifest: Record<string, unknown>) => {
      const toolchain = manifest.toolchain as Record<string, unknown>;
      toolchain.steps = [];
    },
    (manifest: Record<string, unknown>) => {
      const toolchain = manifest.toolchain as Record<string, unknown>;
      toolchain.steps = {
        deploy: {
          command: 'npm',
          args: ['run', 'deploy'],
          dependsOn: [],
          recommended: true,
        },
      };
    },
    (manifest: Record<string, unknown>) => {
      const toolchain = manifest.toolchain as Record<string, unknown>;
      toolchain.steps = {
        test: {
          id: 'test',
          command: 'npm',
          args: ['test'],
          dependsOn: [],
          recommended: true,
        },
      };
    },
    (manifest: Record<string, unknown>) => {
      const toolchain = manifest.toolchain as Record<string, unknown>;
      toolchain.steps = {
        test: {
          type: 'test',
          command: 'npm',
          args: ['test'],
          dependsOn: [],
          recommended: true,
        },
      };
    },
    (manifest: Record<string, unknown>) => {
      manifest.name = '';
    },
  ])('rejeita violações do schema do manifesto v1', (change) => {
    const manifest = validManifest() as Record<string, unknown>;
    change(manifest);

    expect(() => assertTemplateManifestV1Schema(manifest)).toThrow(
      'O manifesto do template possui formato inválido',
    );
  });

  it('aceita os documentos estruturais válidos', () => {
    expect(() => assertTemplateRegistryV2Schema(validRegistry())).not.toThrow();
    expect(() => assertTemplateManifestV1Schema(validManifest())).not.toThrow();
  });
});
