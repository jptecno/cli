import type { Prompt } from '../contracts/cli-ports.js';
import { CliError } from './cli-error.js';
import type { LoadedTrustedRegistry } from './load-trusted-registry.js';

export interface AuthorizeStaleRegistryOptions {
  allowStaleRegistry: boolean;
  allowStaleTemplateCreation: boolean;
}

export interface AuthorizeStaleRegistryDependencies {
  prompt: Prompt;
}

export async function authorizeStaleRegistryUse(
  loadedRegistry: LoadedTrustedRegistry,
  options: AuthorizeStaleRegistryOptions,
  dependencies: AuthorizeStaleRegistryDependencies,
): Promise<void> {
  if (loadedRegistry.freshness === 'fresh') {
    return;
  }

  if (!dependencies.prompt.isInteractive()) {
    if (options.allowStaleRegistry) {
      return;
    }

    throw new CliError(
      'É necessária autorização para usar o catálogo desatualizado',
    );
  }

  const confirmed = await dependencies.prompt.confirm(
    'O catálogo está desatualizado. Deseja continuar usando-o?',
    false,
  );
  if (!confirmed) {
    throw new CliError(
      'É necessária autorização para usar o catálogo desatualizado',
    );
  }
}

export async function authorizeStaleTemplateCreation(
  loadedRegistry: LoadedTrustedRegistry,
  options: AuthorizeStaleRegistryOptions,
  dependencies: AuthorizeStaleRegistryDependencies,
): Promise<void> {
  if (loadedRegistry.freshness === 'fresh') {
    return;
  }

  if (!dependencies.prompt.isInteractive()) {
    if (options.allowStaleTemplateCreation) {
      return;
    }

    throw new CliError(
      'É necessária autorização para criar projeto com catálogo desatualizado',
    );
  }

  const confirmed = await dependencies.prompt.confirm(
    'O catálogo está desatualizado. Deseja criar o projeto mesmo assim?',
    false,
  );
  if (!confirmed) {
    throw new CliError(
      'É necessária autorização para criar projeto com catálogo desatualizado',
    );
  }
}
