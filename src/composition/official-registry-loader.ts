import { Ed25519RegistryVerifier } from '../adapters/ed25519-registry-verifier.js';
import {
  FileRegistryCache,
  resolveRegistryCacheRoot,
} from '../adapters/file-registry-cache.js';
import {
  fingerprintRegistryKeyring,
  officialRegistryKeyring,
} from '../adapters/official-registry-keyring.js';
import { SignedRegistryFetcher } from '../adapters/signed-registry-fetcher.js';
import type { LoadedTrustedRegistry } from '../application/load-trusted-registry.js';
import { loadTrustedRegistry } from '../application/load-trusted-registry.js';

export const officialRegistryUrl =
  'https://jptecno.github.io/template-registry/registry.json';

export function createOfficialRegistryLoader(): () => Promise<LoadedTrustedRegistry> {
  const verifier = new Ed25519RegistryVerifier(officialRegistryKeyring);
  const cache = new FileRegistryCache(resolveRegistryCacheRoot());
  const fetcher = new SignedRegistryFetcher(verifier);
  const trustFingerprint = fingerprintRegistryKeyring(officialRegistryKeyring);

  return () =>
    loadTrustedRegistry(
      {
        registryUrl: officialRegistryUrl,
        trustFingerprint,
        context: 'official',
      },
      { fetcher, verifier, cache },
    );
}
