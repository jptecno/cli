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

  it.each(['Api Node', 'api_node', 'api-', '-api'])(
    'rejeita identificador fora de kebab-case: %s',
    (id) => {
      expect(() =>
        parseTemplateRegistry({
          schemaVersion: 1,
          templates: [
            {
              id,
              name: 'API',
              description: 'Template',
              repository: 'jptecno/template-api',
              version: 'v0.1.0',
              ref: 'v0.1.0',
            },
          ],
        }),
      ).toThrow('O identificador do template deve usar kebab-case');
    },
  );

  it('rejeita catálogo vazio com mensagem específica', () => {
    expect(() =>
      parseTemplateRegistry({ schemaVersion: 1, templates: [] }),
    ).toThrow('O catálogo de templates não possui entradas');
  });

  it('rejeita entrada de catálogo que é um array', () => {
    expect(() =>
      parseTemplateRegistry({
        schemaVersion: 1,
        templates: [['api-nodejs-typescript']],
      }),
    ).toThrow('Uma entrada do catálogo de templates é inválida');
  });

  it('rejeita valor raiz que é um array', () => {
    expect(() =>
      parseTemplateRegistry([
        {
          schemaVersion: 1,
          templates: [],
        },
      ]),
    ).toThrow('O catálogo de templates possui formato inválido');
  });

  it('rejeita identificadores de template duplicados', () => {
    const template = {
      id: 'api-nodejs-typescript',
      name: 'API Node.js + TypeScript',
      description: 'Template de API',
      repository: 'jptecno/template-api-nodejs-typescript',
      version: 'v0.1.0',
      ref: 'v0.1.0',
    };

    expect(() =>
      parseTemplateRegistry({
        schemaVersion: 1,
        templates: [template, template],
      }),
    ).toThrow(
      'O catálogo possui identificadores de template duplicados: api-nodejs-typescript',
    );
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
