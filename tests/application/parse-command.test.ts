import { describe, expect, it } from 'vitest';

import { CliError } from '../../src/application/cli-error.js';
import { parseInitCommand } from '../../src/application/parse-command.js';

describe('parseInitCommand', () => {
  it('lê destino, template, variáveis e flags de execução', () => {
    expect(
      parseInitCommand([
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
      parseInitCommand(['init', 'billing-api', '--no-install']),
    ).toMatchObject({
      installDependencies: false,
      validateProject: false,
    });
  });

  const invalidArgumentLists: string[][] = [
    [],
    ['create', 'billing-api'],
    ['init'],
    ['init', 'billing-api', '--set', 'projectName'],
    ['init', 'billing-api', '--unknown', 'value'],
  ];

  for (const arguments_ of invalidArgumentLists) {
    it(`rejeita argumentos inválidos: ${JSON.stringify(arguments_)}`, () => {
      expect(() => parseInitCommand(arguments_)).toThrow(CliError);
    });
  }
});
