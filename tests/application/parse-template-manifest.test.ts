import { describe, expect, it } from 'vitest';

import { CliError } from '../../src/application/cli-error.js';
import { parseTemplateManifest } from '../../src/application/parse-template-manifest.js';

function buildManifest(overrides: Record<string, unknown> = {}): unknown {
  return {
    schemaVersion: 1,
    id: 'api-nodejs-typescript',
    name: 'API Node.js + TypeScript',
    description: 'Template de API',
    repository: 'jptecno/template-api-nodejs-typescript',
    variables: [],
    render: { include: ['package.json'] },
    toolchain: {
      ecosystem: 'node',
      requirements: [
        { tool: 'node', minimumVersion: '24.0.0' },
        { tool: 'npm', minimumVersion: '11.0.0' },
      ],
      steps: {
        install: step('npm', ['install']),
        formatCheck: step('npm', ['run', 'format:check'], ['install']),
        lint: step('npm', ['run', 'lint'], ['install']),
        typecheck: step('npm', ['run', 'typecheck'], ['install']),
        test: step('npm', ['test'], ['install']),
        build: step('npm', ['run', 'build'], ['test']),
      },
    },
    ...overrides,
  };
}

function step(command: string, args: string[], dependsOn: string[] = []) {
  return { command, args, dependsOn, recommended: true };
}

function toolchainOf(manifest: unknown): Record<string, unknown> {
  return (manifest as { toolchain: Record<string, unknown> }).toolchain;
}

function stepsOf(manifest: unknown): Record<string, unknown> {
  return toolchainOf(manifest).steps as Record<string, unknown>;
}

describe('parseTemplateManifest', () => {
  it('invoca o schema antes da análise semântica', () => {
    const manifest = buildManifest({ unexpected: 'não pode ser ignorado' });

    expect(() => parseTemplateManifest(manifest)).toThrow(
      'O manifesto do template possui formato inválido',
    );
  });

  it('aceita e normaliza a política Node permitida', () => {
    const parsed = parseTemplateManifest(buildManifest());

    expect(parsed.repository).toBe('jptecno/template-api-nodejs-typescript');
    expect(parsed.toolchain.steps.build).toMatchObject({
      command: 'npm',
      args: ['run', 'build'],
    });
  });

  it('rejeita o formato postCreate legado antes de qualquer compatibilidade', () => {
    const manifest = buildManifest();
    const record = manifest as Record<string, unknown>;
    delete record.toolchain;
    record.postCreate = {
      packageManager: 'npm',
      installCommand: 'npm install',
      validateCommand: 'npm run check',
    };

    expect(() => parseTemplateManifest(manifest)).toThrow(
      'O manifesto do template possui formato inválido',
    );
  });

  it.each([
    ['install', 'npm', ['install', '--ignore-scripts']],
    ['formatCheck', 'npm', ['run', 'format:check', '--silent']],
    ['lint', 'npm', ['run', 'test']],
    ['typecheck', 'npm', ['run', 'typecheck', `\${INJECTED}`]],
    ['test', 'npm', ['exec', 'vitest']],
    ['build', 'npx', ['run', 'build']],
    ['build', 'node', ['-e', 'process.exit()']],
    ['test', 'sh', ['-c', 'npm test']],
    ['test', 'npm', ['test; curl https://evil.test']],
    ['test', 'npm', ['test', '|', 'sh']],
  ])('rejeita a tupla não permitida de %s', (name, command, args) => {
    const manifest = buildManifest();
    stepsOf(manifest)[name] = step(command, args);

    expect(() => parseTemplateManifest(manifest)).toThrow(CliError);
  });

  it.each([
    (manifest: unknown) => {
      toolchainOf(manifest).ecosystem = 'python';
    },
    (manifest: unknown) => {
      toolchainOf(manifest).requirements = [
        { tool: 'node', minimumVersion: '24.0.0' },
      ];
    },
    (manifest: unknown) => {
      toolchainOf(manifest).requirements = [
        { tool: 'node', minimumVersion: '24.0.0' },
        { tool: 'npm', minimumVersion: '11.0.0' },
        { tool: 'npm', minimumVersion: '11.1.0' },
      ];
    },
    (manifest: unknown) => {
      toolchainOf(manifest).requirements = [
        { tool: 'node', minimumVersion: '>=24' },
        { tool: 'npm', minimumVersion: '11.0.0-beta.1' },
      ];
    },
    (manifest: unknown) => {
      toolchainOf(manifest).steps = {};
    },
  ])('rejeita limitações inválidas da toolchain Node', (change) => {
    const manifest = buildManifest();
    change(manifest);

    expect(() => parseTemplateManifest(manifest)).toThrow(CliError);
  });

  it.each([
    (manifest: unknown) => {
      stepsOf(manifest).test = step('npm', ['test'], ['test']);
    },
    (manifest: unknown) => {
      stepsOf(manifest).build = step('npm', ['run', 'build'], ['missing']);
    },
    (manifest: unknown) => {
      stepsOf(manifest).test = step('npm', ['test'], ['build']);
      stepsOf(manifest).build = step('npm', ['run', 'build'], ['test']);
    },
  ])('rejeita dependências inválidas no DAG', (change) => {
    const manifest = buildManifest();
    change(manifest);

    expect(() => parseTemplateManifest(manifest)).toThrow(CliError);
  });

  it('não inclui campos externos na saída normalizada', () => {
    const parsed = parseTemplateManifest(buildManifest());

    expect(parsed).not.toHaveProperty('postCreate');
    expect(Object.keys(parsed)).toEqual([
      'schemaVersion',
      'id',
      'name',
      'description',
      'repository',
      'variables',
      'render',
      'toolchain',
    ]);
  });
});
