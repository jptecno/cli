import { describe, expect, it } from 'vitest';

import { CliError } from '../../src/application/cli-error.js';
import { parseCliCommand } from '../../src/application/parse-cli-command.js';

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
        '--no-validate',
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
      installDependencies: false,
      validateProject: false,
    });
  });

  it('desabilita a validação quando a instalação é desabilitada', () => {
    expect(
      parseCliCommand(['init', 'billing-api', '--no-install']),
    ).toMatchObject({
      kind: 'init',
      installDependencies: false,
      validateProject: false,
    });
  });

  it('lê template list com registry alternativo', () => {
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
    });
  });

  const invalidArgumentLists: string[][] = [
    [],
    ['create', 'billing-api'],
    ['init'],
    ['init', 'billing-api', '--set', 'projectName'],
    ['init', 'billing-api', '--unknown', 'value'],
    ['template'],
    ['template', 'list', '--registry'],
    ['template', 'list', '--unknown'],
  ];

  for (const arguments_ of invalidArgumentLists) {
    it(`rejeita argumentos inválidos: ${JSON.stringify(arguments_)}`, () => {
      expect(() => parseCliCommand(arguments_)).toThrow(CliError);
    });
  }
});
