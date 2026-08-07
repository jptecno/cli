import { describe, expect, it } from 'vitest';

import { CliError } from '../../src/application/cli-error.js';
import {
  parseTemplateSelector,
  resolveTemplateVersion,
} from '../../src/application/resolve-template-version.js';
import type { TemplateRegistryV2 } from '../../src/contracts/template-registry-v2.types.js';

const registry: TemplateRegistryV2 = {
  schemaVersion: 2,
  revision: 1,
  publishedAt: '2026-08-07T12:00:00Z',
  templates: [
    {
      id: 'api',
      name: 'API',
      description: 'Template de API',
      repository: 'jptecno/template-api',
      versions: [
        {
          version: 'v2.0.0',
          ref: 'v2.0.0',
          commit: 'a'.repeat(40),
          status: 'active',
        },
        {
          version: 'v1.0.0',
          ref: 'v1.0.0',
          commit: 'b'.repeat(40),
          status: 'deprecated',
          statusReason: 'Atualize para v2',
        },
        {
          version: 'v0.1.0',
          ref: 'v0.1.0',
          commit: 'c'.repeat(40),
          status: 'revoked',
          statusReason: 'Falha de segurança',
        },
      ],
    },
  ],
};

describe('parseTemplateSelector', () => {
  it('normaliza id@version e id com versão separada da mesma forma', () => {
    expect(parseTemplateSelector('api@v1.0.0')).toEqual({
      id: 'api',
      version: 'v1.0.0',
    });
    expect(parseTemplateSelector('api', 'v1.0.0')).toEqual({
      id: 'api',
      version: 'v1.0.0',
    });
  });

  it.each(['', '@v1.0.0', 'api@', 'api@v1.0.0@x'])(
    'rejeita seletor inválido: %s',
    (selector) => {
      expect(() => parseTemplateSelector(selector)).toThrow(CliError);
    },
  );

  it('rejeita versões conflitantes', () => {
    expect(() => parseTemplateSelector('api@v1.0.0', 'v2.0.0')).toThrow(
      'Foram informadas versões de template conflitantes',
    );
  });
});

describe('resolveTemplateVersion', () => {
  it('resolve a versão ativa por padrão', () => {
    expect(
      resolveTemplateVersion(registry, { id: 'api' }).version.version,
    ).toBe('v2.0.0');
  });

  it('requer autorização posterior para versão deprecated quando incluída', () => {
    const result = resolveTemplateVersion(
      registry,
      { id: 'api', version: 'v1.0.0' },
      { includeDeprecated: true },
    );

    expect(result.requiresDeprecatedConfirmation).toBe(true);
  });

  it('não seleciona deprecated sem a opção explícita', () => {
    expect(() =>
      resolveTemplateVersion(registry, { id: 'api', version: 'v1.0.0' }),
    ).toThrow('A versão descontinuada exige autorização explícita');
  });

  it('nunca seleciona versão revoked', () => {
    expect(() =>
      resolveTemplateVersion(
        registry,
        { id: 'api', version: 'v0.1.0' },
        { includeDeprecated: true },
      ),
    ).toThrow('A versão revogada do template não pode ser utilizada');
  });
});
