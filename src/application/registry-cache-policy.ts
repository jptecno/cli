import type { RegistryCacheEntry } from '../contracts/registry-cache.port.js';
import type { VerifiedRegistry } from '../contracts/verified-registry-fetcher.port.js';

const registryCacheTtlMilliseconds = 7 * 24 * 60 * 60 * 1000;

export function createRegistryCacheEntry(
  registry: VerifiedRegistry,
  revision: number,
  verifiedAt: Date,
): RegistryCacheEntry {
  return {
    payload: registry.payload,
    signatureEnvelope: registry.signatureEnvelope,
    signatureUrl: registry.signatureUrl,
    verifiedAt,
    expiresAt: new Date(verifiedAt.getTime() + registryCacheTtlMilliseconds),
    revision,
  };
}
