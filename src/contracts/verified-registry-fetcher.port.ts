export interface VerifiedRegistryFetcher {
  load(registryUrl: string, signatureUrl?: string): Promise<Uint8Array>;
}
