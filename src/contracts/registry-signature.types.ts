export interface RegistrySignature {
  keyId: string;
  signature: string;
}

export interface RegistrySignatureEnvelope {
  schemaVersion: 1;
  algorithm: 'Ed25519';
  payloadSha256: string;
  signatures: RegistrySignature[];
}
