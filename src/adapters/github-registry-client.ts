import { CliError } from '../application/cli-error.js';
import { parseTemplateRegistry } from '../application/parse-template-registry.js';
import type { RegistryClient } from '../contracts/cli-ports.js';
import type { TemplateRegistry } from '../contracts/template-registry.types.js';
import { fetchWithTimeout, formatFetchError } from './fetch-with-timeout.js';

export class GitHubRegistryClient implements RegistryClient {
  async load(url: string): Promise<TemplateRegistry> {
    let response: Response;

    try {
      response = await fetchWithTimeout(url);
    } catch (error) {
      throw new CliError(
        `Não foi possível acessar o catálogo de templates: ${formatFetchError(error)}`,
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
        `Não foi possível interpretar o catálogo de templates: ${formatFetchError(error)}`,
      );
    }
  }
}
