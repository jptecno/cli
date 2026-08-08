import { describe, expect, it } from 'vitest';

import { CliError } from '../../src/application/cli-error.js';
import {
  buildHelpText,
  parseCliCommand,
} from '../../src/application/parse-cli-command.js';

describe('parseCliCommand', () => {
  it('lê destino, template, variáveis e flags do init', () => {
    expect(
      parseCliCommand([
        'init',
        'billing-api',
        '--template',
        'api-nodejs-typescript',
        '--set',
        'projectName=billing-api',
        '--set',
        'description=API de faturamento',
        '--no-git',
        '--no-install',
        '--validate',
      ]),
    ).toMatchObject({
      kind: 'init',
      destination: 'billing-api',
      templateId: 'api-nodejs-typescript',
      values: {
        projectName: 'billing-api',
        description: 'API de faturamento',
      },
      initializeGit: false,
      install: false,
      noInstall: true,
      validate: true,
    });
  });

  it('armazena --set sem expor o mapa a propriedades herdadas', () => {
    const command = parseCliCommand([
      'init',
      'billing-api',
      '--set',
      '__proto__=valor',
    ]);

    expect(command.kind).toBe('init');
    if (command.kind !== 'init') {
      return;
    }

    expect(Object.getPrototypeOf(command.values)).toBeNull();
    expect(Object.entries(command.values)).toEqual([['__proto__', 'valor']]);
  });

  it('lê template list com registry alternativo https', () => {
    expect(
      parseCliCommand([
        'template',
        'list',
        '--registry',
        'https://example.com/registry.json',
      ]),
    ).toEqual({
      kind: 'template-list',
      registryUrl: 'https://example.com/registry.json',
      isCustomRegistry: true,
    });
  });

  const invalidArgumentLists: string[][] = [
    ['create', 'billing-api'],
    ['init'],
    ['init', 'billing-api', '--set', 'projectName'],
    ['init', 'billing-api', '--unknown', 'value'],
    ['init', 'billing-api', '--no-validate'],
    ['template'],
    ['template', 'list', '--registry'],
    ['template', 'list', '--unknown'],
  ];

  for (const arguments_ of invalidArgumentLists) {
    it(`rejeita argumentos inválidos: ${JSON.stringify(arguments_)}`, () => {
      expect(() => parseCliCommand(arguments_)).toThrow(CliError);
    });
  }

  describe('help e version', () => {
    it('mostra ajuda quando não há argumentos', () => {
      expect(parseCliCommand([])).toEqual({ kind: 'help' });
    });

    it.each([['--help'], ['-h'], ['help']])('mostra ajuda para %s', (flag) => {
      expect(parseCliCommand([flag])).toEqual({ kind: 'help' });
    });

    it.each([['--version'], ['-v']])('mostra a versão para %s', (flag) => {
      expect(parseCliCommand([flag])).toEqual({ kind: 'version' });
    });

    it('mostra ajuda para jp init --help', () => {
      expect(parseCliCommand(['init', '--help'])).toEqual({ kind: 'help' });
    });

    it('mostra ajuda para jp template list --help', () => {
      expect(parseCliCommand(['template', 'list', '--help'])).toEqual({
        kind: 'help',
      });
    });

    it('gera um texto de ajuda não vazio com as opções documentadas', () => {
      const helpText = buildHelpText();

      expect(helpText).toContain('--template <id>');
      expect(helpText).toContain('--set chave=valor');
      expect(helpText).toContain('--registry <url>');
      expect(helpText).toContain('--no-git');
      expect(helpText).toContain('--install');
      expect(helpText).toContain('--no-install');
      expect(helpText).toContain('--validate');
      expect(helpText).not.toContain('--no-validate');
      expect(helpText).toContain('--help');
      expect(helpText).toContain('--version');
    });

    it('sugere jp --help para comando desconhecido', () => {
      expect(() => parseCliCommand(['create', 'billing-api'])).toThrow(
        'jp --help',
      );
    });
  });

  it('rejeita combinações contraditórias de flags de toolchain', () => {
    expect(() =>
      parseCliCommand(['init', 'billing-api', '--install', '--no-install']),
    ).toThrow('As opções --install e --no-install não podem ser usadas juntas');
    expect(() =>
      parseCliCommand(['init', 'billing-api', '--install', '--validate']),
    ).toThrow('As opções --install e --validate não podem ser usadas juntas');
  });

  describe('validação de flags que consomem valores', () => {
    it('rejeita --template quando o valor é outra flag', () => {
      expect(() =>
        parseCliCommand(['init', 'billing-api', '--template', '--no-git']),
      ).toThrow(CliError);
    });

    it('rejeita --registry quando o valor é outra flag', () => {
      expect(() =>
        parseCliCommand(['init', 'billing-api', '--registry', '--no-git']),
      ).toThrow(CliError);
    });

    it('rejeita --set quando o valor é outra flag', () => {
      expect(() =>
        parseCliCommand(['init', 'billing-api', '--set', '--no-git']),
      ).toThrow(CliError);
    });

    it('rejeita --registry sem valor em jp template list quando o valor é outra flag', () => {
      expect(() =>
        parseCliCommand(['template', 'list', '--registry', '--unknown']),
      ).toThrow(CliError);
    });
  });

  describe('validação da URL de registry', () => {
    it('rejeita URL malformada', () => {
      expect(() =>
        parseCliCommand(['init', 'billing-api', '--registry', 'não-é-url']),
      ).toThrow(CliError);
    });

    it('rejeita esquema http', () => {
      expect(() =>
        parseCliCommand([
          'init',
          'billing-api',
          '--registry',
          'http://example.com/registry.json',
        ]),
      ).toThrow(CliError);
    });

    it('rejeita esquema file', () => {
      expect(() =>
        parseCliCommand([
          'template',
          'list',
          '--registry',
          'file:///etc/passwd',
        ]),
      ).toThrow(CliError);
    });

    it('aceita https e marca isCustomRegistry como true', () => {
      const command = parseCliCommand([
        'init',
        'billing-api',
        '--registry',
        'https://example.com/registry.json',
      ]);

      expect(command).toMatchObject({
        registryUrl: 'https://example.com/registry.json',
        isCustomRegistry: true,
      });
    });

    it('marca isCustomRegistry como false quando o registry padrão é usado', () => {
      const command = parseCliCommand(['init', 'billing-api']);

      expect(command).toMatchObject({ isCustomRegistry: false });
    });
  });
});
