import {
  type RegistryCache,
  RegistryCacheConcurrencyError,
  type RegistryCacheEntry,
  type RegistryCacheKey,
} from '../contracts/registry-cache.port.js';
import type { RegistrySignatureVerifier } from '../contracts/registry-signature.types.js';
import type {
  RegistryContext,
  TemplateRegistryV2,
} from '../contracts/template-registry-v2.types.js';
import {
  RegistryFetchUnavailableError,
  type VerifiedRegistryFetcher,
} from '../contracts/verified-registry-fetcher.port.js';
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
  verifier: RegistrySignatureVerifier;
  cache: RegistryCache;
  now?: () => Date;
}

export interface LoadedTrustedRegistry {
  registry: TemplateRegistryV2;
  source: 'network' | 'cache';
  freshness: 'fresh' | 'stale';
}

export async function loadTrustedRegistry(
  options: LoadTrustedRegistryOptions,
  dependencies: LoadTrustedRegistryDependencies,
): Promise<LoadedTrustedRegistry> {
  const key: RegistryCacheKey = {
    registryUrl: options.registryUrl,
    trustFingerprint: options.trustFingerprint,
  };

  try {
    const fetchedRegistry = await dependencies.fetcher.load(
      options.registryUrl,
      options.signatureUrl,
    );
    const registry = parseRegistry(fetchedRegistry.payload, options.context);
    await rejectRollback(key, registry.revision, dependencies.cache);

    const entry = createRegistryCacheEntry(
      fetchedRegistry,
      registry.revision,
      (dependencies.now ?? (() => new Date()))(),
    );
    await commitCache(key, entry, dependencies.cache);

    return { registry, source: 'network', freshness: 'fresh' };
  } catch (error) {
    if (!(error instanceof RegistryFetchUnavailableError)) {
      throw error;
    }

    return loadCachedRegistry(key, options, dependencies);
  }
}

async function loadCachedRegistry(
  key: RegistryCacheKey,
  options: LoadTrustedRegistryOptions,
  dependencies: LoadTrustedRegistryDependencies,
): Promise<LoadedTrustedRegistry> {
  const entry = await dependencies.cache.readSnapshot(key);
  if (entry === undefined) {
    throw new CliError('Não há cache confiável disponível para o catálogo');
  }

  if (
    entry.signatureUrl !==
    (options.signatureUrl ?? `${options.registryUrl}.sig`)
  ) {
    throw new CliError(
      'O cache do catálogo confiável possui proveniência inválida',
    );
  }

  const envelope = parseJson(
    entry.signatureEnvelope,
    'O envelope de assinatura do catálogo é inválido',
  );
  dependencies.verifier.verify(entry.payload, envelope);

  const registry = parseRegistry(entry.payload, options.context);
  const highWaterRevision = await dependencies.cache.readHighWater(key);
  if (
    highWaterRevision === undefined ||
    entry.revision !== highWaterRevision ||
    registry.revision !== entry.revision
  ) {
    throw new CliError('O cache do catálogo confiável possui revisão inválida');
  }

  const now = (dependencies.now ?? (() => new Date()))();
  return {
    registry,
    source: 'cache',
    freshness: entry.expiresAt.getTime() <= now.getTime() ? 'stale' : 'fresh',
  };
}

function parseRegistry(
  payload: Uint8Array,
  context: RegistryContext | undefined,
): TemplateRegistryV2 {
  return parseTemplateRegistryV2(
    parseJson(payload, 'O catálogo verificado contém JSON inválido'),
    context,
  );
}

function parseJson(bytes: Uint8Array, invalidJsonMessage: string): unknown {
  let text: string;

  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    throw new CliError('O catálogo verificado não contém UTF-8 válido');
  }

  try {
    return JSON.parse(text);
  } catch {
    throw new CliError(invalidJsonMessage);
  }
}

async function rejectRollback(
  key: RegistryCacheKey,
  revision: number,
  cache: RegistryCache,
): Promise<void> {
  const highWaterRevision = await cache.readHighWater(key);
  if (highWaterRevision !== undefined && revision < highWaterRevision) {
    throw new CliError(
      'O catálogo verificado possui revisão inferior à já confiada',
    );
  }
}

async function commitCache(
  key: RegistryCacheKey,
  entry: RegistryCacheEntry,
  cache: RegistryCache,
): Promise<void> {
  let cacheCommitResult: Awaited<ReturnType<RegistryCache['commit']>>;

  try {
    cacheCommitResult = await cache.commit(key, entry);
  } catch (error) {
    if (error instanceof RegistryCacheConcurrencyError) {
      throw new CliError(
        'Não foi possível sincronizar o cache do catálogo confiável',
      );
    }

    return;
  }

  if (!cacheCommitResult.accepted) {
    throw new CliError(
      'O catálogo verificado possui revisão inferior à já confiada',
    );
  }
}
