import { CliError } from '../application/cli-error.js';
import type { RegistrySignatureVerifier } from '../contracts/registry-signature.types.js';
import {
  RegistryFetchUnavailableError,
  type VerifiedRegistry,
  type VerifiedRegistryFetcher,
} from '../contracts/verified-registry-fetcher.port.js';
import { fetchWithTimeout } from './fetch-with-timeout.js';

const maximumRegistryBytes = 1024 * 1024;
const maximumSignatureEnvelopeBytes = 64 * 1024;

export class SignedRegistryFetcher implements VerifiedRegistryFetcher {
  constructor(private readonly verifier: RegistrySignatureVerifier) {}

  async load(
    registryUrl: string,
    signatureUrl: string = `${registryUrl}.sig`,
  ): Promise<VerifiedRegistry> {
    validateHttpsUrl(registryUrl);
    validateHttpsUrl(signatureUrl);

    const registry = await downloadBytes(registryUrl, maximumRegistryBytes);
    const envelopeBytes = await downloadBytes(
      signatureUrl,
      maximumSignatureEnvelopeBytes,
    );

    this.verifier.verify(registry, parseSignatureEnvelope(envelopeBytes));

    return {
      payload: registry,
      signatureEnvelope: envelopeBytes,
      signatureUrl,
    };
  }
}

async function downloadBytes(
  url: string,
  maximumBytes: number,
): Promise<Uint8Array> {
  let response: Response;

  try {
    response = await fetchWithTimeout(url, { redirect: 'error' });
  } catch (error) {
    if (isRedirectFailure(error)) {
      throw new CliError('O catálogo assinado não permite redirecionamentos');
    }

    throw new RegistryFetchUnavailableError();
  }

  if (!response.ok) {
    if (
      response.status === 408 ||
      response.status === 429 ||
      response.status >= 500
    ) {
      throw new RegistryFetchUnavailableError();
    }

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

    throw new RegistryFetchUnavailableError();
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

function isRedirectFailure(error: unknown): boolean {
  const visited = new Set<object>();
  let current = error;

  while (typeof current === 'object' && current !== null) {
    if (visited.has(current)) {
      return false;
    }

    visited.add(current);
    if (
      current instanceof Error &&
      current.message.toLowerCase().includes('redirect')
    ) {
      return true;
    }

    try {
      current = Reflect.get(current, 'cause');
    } catch {
      return false;
    }
  }

  return false;
}
