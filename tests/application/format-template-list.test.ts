import { describe, expect, it } from 'vitest';

import { formatTemplateList } from '../../src/application/format-template-list.js';

describe('formatTemplateList', () => {
  it('exibe id, versão, nome e descrição de cada template', () => {
    expect(
      formatTemplateList([
        {
          id: 'api-nodejs-typescript',
          name: 'API Node.js + TypeScript',
          description: 'Fastify e PostgreSQL',
          repository: 'jptecno/template-api-nodejs-typescript',
          version: 'v0.1.0',
          ref: 'v0.1.0',
        },
        {
          id: 'worker-nodejs-typescript',
          name: 'Worker Node.js + TypeScript',
          description: 'Processamento assíncrono',
          repository: 'jptecno/template-worker-nodejs-typescript',
          version: 'v0.2.0',
          ref: 'v0.2.0',
        },
      ]),
    ).toBe(
      'Templates disponíveis:\n\napi-nodejs-typescript  v0.1.0\n  API Node.js + TypeScript\n  Fastify e PostgreSQL\n\nworker-nodejs-typescript  v0.2.0\n  Worker Node.js + TypeScript\n  Processamento assíncrono',
    );
  });
});
