import { describe, expect, it, vi } from 'vitest';

import { CliError } from '../../src/application/cli-error.js';
import { loadTrustedRegistry } from '../../src/application/load-trusted-registry.js';
import type { VerifiedRegistryFetcher } from '../../src/contracts/verified-registry-fetcher.port.js';

function validRegistry(repository = 'jptecno/template-api'): string {
  return JSON.stringify({
    schemaVersion: 2,
    revision: 4,
    publishedAt: '2026-08-07T12:00:00.123Z',
    templates: [
      {
        id: 'api',
        name: 'API',
        description: 'Template de API',
        repository,
        versions: [
          {
            version: 'v2.0.0',
            ref: 'v2.0.0',
            commit: 'a'.repeat(40),
            status: 'active',
          },
        ],
      },
    ],
  });
}

function fetcherReturning(bytes: Uint8Array): VerifiedRegistryFetcher {
  return { load: vi.fn().mockResolvedValue(bytes) };
}

describe('loadTrustedRegistry', () => {
  it('carrega bytes verificados e retorna o registry v2 validado', async () => {
    const fetcher = fetcherReturning(new TextEncoder().encode(validRegistry()));

    const registry = await loadTrustedRegistry(
      {
        registryUrl: 'https://registry.example/catalog.json',
        signatureUrl: 'https://registry.example/catalog.sig',
      },
      { fetcher },
    );

    expect(registry).toMatchObject({ schemaVersion: 2, revision: 4 });
    expect(fetcher.load).toHaveBeenCalledWith(
      'https://registry.example/catalog.json',
      'https://registry.example/catalog.sig',
    );
  });

  it('propaga a falha do fetcher antes de decodificar ou interpretar os bytes', async () => {
    const error = new CliError('A assinatura do catálogo é inválida');
    const fetcher: VerifiedRegistryFetcher = {
      load: vi.fn().mockRejectedValue(error),
    };

    await expect(
      loadTrustedRegistry(
        { registryUrl: 'https://registry.example/catalog.json' },
        { fetcher },
      ),
    ).rejects.toBe(error);
  });

  it('rejeita bytes que não são UTF-8 válido sem expor seu conteúdo', async () => {
    const fetcher = fetcherReturning(new Uint8Array([0xc3, 0x28]));

    await expect(
      loadTrustedRegistry(
        { registryUrl: 'https://registry.example/catalog.json' },
        { fetcher },
      ),
    ).rejects.toEqual(
      expect.objectContaining({
        name: CliError.name,
        message: 'O catálogo verificado não contém UTF-8 válido',
      }),
    );
  });

  it('rejeita JSON inválido sem expor seu conteúdo', async () => {
    const fetcher = fetcherReturning(
      new TextEncoder().encode('{"segredo":"não fechar"'),
    );

    await expect(
      loadTrustedRegistry(
        { registryUrl: 'https://registry.example/catalog.json' },
        { fetcher },
      ),
    ).rejects.toEqual(
      expect.objectContaining({
        name: CliError.name,
        message: 'O catálogo verificado contém JSON inválido',
      }),
    );
  });

  it('aplica schema e semântica do registry v2 após interpretar o JSON', async () => {
    const registry = JSON.parse(validRegistry()) as Record<string, unknown>;
    registry.schemaVersion = 1;
    const fetcher = fetcherReturning(
      new TextEncoder().encode(JSON.stringify(registry)),
    );

    await expect(
      loadTrustedRegistry(
        { registryUrl: 'https://registry.example/catalog.json' },
        { fetcher },
      ),
    ).rejects.toThrow('O catálogo de templates v2 possui formato inválido');
  });

  it('encaminha o contexto official ou custom para a validação v2', async () => {
    const bytes = new TextEncoder().encode(
      validRegistry('terceiro/template-api'),
    );

    await expect(
      loadTrustedRegistry(
        { registryUrl: 'https://registry.example/catalog.json' },
        { fetcher: fetcherReturning(bytes) },
      ),
    ).rejects.toThrow('O catálogo de templates v2 possui formato inválido');

    await expect(
      loadTrustedRegistry(
        {
          registryUrl: 'https://registry.example/catalog.json',
          context: 'custom',
        },
        { fetcher: fetcherReturning(bytes) },
      ),
    ).resolves.toMatchObject({
      templates: [{ repository: 'terceiro/template-api' }],
    });
  });
});
