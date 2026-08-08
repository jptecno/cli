export interface VerifiedRegistry {
  payload: Uint8Array;
  signatureEnvelope: Uint8Array;
  signatureUrl: string;
}

export interface VerifiedRegistryFetcher {
  load(registryUrl: string, signatureUrl?: string): Promise<VerifiedRegistry>;
}
