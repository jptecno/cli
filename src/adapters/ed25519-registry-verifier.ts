import { createHash, createPublicKey, verify } from 'node:crypto';

import { CliError } from '../application/cli-error.js';
import type {
  RegistrySignature,
  RegistrySignatureEnvelope,
} from '../contracts/registry-signature.types.js';

const keyIdPattern = /^[a-z0-9][a-z0-9._-]{0,63}$/;
const sha256Pattern = /^[a-f0-9]{64}$/;
const base64Pattern =
  /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;

export class Ed25519RegistryVerifier {
  constructor(
    private readonly trustedPublicKeys: ReadonlyMap<string, string>,
  ) {}

  verify(payload: Uint8Array, value: unknown): void {
    const envelope = parseSignatureEnvelope(value);
    const payloadSha256 = createHash('sha256').update(payload).digest('hex');

    if (envelope.payloadSha256 !== payloadSha256) {
      throw new CliError(
        'Os bytes do catálogo não correspondem ao envelope de assinatura',
      );
    }

    for (const signature of envelope.signatures) {
      const publicKey = this.trustedPublicKeys.get(signature.keyId);
      if (publicKey === undefined) {
        continue;
      }

      if (verifySignature(payload, signature, publicKey)) {
        return;
      }
    }

    throw new CliError('O catálogo não possui uma assinatura confiável válida');
  }
}

function parseSignatureEnvelope(value: unknown): RegistrySignatureEnvelope {
  if (!isRecord(value) || !hasOnlyEnvelopeFields(value)) {
    throw invalidEnvelope();
  }

  if (
    value.schemaVersion !== 1 ||
    value.algorithm !== 'Ed25519' ||
    typeof value.payloadSha256 !== 'string' ||
    !sha256Pattern.test(value.payloadSha256) ||
    !Array.isArray(value.signatures) ||
    value.signatures.length === 0
  ) {
    throw invalidEnvelope();
  }

  const signatures = value.signatures.map(parseSignature);
  return {
    schemaVersion: 1,
    algorithm: 'Ed25519',
    payloadSha256: value.payloadSha256,
    signatures,
  };
}

function parseSignature(value: unknown): RegistrySignature {
  if (!isRecord(value) || !hasOnlySignatureFields(value)) {
    throw invalidEnvelope();
  }

  if (
    typeof value.keyId !== 'string' ||
    !keyIdPattern.test(value.keyId) ||
    typeof value.signature !== 'string' ||
    !base64Pattern.test(value.signature)
  ) {
    throw invalidEnvelope();
  }

  return { keyId: value.keyId, signature: value.signature };
}

function verifySignature(
  payload: Uint8Array,
  signature: RegistrySignature,
  publicKey: string,
): boolean {
  try {
    const key = createPublicKey(publicKey);
    if (key.asymmetricKeyType !== 'ed25519') {
      return false;
    }

    return verify(
      null,
      payload,
      key,
      Buffer.from(signature.signature, 'base64'),
    );
  } catch {
    return false;
  }
}

function hasOnlyEnvelopeFields(value: Record<string, unknown>): boolean {
  return Object.keys(value).every((key) =>
    ['schemaVersion', 'algorithm', 'payloadSha256', 'signatures'].includes(key),
  );
}

function hasOnlySignatureFields(value: Record<string, unknown>): boolean {
  return Object.keys(value).every((key) =>
    ['keyId', 'signature'].includes(key),
  );
}

function invalidEnvelope(): CliError {
  return new CliError('O envelope de assinatura do catálogo é inválido');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
