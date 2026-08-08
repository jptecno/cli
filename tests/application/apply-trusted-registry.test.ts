import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  applyTrustedRegistry,
  projectActiveTemplates,
} from '../../src/application/apply-trusted-registry.js';
import type { CreateProjectDependencies } from '../../src/application/create-project.js';
import type { LoadedTrustedRegistry } from '../../src/application/load-trusted-registry.js';
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
        commit: 'a'.repeat(40),
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
      loadedRegistry(),
      {
        destination,
        values: {},
        initializeGit: false,
        allowStaleRegistry: false,
        allowStaleTemplateCreation: false,
      },
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
      expect.objectContaining({
        id: 'api',
        version: 'v2.0.0',
        ref: 'v2.0.0',
        commit: 'a'.repeat(40),
      }),
      destination,
    );
    expect(result.template).toMatchObject({
      id: 'api',
      version: 'v2.0.0',
      ref: 'v2.0.0',
      commit: 'a'.repeat(40),
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
        loadedRegistry(),
        {
          destination: '/não-deve-ser-criado',
          templateId: `api@${version}`,
          values: {},
          initializeGit: false,
          allowStaleRegistry: false,
          allowStaleTemplateCreation: false,
        },
        {
          ...createProjectDependencies(materialize),
          prompt: createPrompt(),
        },
      ),
    ).rejects.toThrow(message);

    expect(materialize).not.toHaveBeenCalled();
  });

  it('não seleciona nem materializa registry stale em non-TTY sem allowStaleRegistry', async () => {
    const materialize = vi.fn();
    const prompt = createPrompt();

    await expect(
      applyTrustedRegistry(
        loadedRegistry('cache', 'stale'),
        staleOptions('/não-deve-ser-criado'),
        { ...createProjectDependencies(materialize), prompt },
      ),
    ).rejects.toThrow(
      'É necessária autorização para usar o catálogo desatualizado',
    );

    expect(prompt.selectTemplate).not.toHaveBeenCalled();
    expect(materialize).not.toHaveBeenCalled();
  });

  it('não materializa registry stale em non-TTY somente com allowStaleRegistry', async () => {
    const materialize = vi.fn();
    const prompt = createPrompt();

    await expect(
      applyTrustedRegistry(
        loadedRegistry('cache', 'stale'),
        staleOptions('/não-deve-ser-criado', { allowStaleRegistry: true }),
        { ...createProjectDependencies(materialize), prompt },
      ),
    ).rejects.toThrow(
      'É necessária autorização para criar projeto com catálogo desatualizado',
    );

    expect(prompt.selectTemplate).toHaveBeenCalledOnce();
    expect(materialize).not.toHaveBeenCalled();
  });

  it('materializa registry stale em non-TTY com as duas autorizações', async () => {
    const destination = await createTemporaryDirectory();
    const materialize = createMaterializer();

    await expect(
      applyTrustedRegistry(
        loadedRegistry('cache', 'stale'),
        staleOptions(destination, {
          allowStaleRegistry: true,
          allowStaleTemplateCreation: true,
        }),
        {
          ...createProjectDependencies(materialize),
          prompt: createPrompt(),
        },
      ),
    ).resolves.toMatchObject({ template: { id: 'api', version: 'v2.0.0' } });

    expect(materialize).toHaveBeenCalledOnce();
  });

  it('não materializa registry stale quando TTY aceita uso e recusa criação', async () => {
    const materialize = vi.fn();
    const prompt = createPrompt(true, [true, false]);

    await expect(
      applyTrustedRegistry(
        loadedRegistry('cache', 'stale'),
        staleOptions('/não-deve-ser-criado'),
        { ...createProjectDependencies(materialize), prompt },
      ),
    ).rejects.toThrow(
      'É necessária autorização para criar projeto com catálogo desatualizado',
    );

    expect(prompt.confirm).toHaveBeenNthCalledWith(
      1,
      'O catálogo está desatualizado. Deseja continuar usando-o?',
      false,
    );
    expect(prompt.confirm).toHaveBeenNthCalledWith(
      2,
      'O catálogo está desatualizado. Deseja criar o projeto mesmo assim?',
      false,
    );
    expect(materialize).not.toHaveBeenCalled();
  });

  it.each(['network', 'cache'] as const)(
    'não pede consentimento stale para registry fresh de %s',
    async (source) => {
      const destination = await createTemporaryDirectory();
      const materialize = createMaterializer();
      const prompt = createPrompt();

      await applyTrustedRegistry(
        loadedRegistry(source, 'fresh'),
        staleOptions(destination),
        { ...createProjectDependencies(materialize), prompt },
      );

      expect(prompt.confirm).not.toHaveBeenCalled();
      expect(materialize).toHaveBeenCalledOnce();
    },
  );
});

function createProjectDependencies(
  materialize: (template: TemplateDefinition, target: string) => Promise<void>,
): Omit<CreateProjectDependencies, 'prompt'> {
  return {
    templateSource: { materialize },
    commandExecutor: { run: async () => undefined },
  };
}

function loadedRegistry(
  source: LoadedTrustedRegistry['source'] = 'network',
  freshness: LoadedTrustedRegistry['freshness'] = 'fresh',
): LoadedTrustedRegistry {
  return { registry, source, freshness };
}

function staleOptions(
  destination: string,
  overrides: Partial<{
    allowStaleRegistry: boolean;
    allowStaleTemplateCreation: boolean;
  }> = {},
) {
  return {
    destination,
    values: {},
    initializeGit: false,
    allowStaleRegistry: false,
    allowStaleTemplateCreation: false,
    ...overrides,
  };
}

function createPrompt(isInteractive = false, answers: boolean[] = []) {
  return {
    isInteractive: vi.fn(() => isInteractive),
    ask: vi.fn(async () => ''),
    confirm: vi.fn(async () => answers.shift() ?? true),
    selectTemplate: vi.fn(async () => 'api'),
  };
}

function createMaterializer() {
  return vi.fn(async (template: TemplateDefinition, target: string) => {
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
}

async function createTemporaryDirectory(): Promise<string> {
  const directory = await mkdtemp(
    join(tmpdir(), 'jp-cli-trusted-registry-test-'),
  );
  temporaryDirectories.push(directory);
  return directory;
}
