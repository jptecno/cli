import type { LoadedTrustedRegistry } from '../application/load-trusted-registry.js';
import { parseTemplateRegistryV2 } from '../application/parse-template-registry-v2.js';
import { type RunCliDependencies, runCli } from '../application/run-cli.js';

export type CliHarnessDependencies = Omit<
  RunCliDependencies,
  'loadTrustedRegistry'
>;

export interface RunCliHarnessOptions extends CliHarnessDependencies {
  registry: unknown;
}

/**
 * Cria o carregador determinístico usado por testes de integração locais.
 * O catálogo passa pela mesma validação oficial aplicada ao catálogo remoto.
 */
export function createInMemoryOfficialRegistry(
  registry: unknown,
): LoadedTrustedRegistry {
  return {
    registry: parseTemplateRegistryV2(registry, 'official'),
    source: 'network',
    freshness: 'fresh',
  };
}

/**
 * Executa a aplicação sem compor adaptadores de produção.
 */
export function runCliHarness(
  argv: string[],
  options: RunCliHarnessOptions,
): Promise<number> {
  const { registry, ...dependencies } = options;
  const loadedRegistry = createInMemoryOfficialRegistry(registry);

  return runCli(argv, {
    ...dependencies,
    loadTrustedRegistry: async () => loadedRegistry,
  });
}
