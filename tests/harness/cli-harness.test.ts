import { describe, expect, it } from 'vitest';

import { CliError } from '../../src/application/cli-error.js';
import type { CliHarnessDependencies } from '../../src/harness/cli-harness.js';
import {
  createInMemoryOfficialRegistry,
  runCliHarness,
} from '../../src/harness/cli-harness.js';

const registry = {
  schemaVersion: 2,
  revision: 1,
  publishedAt: '2026-08-09T12:00:00Z',
  templates: [
    {
      id: 'api-nodejs-typescript',
      name: 'API Node.js + TypeScript',
      description: 'Template de API',
      repository: 'jptecno/template-api-nodejs-typescript',
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

describe('harness da CLI', () => {
  it('valida o registry v2 como oficial antes de montá-lo em memória', () => {
    expect(() =>
      createInMemoryOfficialRegistry({
        ...registry,
        templates: [
          { ...registry.templates[0], repository: 'externo/template' },
        ],
      }),
    ).toThrow(CliError);
  });

  it('invoca runCli com o registry validado e as injeções fornecidas', async () => {
    const logs: string[] = [];

    await expect(
      runCliHarness(['template', 'list'], {
        ...createDependencies(),
        registry,
        log: (message) => logs.push(message),
      }),
    ).resolves.toBe(0);

    expect(logs.join('\n')).toContain('api-nodejs-typescript');
  });
});

function createDependencies(): CliHarnessDependencies {
  return {
    templateSource: { materialize: async () => undefined },
    commandExecutor: { run: async () => undefined },
    toolInspector: {
      inspect: async () => ({ status: 'available', versionOutput: '99.0.0' }),
    },
    prompt: {
      isInteractive: () => false,
      selectTemplate: async () => 'api-nodejs-typescript',
      ask: async (_question, defaultValue) => defaultValue ?? '',
      confirm: async () => true,
    },
    cliVersion: '0.0.0',
    log: () => undefined,
    errorLog: () => undefined,
  };
}
