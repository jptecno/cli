import { describe, expect, it, vi } from 'vitest';

import { CliError } from '../../src/application/cli-error.js';
import { loadTrustedRegistry } from '../../src/application/load-trusted-registry.js';
import {
  type RegistryCache,
  RegistryCacheConcurrencyError,
} from '../../src/contracts/registry-cache.port.js';
import type {
  VerifiedRegistry,
  VerifiedRegistryFetcher,
} from '../../src/contracts/verified-registry-fetcher.port.js';

function validRegistry(
  revision = 4,
  repository = 'jptecno/template-api',
): string {
  return JSON.stringify({
    schemaVersion: 2,
    revision,
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

function fetchedRegistry(payload: Uint8Array): VerifiedRegistry {
  return {
    payload,
    signatureEnvelope: new TextEncoder().encode('{"keyId":"official"}'),
    signatureUrl: 'https://registry.example/catalog.json.sig',
  };
}

function fetcherReturning(payload: Uint8Array): VerifiedRegistryFetcher {
  return { load: vi.fn().mockResolvedValue(fetchedRegistry(payload)) };
}

function cacheReturning(highWaterRevision?: number): RegistryCache {
  return {
    readHighWater: vi.fn().mockResolvedValue(highWaterRevision),
    commit: vi.fn().mockResolvedValue({ accepted: true }),
  };
}

function options() {
  return {
    registryUrl: 'https://registry.example/catalog.json',
    signatureUrl: 'https://registry.example/catalog.sig',
    trustFingerprint: 'ed25519:official-key',
  };
}

describe('loadTrustedRegistry', () => {
  it('valida o registry e persiste o snapshot autenticado com TTL de sete dias', async () => {
    const fetcher = fetcherReturning(new TextEncoder().encode(validRegistry()));
    const cache = cacheReturning();
    const now = new Date('2026-08-08T00:00:00.000Z');

    const registry = await loadTrustedRegistry(options(), {
      fetcher,
      cache,
      now: () => now,
    });

    expect(registry).toMatchObject({ schemaVersion: 2, revision: 4 });
    expect(fetcher.load).toHaveBeenCalledWith(
      'https://registry.example/catalog.json',
      'https://registry.example/catalog.sig',
    );
    expect(cache.readHighWater).toHaveBeenCalledWith({
      registryUrl: 'https://registry.example/catalog.json',
      trustFingerprint: 'ed25519:official-key',
    });
    expect(cache.commit).toHaveBeenCalledWith(
      {
        registryUrl: 'https://registry.example/catalog.json',
        trustFingerprint: 'ed25519:official-key',
      },
      expect.objectContaining({
        payload: new TextEncoder().encode(validRegistry()),
        signatureEnvelope: new TextEncoder().encode('{"keyId":"official"}'),
        signatureUrl: 'https://registry.example/catalog.json.sig',
        verifiedAt: now,
        expiresAt: new Date('2026-08-15T00:00:00.000Z'),
        revision: 4,
      }),
    );
  });

  it('não persiste quando o fetch autenticado falha', async () => {
    const cache = cacheReturning();
    const fetcher: VerifiedRegistryFetcher = {
      load: vi.fn().mockRejectedValue(new CliError('Assinatura inválida')),
    };

    await expect(
      loadTrustedRegistry(options(), { fetcher, cache }),
    ).rejects.toThrow('Assinatura inválida');
    expect(cache.readHighWater).not.toHaveBeenCalled();
    expect(cache.commit).not.toHaveBeenCalled();
  });

  it.each([
    ['UTF-8 inválido', new Uint8Array([0xc3, 0x28])],
    ['JSON inválido', new TextEncoder().encode('{"segredo":"não fechar"')],
    [
      'schema inválido',
      new TextEncoder().encode(JSON.stringify({ schemaVersion: 1 })),
    ],
    [
      'semântica inválida',
      new TextEncoder().encode(validRegistry(4, 'terceiro/template-api')),
    ],
  ])('não persiste registry com %s', async (_name, payload) => {
    const cache = cacheReturning();

    await expect(
      loadTrustedRegistry(options(), {
        fetcher: fetcherReturning(payload),
        cache,
      }),
    ).rejects.toBeInstanceOf(CliError);
    expect(cache.readHighWater).not.toHaveBeenCalled();
    expect(cache.commit).not.toHaveBeenCalled();
  });

  it('rejeita rollback sem gravar o snapshot', async () => {
    const cache = cacheReturning(5);

    await expect(
      loadTrustedRegistry(options(), {
        fetcher: fetcherReturning(new TextEncoder().encode(validRegistry(4))),
        cache,
      }),
    ).rejects.toThrow(
      'O catálogo verificado possui revisão inferior à já confiada',
    );
    expect(cache.commit).not.toHaveBeenCalled();
  });

  it('aceita uma revisão igual ao high-water', async () => {
    const cache = cacheReturning(4);

    await expect(
      loadTrustedRegistry(options(), {
        fetcher: fetcherReturning(new TextEncoder().encode(validRegistry(4))),
        cache,
      }),
    ).resolves.toMatchObject({ revision: 4 });
    expect(cache.commit).toHaveBeenCalledOnce();
  });

  it('não mascara um registry válido quando a gravação no cache falha', async () => {
    const cache: RegistryCache = {
      readHighWater: vi.fn().mockResolvedValue(undefined),
      commit: vi.fn().mockRejectedValue(new Error('disco indisponível')),
    };

    await expect(
      loadTrustedRegistry(options(), {
        fetcher: fetcherReturning(new TextEncoder().encode(validRegistry())),
        cache,
      }),
    ).resolves.toMatchObject({ revision: 4 });
  });

  it('rejeita quando o cache não consegue sincronizar uma revisão concorrente', async () => {
    const cache: RegistryCache = {
      readHighWater: vi.fn().mockResolvedValue(undefined),
      commit: vi.fn().mockRejectedValue(new RegistryCacheConcurrencyError()),
    };

    await expect(
      loadTrustedRegistry(options(), {
        fetcher: fetcherReturning(new TextEncoder().encode(validRegistry())),
        cache,
      }),
    ).rejects.toThrow(
      'Não foi possível sincronizar o cache do catálogo confiável',
    );
  });

  it('rejeita rollback detectado durante o commit concorrente', async () => {
    const cache: RegistryCache = {
      readHighWater: vi.fn().mockResolvedValue(undefined),
      commit: vi.fn().mockResolvedValue({ accepted: false }),
    };

    await expect(
      loadTrustedRegistry(options(), {
        fetcher: fetcherReturning(new TextEncoder().encode(validRegistry())),
        cache,
      }),
    ).rejects.toThrow(
      'O catálogo verificado possui revisão inferior à já confiada',
    );
  });
});
