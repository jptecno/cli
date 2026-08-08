export class RegistryCacheConcurrencyError extends Error {
  constructor() {
    super('Não foi possível sincronizar o cache do catálogo confiável');
    this.name = 'RegistryCacheConcurrencyError';
  }
}

export interface RegistryCacheKey {
  registryUrl: string;
  trustFingerprint: string;
}

export interface RegistryCacheEntry {
  payload: Uint8Array;
  signatureEnvelope: Uint8Array;
  signatureUrl: string;
  verifiedAt: Date;
  expiresAt: Date;
  revision: number;
}

export interface RegistryCacheCommitResult {
  accepted: boolean;
}

export interface RegistryCache {
  readHighWater(key: RegistryCacheKey): Promise<number | undefined>;
  commit(
    key: RegistryCacheKey,
    entry: RegistryCacheEntry,
  ): Promise<RegistryCacheCommitResult>;
}
