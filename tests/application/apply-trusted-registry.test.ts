import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  applyTrustedRegistry,
  projectActiveTemplates,
} from '../../src/application/apply-trusted-registry.js';
import type { CreateProjectDependencies } from '../../src/application/create-project.js';
import type { TemplateDefinition } from '../../src/contracts/template-registry.types.js';
import type { TemplateRegistryV2 } from '../../src/contracts/template-registry-v2.types.js';

const temporaryDirectories: string[] = [];

const registry: TemplateRegistryV2 = {
  schemaVersion: 2,
  revision: 1,
  publishedAt: '2026-08-08T12:00:00Z',
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
        },
        {
          version: 'v0.1.0',
          ref: 'v0.1.0',
          commit: 'c'.repeat(40),
          status: 'revoked',
        },
      ],
    },
    {
      id: 'sem-ativa',
      name: 'Sem ativa',
      description: 'Não deve ser listado',
      repository: 'jptecno/template-sem-ativa',
      versions: [
        {
          version: 'v1.0.0',
          ref: 'v1.0.0',
          commit: 'd'.repeat(40),
          status: 'deprecated',
        },
      ],
    },
  ],
};

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { force: true, recursive: true })),
  );
});

describe('projectActiveTemplates', () => {
  it('projeta somente versões active para listagem e seleção', () => {
    expect(projectActiveTemplates(registry)).toEqual([
      {
        id: 'api',
        name: 'API',
        description: 'Template de API',
        repository: 'jptecno/template-api',
        version: 'v2.0.0',
        ref: 'v2.0.0',
      },
    ]);
  });
});

describe('applyTrustedRegistry', () => {
  it('usa a projeção active no prompt e materializa a versão resolvida', async () => {
    const destination = await createTemporaryDirectory();
    const selectedTemplates: string[][] = [];
    const materialize = vi.fn(async (template, target: string) => {
      await writeFile(
        join(target, 'template.json'),
        JSON.stringify({
          schemaVersion: 1,
          id: template.id,
          name: template.name,
          description: template.description,
          repository: template.repository,
          variables: [],
          render: { include: [] },
          toolchain: {
            ecosystem: 'node',
            requirements: [
              { tool: 'node', minimumVersion: '24.0.0' },
              { tool: 'npm', minimumVersion: '11.0.0' },
            ],
            steps: {
              install: {
                command: 'npm',
                args: ['install'],
                dependsOn: [],
                recommended: true,
              },
            },
          },
        }),
      );
    });

    const result = await applyTrustedRegistry(
      registry,
      { destination, values: {}, initializeGit: false },
      {
        ...createProjectDependencies(materialize),
        prompt: {
          isInteractive: () => false,
          ask: async () => '',
          confirm: async () => true,
          selectTemplate: async (templates) => {
            selectedTemplates.push(templates.map((template) => template.id));
            return 'api';
          },
        },
      },
    );

    expect(selectedTemplates).toEqual([['api']]);
    expect(materialize).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'api', version: 'v2.0.0', ref: 'v2.0.0' }),
      destination,
    );
    expect(result.template).toMatchObject({
      id: 'api',
      version: 'v2.0.0',
      ref: 'v2.0.0',
    });
  });

  it.each([
    [
      'deprecated',
      'v1.0.0',
      'A versão descontinuada exige autorização explícita',
    ],
    [
      'revoked',
      'v0.1.0',
      'A versão revogada do template não pode ser utilizada',
    ],
  ])('não materializa versão %s', async (_status, version, message) => {
    const materialize = vi.fn();

    await expect(
      applyTrustedRegistry(
        registry,
        {
          destination: '/não-deve-ser-criado',
          templateId: `api@${version}`,
          values: {},
          initializeGit: false,
        },
        {
          ...createProjectDependencies(materialize),
          prompt: createPrompt(),
        },
      ),
    ).rejects.toThrow(message);

    expect(materialize).not.toHaveBeenCalled();
  });
});

function createProjectDependencies(
  materialize: (template: TemplateDefinition, target: string) => Promise<void>,
): Omit<CreateProjectDependencies, 'prompt'> {
  return {
    templateSource: { materialize },
    commandExecutor: { run: async () => undefined },
  };
}

function createPrompt() {
  return {
    isInteractive: () => false,
    ask: async () => '',
    confirm: async () => true,
    selectTemplate: async () => 'api',
  };
}

async function createTemporaryDirectory(): Promise<string> {
  const directory = await mkdtemp(
    join(tmpdir(), 'jp-cli-trusted-registry-test-'),
  );
  temporaryDirectories.push(directory);
  return directory;
}
