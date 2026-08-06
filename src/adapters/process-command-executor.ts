import { spawn } from 'node:child_process';

import { CliError } from '../application/cli-error.js';

import type { CommandExecutor } from '../contracts/cli-ports.js';

export class ProcessCommandExecutor implements CommandExecutor {
  async run(command: string, arguments_: string[], cwd: string): Promise<void> {
    const executable = resolveExecutable(command);
    const description = `${command} ${arguments_.join(' ')}`.trim();

    return new Promise<void>((resolve, reject) => {
      const child = spawn(executable, arguments_, {
        cwd,
        stdio: 'inherit',
      });

      child.on('error', (error) => {
        reject(
          new CliError(
            `Falha ao executar ${description}: ${formatError(error)}`,
          ),
        );
      });

      child.on('close', (code, signal) => {
        if (code === 0) {
          resolve();
          return;
        }

        const reason =
          code === null
            ? `interrompido pelo sinal ${signal ?? 'desconhecido'}`
            : `código de saída ${code}`;

        reject(new CliError(`Falha ao executar ${description}: ${reason}`));
      });
    });
  }
}

/**
 * No Windows, `npm` é distribuído como script (`npm.cmd`), enquanto `git` é um
 * executável nativo (`git.exe`) sem variante `.cmd`. Como `spawn` sem `shell`
 * não resolve scripts `.cmd`/`.bat` automaticamente, sufixamos apenas `npm`
 * neste ambiente; sufixar `git` também quebraria a execução por ENOENT.
 * Os únicos comandos disparados pela aplicação são `git` e `npm` (ver
 * `src/application/create-project.ts`), então esse mapeamento explícito é
 * suficiente e evita `shell: true`, que abriria espaço para injeção de
 * comando.
 */
function resolveExecutable(command: string): string {
  if (process.platform !== 'win32') {
    return command;
  }

  return command === 'npm' ? `${command}.cmd` : command;
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : 'erro desconhecido';
}
