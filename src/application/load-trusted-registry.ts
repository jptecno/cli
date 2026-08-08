import type {
  RegistryContext,
  TemplateRegistryV2,
} from '../contracts/template-registry-v2.types.js';
import type { VerifiedRegistryFetcher } from '../contracts/verified-registry-fetcher.port.js';
import { CliError } from './cli-error.js';
import { parseTemplateRegistryV2 } from './parse-template-registry-v2.js';

export interface LoadTrustedRegistryOptions {
  registryUrl: string;
  signatureUrl?: string;
  context?: RegistryContext;
}

export interface LoadTrustedRegistryDependencies {
  fetcher: VerifiedRegistryFetcher;
}

export async function loadTrustedRegistry(
  options: LoadTrustedRegistryOptions,
  dependencies: LoadTrustedRegistryDependencies,
): Promise<TemplateRegistryV2> {
  const bytes = await dependencies.fetcher.load(
    options.registryUrl,
    options.signatureUrl,
  );
  const value = parseJson(bytes);

  return parseTemplateRegistryV2(value, options.context);
}

function parseJson(bytes: Uint8Array): unknown {
  let text: string;

  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    throw new CliError('O catálogo verificado não contém UTF-8 válido');
  }

  try {
    return JSON.parse(text);
  } catch {
    throw new CliError('O catálogo verificado contém JSON inválido');
  }
}
