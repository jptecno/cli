import { createHash, generateKeyPairSync, sign } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import { Ed25519RegistryVerifier } from '../../src/adapters/ed25519-registry-verifier.js';
import {
  fingerprintRegistryKeyring,
  officialRegistryKeyring,
} from '../../src/adapters/official-registry-keyring.js';
import type { RegistrySignatureEnvelope } from '../../src/contracts/registry-signature.types.js';

const payload = Buffer.from('{"schemaVersion":2}');
const { privateKey, publicKey } = generateKeyPairSync('ed25519');
const trustedKeyId = 'test-key';
const trustedPublicKey = publicKey.export({ format: 'pem', type: 'spki' });

function createEnvelope(
  signedPayload: Uint8Array = payload,
  keyId: string = trustedKeyId,
): RegistrySignatureEnvelope {
  return {
    algorithm: 'Ed25519',
    payloadSha256: createHash('sha256').update(signedPayload).digest('hex'),
    schemaVersion: 1,
    signatures: [
      {
        keyId,
        signature: sign(null, signedPayload, privateKey).toString('base64'),
      },
    ],
  };
}

describe('Ed25519RegistryVerifier', () => {
  it('aceita bytes exatos com uma assinatura Ed25519 de chave confiável', () => {
    const verifier = new Ed25519RegistryVerifier(
      new Map([[trustedKeyId, trustedPublicKey]]),
    );

    expect(() => verifier.verify(payload, createEnvelope())).not.toThrow();
  });

  it('rejeita payload alterado antes de qualquer parse do registry', () => {
    const verifier = new Ed25519RegistryVerifier(
      new Map([[trustedKeyId, trustedPublicKey]]),
    );

    expect(() =>
      verifier.verify(Buffer.from('{"schemaVersion":3}'), createEnvelope()),
    ).toThrow(
      'Os bytes do catálogo não correspondem ao envelope de assinatura',
    );
  });

  it('rejeita envelope sem assinatura de chave confiável', () => {
    const verifier = new Ed25519RegistryVerifier(
      new Map([[trustedKeyId, trustedPublicKey]]),
    );

    expect(() =>
      verifier.verify(payload, createEnvelope(payload, 'unknown-key')),
    ).toThrow('O catálogo não possui uma assinatura confiável válida');
  });

  it('não eleva confiança com assinaturas desconhecidas ou duplicadas', () => {
    const verifier = new Ed25519RegistryVerifier(
      new Map([[trustedKeyId, trustedPublicKey]]),
    );
    const envelope = createEnvelope();
    const signature = envelope.signatures[0];

    if (signature === undefined) {
      throw new Error('Fixture sem assinatura');
    }

    envelope.signatures = [
      { keyId: 'unknown-key', signature: signature.signature },
      { ...signature, signature: Buffer.from('inválida').toString('base64') },
      signature,
    ];

    expect(() => verifier.verify(payload, envelope)).not.toThrow();
  });

  it('rejeita envelope fora do contrato esperado', () => {
    const verifier = new Ed25519RegistryVerifier(
      new Map([[trustedKeyId, trustedPublicKey]]),
    );

    expect(() =>
      verifier.verify(payload, { ...createEnvelope(), unexpected: true }),
    ).toThrow('O envelope de assinatura do catálogo é inválido');
  });

  it('gera fingerprint determinístico a partir dos pares keyId e PEM ordenados', () => {
    const first = new Map([
      ['b', 'PEM B'],
      ['a', 'PEM A'],
    ]);
    const second = new Map([
      ['a', 'PEM A'],
      ['b', 'PEM B'],
    ]);

    expect(fingerprintRegistryKeyring(first)).toBe(
      fingerprintRegistryKeyring(second),
    );
    expect(fingerprintRegistryKeyring(first)).not.toBe(
      fingerprintRegistryKeyring(
        new Map([
          ['a', 'PEM alterado'],
          ['b', 'PEM B'],
        ]),
      ),
    );
  });

  it('mantém somente a chave pública oficial associada ao keyId publicado', () => {
    const publicKey = officialRegistryKeyring.get('registry-2026-08');

    expect(officialRegistryKeyring.size).toBe(1);
    expect(publicKey).toContain(
      'MCowBQYDK2VwAyEAD2T/94yW4zfpSDhTh2oMO8pHFaMYRNL6nHRpI4gxHNg=',
    );
    expect(publicKey).not.toContain('PRIVATE KEY');
  });
});
