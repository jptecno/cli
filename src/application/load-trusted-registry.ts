import {
  type RegistryCache,
  RegistryCacheConcurrencyError,
  type RegistryCacheKey,
} from '../contracts/registry-cache.port.js';
import type {
  RegistryContext,
  TemplateRegistryV2,
} from '../contracts/template-registry-v2.types.js';
import type { VerifiedRegistryFetcher } from '../contracts/verified-registry-fetcher.port.js';
import { CliError } from './cli-error.js';
import { parseTemplateRegistryV2 } from './parse-template-registry-v2.js';
import { createRegistryCacheEntry } from './registry-cache-policy.js';

export interface LoadTrustedRegistryOptions {
  registryUrl: string;
  signatureUrl?: string;
  trustFingerprint: string;
  context?: RegistryContext;
}

export interface LoadTrustedRegistryDependencies {
  fetcher: VerifiedRegistryFetcher;
  cache: RegistryCache;
  now?: () => Date;
}

export async function loadTrustedRegistry(
  options: LoadTrustedRegistryOptions,
  dependencies: LoadTrustedRegistryDependencies,
): Promise<TemplateRegistryV2> {
  const fetchedRegistry = await dependencies.fetcher.load(
    options.registryUrl,
    options.signatureUrl,
  );
  const value = parseJson(fetchedRegistry.payload);
  const registry = parseTemplateRegistryV2(value, options.context);
  const key: RegistryCacheKey = {
    registryUrl: options.registryUrl,
    trustFingerprint: options.trustFingerprint,
  };
  const highWaterRevision = await dependencies.cache.readHighWater(key);

  if (
    highWaterRevision !== undefined &&
    registry.revision < highWaterRevision
  ) {
    throw new CliError(
      'O catálogo verificado possui revisão inferior à já confiada',
    );
  }

  const entry = createRegistryCacheEntry(
    fetchedRegistry,
    registry.revision,
    (dependencies.now ?? (() => new Date()))(),
  );

  let cacheCommitResult: Awaited<ReturnType<RegistryCache['commit']>>;

  try {
    cacheCommitResult = await dependencies.cache.commit(key, entry);
  } catch (error) {
    if (error instanceof RegistryCacheConcurrencyError) {
      throw new CliError(
        'Não foi possível sincronizar o cache do catálogo confiável',
      );
    }

    return registry;
  }

  if (!cacheCommitResult.accepted) {
    throw new CliError(
      'O catálogo verificado possui revisão inferior à já confiada',
    );
  }

  return registry;
}

function parseJson(bytes: Uint8Array): unknown {
  let text: string;

  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    throw new CliError('O catálogo verificado não contém UTF-8 válido');
  }

  try {
    return JSON.parse(text);
  } catch {
    throw new CliError('O catálogo verificado contém JSON inválido');
  }
}
