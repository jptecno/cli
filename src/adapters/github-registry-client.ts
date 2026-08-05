import { CliError } from '../application/cli-error.js';
import { parseTemplateRegistry } from '../application/parse-template-registry.js';

import type { RegistryClient } from '../contracts/cli-ports.js';
import type { TemplateRegistry } from '../contracts/template-registry.types.js';

export class GitHubRegistryClient implements RegistryClient {
  async load(url: string): Promise<TemplateRegistry> {
    let response: Response;

    try {
      response = await fetch(url);
    } catch (error) {
      throw new CliError(
        `Não foi possível acessar o catálogo de templates: ${formatError(error)}`,
      );
    }

    if (!response.ok) {
      throw new CliError(
        `Não foi possível acessar o catálogo de templates: HTTP ${response.status}`,
      );
    }

    try {
      return parseTemplateRegistry((await response.json()) as unknown);
    } catch (error) {
      if (error instanceof CliError) {
        throw error;
      }

      throw new CliError(
        `Não foi possível interpretar o catálogo de templates: ${formatError(error)}`,
      );
    }
  }
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : 'erro desconhecido';
}
