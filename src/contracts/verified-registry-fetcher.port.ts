export class RegistryFetchUnavailableError extends Error {
  constructor() {
    super('Não foi possível baixar o catálogo assinado');
    this.name = 'RegistryFetchUnavailableError';
  }
}

export interface VerifiedRegistry {
  payload: Uint8Array;
  signatureEnvelope: Uint8Array;
  signatureUrl: string;
}

export interface VerifiedRegistryFetcher {
  load(registryUrl: string, signatureUrl?: string): Promise<VerifiedRegistry>;
}
