import { CliError } from '../application/cli-error.js';
import type { Ed25519RegistryVerifier } from './ed25519-registry-verifier.js';
import { fetchWithTimeout } from './fetch-with-timeout.js';

const maximumRegistryBytes = 1024 * 1024;
const maximumSignatureEnvelopeBytes = 64 * 1024;

export class SignedRegistryFetcher {
  constructor(private readonly verifier: Ed25519RegistryVerifier) {}

  async load(
    registryUrl: string,
    signatureUrl: string = `${registryUrl}.sig`,
  ): Promise<Uint8Array> {
    validateHttpsUrl(registryUrl);
    validateHttpsUrl(signatureUrl);

    const registry = await downloadBytes(registryUrl, maximumRegistryBytes);
    const envelopeBytes = await downloadBytes(
      signatureUrl,
      maximumSignatureEnvelopeBytes,
    );

    this.verifier.verify(registry, parseSignatureEnvelope(envelopeBytes));
    return registry;
  }
}

async function downloadBytes(
  url: string,
  maximumBytes: number,
): Promise<Uint8Array> {
  let response: Response;

  try {
    response = await fetchWithTimeout(url, { redirect: 'error' });
  } catch {
    throw new CliError('Não foi possível baixar o catálogo assinado');
  }

  if (!response.ok) {
    throw new CliError(
      `Não foi possível baixar o catálogo assinado: HTTP ${response.status}`,
    );
  }

  try {
    return await readResponseBytes(response, maximumBytes);
  } catch (error) {
    if (error instanceof CliError) {
      throw error;
    }

    throw new CliError('Não foi possível ler o catálogo assinado');
  }
}

async function readResponseBytes(
  response: Response,
  maximumBytes: number,
): Promise<Uint8Array> {
  if (response.body === null) {
    throw new CliError('O catálogo assinado não possui conteúdo');
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }

      totalBytes += value.byteLength;
      if (totalBytes > maximumBytes) {
        await reader.cancel();
        throw new CliError('O catálogo assinado excede o limite de tamanho');
      }

      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const bytes = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return bytes;
}

function validateHttpsUrl(value: string): void {
  try {
    if (new URL(value).protocol !== 'https:') {
      throw new Error();
    }
  } catch {
    throw new CliError('O endereço do catálogo assinado deve usar HTTPS');
  }
}

function parseSignatureEnvelope(bytes: Uint8Array): unknown {
  try {
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  } catch {
    throw new CliError('O envelope de assinatura do catálogo é inválido');
  }
}
