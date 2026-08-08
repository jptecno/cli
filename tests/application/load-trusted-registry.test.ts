import { describe, expect, it, vi } from 'vitest';

import { CliError } from '../../src/application/cli-error.js';
import { loadTrustedRegistry } from '../../src/application/load-trusted-registry.js';
import type {
  RegistryCache,
  RegistryCacheEntry,
} from '../../src/contracts/registry-cache.port.js';
import type { RegistrySignatureVerifier } from '../../src/contracts/registry-signature.types.js';
import {
  RegistryFetchUnavailableError,
  type VerifiedRegistry,
  type VerifiedRegistryFetcher,
} from '../../src/contracts/verified-registry-fetcher.port.js';

function validRegistry(revision = 4): string {
  return JSON.stringify({
    schemaVersion: 2,
    revision,
    publishedAt: '2026-08-07T12:00:00.123Z',
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
        ],
      },
    ],
  });
}

function fetchedRegistry(
  payload = new TextEncoder().encode(validRegistry()),
): VerifiedRegistry {
  return {
    payload,
    signatureEnvelope: new TextEncoder().encode('{"schemaVersion":1}'),
    signatureUrl: 'https://registry.example/catalog.sig',
  };
}

function entry(
  revision = 4,
  expiresAt = '2026-08-15T00:00:00.000Z',
): RegistryCacheEntry {
  return {
    ...fetchedRegistry(new TextEncoder().encode(validRegistry(revision))),
    verifiedAt: new Date('2026-08-08T00:00:00.000Z'),
    expiresAt: new Date(expiresAt),
    revision,
  };
}

function cache(
  snapshot?: RegistryCacheEntry,
  highWaterRevision = snapshot?.revision,
): RegistryCache {
  return {
    readHighWater: vi.fn().mockResolvedValue(highWaterRevision),
    readSnapshot: vi.fn().mockResolvedValue(snapshot),
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

function verifier(): RegistrySignatureVerifier {
  return { verify: vi.fn() };
}

function unavailableFetcher(): VerifiedRegistryFetcher {
  return {
    load: vi.fn().mockRejectedValue(new RegistryFetchUnavailableError()),
  };
}

describe('loadTrustedRegistry', () => {
  it('retorna registry de rede como fresh e persiste o snapshot autenticado', async () => {
    const registryCache = cache();
    const result = await loadTrustedRegistry(options(), {
      fetcher: { load: vi.fn().mockResolvedValue(fetchedRegistry()) },
      verifier: verifier(),
      cache: registryCache,
      now: () => new Date('2026-08-08T00:00:00.000Z'),
    });

    expect(result).toMatchObject({
      source: 'network',
      freshness: 'fresh',
      registry: { revision: 4 },
    });
    expect(registryCache.commit).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({ revision: 4 }),
    );
  });

  it('retorna cache válido não expirado como fresh após indisponibilidade transitória', async () => {
    const registryCache = cache(entry());
    const signatureVerifier = verifier();
    const result = await loadTrustedRegistry(options(), {
      fetcher: unavailableFetcher(),
      verifier: signatureVerifier,
      cache: registryCache,
      now: () => new Date('2026-08-10T00:00:00.000Z'),
    });

    expect(result).toMatchObject({
      source: 'cache',
      freshness: 'fresh',
      registry: { revision: 4 },
    });
    expect(signatureVerifier.verify).toHaveBeenCalledWith(entry().payload, {
      schemaVersion: 1,
    });
  });

  it('classifica cache expirado exatamente no expiresAt como stale', async () => {
    const cached = entry();
    await expect(
      loadTrustedRegistry(options(), {
        fetcher: unavailableFetcher(),
        verifier: verifier(),
        cache: cache(cached),
        now: () => cached.expiresAt,
      }),
    ).resolves.toMatchObject({ source: 'cache', freshness: 'stale' });
  });

  it.each([
    ['assinatura', new CliError('A assinatura do catálogo é inválida')],
    ['schema', new CliError('O catálogo verificado possui schema inválido')],
    [
      'semântica',
      new CliError('O catálogo verificado possui semântica inválida'),
    ],
    [
      'HTTP normal',
      new CliError('Não foi possível baixar o catálogo assinado: HTTP 404'),
    ],
    [
      'redirect',
      new CliError('O catálogo assinado não permite redirecionamentos'),
    ],
  ])(
    'não consulta cache quando a falha de %s não é indisponibilidade transitória',
    async (_name, error) => {
      const registryCache = cache(entry());
      await expect(
        loadTrustedRegistry(options(), {
          fetcher: { load: vi.fn().mockRejectedValue(error) },
          verifier: verifier(),
          cache: registryCache,
        }),
      ).rejects.toBe(error);
      expect(registryCache.readSnapshot).not.toHaveBeenCalled();
    },
  );

  it.each([
    ['UTF-8 inválido', new Uint8Array([0xc3, 0x28])],
    ['JSON inválido', new TextEncoder().encode('{')],
    [
      'schema inválido',
      new TextEncoder().encode(JSON.stringify({ schemaVersion: 1 })),
    ],
  ])(
    'não consulta cache após registry de rede com %s',
    async (_name, payload) => {
      const registryCache = cache(entry());
      await expect(
        loadTrustedRegistry(options(), {
          fetcher: {
            load: vi.fn().mockResolvedValue(fetchedRegistry(payload)),
          },
          verifier: verifier(),
          cache: registryCache,
        }),
      ).rejects.toBeInstanceOf(CliError);
      expect(registryCache.readSnapshot).not.toHaveBeenCalled();
    },
  );

  it('não retorna snapshot adulterado quando sua assinatura não confere', async () => {
    const signatureVerifier: RegistrySignatureVerifier = {
      verify: vi.fn(() => {
        throw new CliError('A assinatura do catálogo é inválida');
      }),
    };
    await expect(
      loadTrustedRegistry(options(), {
        fetcher: unavailableFetcher(),
        verifier: signatureVerifier,
        cache: cache(entry()),
      }),
    ).rejects.toThrow('A assinatura do catálogo é inválida');
  });

  it('não retorna snapshot com envelope inválido', async () => {
    const cached = entry();
    cached.signatureEnvelope = new Uint8Array([0xc3, 0x28]);
    const signatureVerifier = verifier();
    await expect(
      loadTrustedRegistry(options(), {
        fetcher: unavailableFetcher(),
        verifier: signatureVerifier,
        cache: cache(cached),
      }),
    ).rejects.toThrow('O catálogo verificado não contém UTF-8 válido');
    expect(signatureVerifier.verify).not.toHaveBeenCalled();
  });

  it.each([
    ['revision do payload', entry(4), 4, 5],
    ['revision da entrada', entry(5), 4, 4],
  ])(
    'rejeita cache com %s divergente',
    async (_name, cached, highWater, payloadRevision) => {
      cached.payload = new TextEncoder().encode(validRegistry(payloadRevision));
      await expect(
        loadTrustedRegistry(options(), {
          fetcher: unavailableFetcher(),
          verifier: verifier(),
          cache: cache(cached, highWater),
        }),
      ).rejects.toThrow(
        'O cache do catálogo confiável possui revisão inválida',
      );
    },
  );

  it('não retorna snapshot com proveniência adulterada', async () => {
    const cached = entry();
    cached.signatureUrl = 'https://attacker.example/catalog.sig';
    await expect(
      loadTrustedRegistry(options(), {
        fetcher: unavailableFetcher(),
        verifier: verifier(),
        cache: cache(cached),
      }),
    ).rejects.toThrow(
      'O cache do catálogo confiável possui proveniência inválida',
    );
  });

  it('rejeita cache sem high-water', async () => {
    const cached = entry();
    const registryCache: RegistryCache = {
      readHighWater: vi.fn().mockResolvedValue(undefined),
      readSnapshot: vi.fn().mockResolvedValue(cached),
      commit: vi.fn().mockResolvedValue({ accepted: true }),
    };
    await expect(
      loadTrustedRegistry(options(), {
        fetcher: unavailableFetcher(),
        verifier: verifier(),
        cache: registryCache,
      }),
    ).rejects.toThrow('O cache do catálogo confiável possui revisão inválida');
  });

  it('preserva a proteção contra rollback de resposta de rede', async () => {
    const registryCache = cache(undefined, 5);
    await expect(
      loadTrustedRegistry(options(), {
        fetcher: { load: vi.fn().mockResolvedValue(fetchedRegistry()) },
        verifier: verifier(),
        cache: registryCache,
      }),
    ).rejects.toThrow(
      'O catálogo verificado possui revisão inferior à já confiada',
    );
    expect(registryCache.commit).not.toHaveBeenCalled();
  });
});
