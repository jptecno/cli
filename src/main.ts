#!/usr/bin/env node

import { readFile } from 'node:fs/promises';

import { GitHubTemplateSource } from './adapters/github-template-source.js';
import { ProcessCommandExecutor } from './adapters/process-command-executor.js';
import { ProcessToolInspector } from './adapters/process-tool-inspector.js';
import { ReadlinePrompt } from './adapters/readline-prompt.js';
import { runCli } from './application/run-cli.js';
import { createOfficialRegistryLoader } from './composition/official-registry-loader.js';

process.exitCode = await runCli(process.argv.slice(2), {
  loadTrustedRegistry: createOfficialRegistryLoader(),
  templateSource: new GitHubTemplateSource(),
  commandExecutor: new ProcessCommandExecutor(),
  toolInspector: new ProcessToolInspector(),
  prompt: new ReadlinePrompt(),
  cliVersion: await readCliVersion(),
  log: (message) => console.log(message),
  errorLog: (message) => console.error(message),
});

/**
 * `package.json` não faz parte de `files` no pacote publicado (só `dist/`),
 * mas o npm sempre inclui `package.json` no tarball publicado independente
 * de `files`. Como `dist/main.js` fica um nível abaixo da raiz do pacote,
 * `../package.json` resolve corretamente tanto em desenvolvimento quanto no
 * pacote instalado via npm.
 */
async function readCliVersion(): Promise<string> {
  const packageJsonUrl = new URL('../package.json', import.meta.url);

  try {
    const content = await readFile(packageJsonUrl, 'utf8');
    const parsed = JSON.parse(content) as { version?: unknown };

    if (typeof parsed.version === 'string' && parsed.version.trim() !== '') {
      return parsed.version;
    }
  } catch {
    // Sem versão legível: segue com um valor neutro em vez de falhar o comando.
  }

  return 'desconhecida';
}
