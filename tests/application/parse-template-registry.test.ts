import { describe, expect, it } from 'vitest';

import { CliError } from '../../src/application/cli-error.js';
import { parseTemplateRegistry } from '../../src/application/parse-template-registry.js';

describe('parseTemplateRegistry', () => {
  it('aceita um catálogo versionado com template GitHub válido', () => {
    expect(
      parseTemplateRegistry({
        schemaVersion: 1,
        templates: [
          {
            id: 'api-nodejs-typescript',
            name: 'API Node.js + TypeScript',
            description: 'Template de API',
            repository: 'jptecno/template-api-nodejs-typescript',
            version: 'v0.1.0',
            ref: 'v0.1.0',
          },
        ],
      }),
    ).toEqual({
      schemaVersion: 1,
      templates: [
        {
          id: 'api-nodejs-typescript',
          name: 'API Node.js + TypeScript',
          description: 'Template de API',
          repository: 'jptecno/template-api-nodejs-typescript',
          version: 'v0.1.0',
          ref: 'v0.1.0',
        },
      ],
    });
  });

  it.each([
    { schemaVersion: 2, templates: [] },
    { schemaVersion: 1, templates: [] },
    {
      schemaVersion: 1,
      templates: [
        {
          id: 'api',
          name: 'API',
          description: 'Template',
          repository: 'https://github.com/jptecno/template-api',
          version: 'v0.1.0',
          ref: 'v0.1.0',
        },
      ],
    },
    {
      schemaVersion: 1,
      templates: [
        {
          id: 'api',
          name: 'API',
          description: 'Template',
          repository: 'jptecno/template-api',
          version: 'v0.1.0',
          ref: 'main',
        },
      ],
    },
    {
      schemaVersion: 1,
      templates: [
        {
          id: 'api',
          name: 'API',
          description: 'Template',
          repository: 'jptecno/template-api',
          version: 'v0.1.0',
          ref: 'v0.1.1',
        },
      ],
    },
  ])('rejeita um catálogo inválido: %#', (catalog) => {
    expect(() => parseTemplateRegistry(catalog)).toThrow(CliError);
  });
});
