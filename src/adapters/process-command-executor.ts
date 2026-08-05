import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

import { CliError } from '../application/cli-error.js';

import type { CommandExecutor } from '../contracts/cli-ports.js';

const executeFile = promisify(execFile);

export class ProcessCommandExecutor implements CommandExecutor {
  async run(command: string, arguments_: string[], cwd: string): Promise<void> {
    try {
      await executeFile(command, arguments_, { cwd });
    } catch (error) {
      throw new CliError(
        `Falha ao executar ${command} ${arguments_.join(' ')}: ${formatError(error)}`,
      );
    }
  }
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : 'erro desconhecido';
}
