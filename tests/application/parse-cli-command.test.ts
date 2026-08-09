import { describe, expect, it } from 'vitest';

import { resolveRegistryCacheRoot } from '../../src/adapters/file-registry-cache.js';
import { CliError } from '../../src/application/cli-error.js';
import {
  buildHelpText,
  parseCliCommand,
} from '../../src/application/parse-cli-command.js';

describe('parseCliCommand', () => {
  it('lê flags de init, incluindo as autorizações stale', () => {
    expect(
      parseCliCommand([
        'init',
        'billing-api',
        '--template',
        'api-nodejs-typescript',
        '--set',
        'projectName=billing-api',
        '--no-git',
        '--no-install',
        '--validate',
        '--allow-stale-registry',
        '--allow-stale-template-creation',
      ]),
    ).toMatchObject({
      kind: 'init',
      destination: 'billing-api',
      templateId: 'api-nodejs-typescript',
      values: { projectName: 'billing-api' },
      initializeGit: false,
      noInstall: true,
      validate: true,
      allowStaleRegistry: true,
      allowStaleTemplateCreation: true,
    });
  });

  it('aceita --allow-stale-registry para template list', () => {
    expect(
      parseCliCommand(['template', 'list', '--allow-stale-registry']),
    ).toEqual({ kind: 'template-list', allowStaleRegistry: true });
  });

  it.each([
    ['init', 'billing-api', '--registry', 'https://example.com/registry.json'],
    ['template', 'list', '--registry', 'https://example.com/registry.json'],
    ['template', 'list', '--allow-stale-template-creation'],
  ])(
    'rejeita opção fora do contrato oficial: %j',
    (...arguments_: string[]) => {
      expect(() => parseCliCommand(arguments_)).toThrow(CliError);
    },
  );

  it.each([
    ['create', 'billing-api'],
    ['init'],
    ['init', 'billing-api', '--set', 'projectName'],
    ['init', 'billing-api', '--template', '--no-git'],
    ['template'],
  ])('rejeita argumentos inválidos: %j', (...arguments_: string[]) => {
    expect(() => parseCliCommand(arguments_)).toThrow(CliError);
  });

  it('mantém valores --set sem propriedades herdadas', () => {
    const command = parseCliCommand([
      'init',
      'billing-api',
      '--set',
      '__proto__=valor',
    ]);

    expect(command.kind).toBe('init');
    if (command.kind === 'init') {
      expect(Object.getPrototypeOf(command.values)).toBeNull();
      expect(Object.entries(command.values)).toEqual([['__proto__', 'valor']]);
    }
  });

  it('documenta as autorizações stale, sem opção de registry alternativo', () => {
    const helpText = buildHelpText();

    expect(helpText).toContain('--allow-stale-registry');
    expect(helpText).toContain('--allow-stale-template-creation');
    expect(helpText).not.toContain('--registry <url>');
  });

  it('mantém ajuda e versão como comandos sem efeitos', () => {
    expect(parseCliCommand([])).toEqual({ kind: 'help' });
    expect(parseCliCommand(['--version'])).toEqual({ kind: 'version' });
    expect(parseCliCommand(['init', '--help'])).toEqual({ kind: 'help' });
  });
});

describe('resolveRegistryCacheRoot', () => {
  it.each([
    [
      'win32',
      { LOCALAPPDATA: 'C:\\Local' },
      'C:\\Users\\jp',
      'C:\\Local/jptecno/registry',
    ],
    [
      'win32',
      {},
      'C:\\Users\\jp',
      'C:\\Users\\jp/AppData/Local/jptecno/registry',
    ],
    [
      'darwin',
      { XDG_CACHE_HOME: '/ignored' },
      '/Users/jp',
      '/Users/jp/Library/Caches/jptecno/registry',
    ],
    [
      'linux',
      { XDG_CACHE_HOME: '/cache' },
      '/home/jp',
      '/cache/jptecno/registry',
    ],
    ['linux', {}, '/home/jp', '/home/jp/.cache/jptecno/registry'],
  ] as const)(
    'resolve %s conforme convenção da plataforma',
    (platform, environment, homeDirectory, expected) => {
      expect(
        resolveRegistryCacheRoot({
          platform,
          environment,
          homeDirectory,
        }),
      ).toBe(expected);
    },
  );
});
