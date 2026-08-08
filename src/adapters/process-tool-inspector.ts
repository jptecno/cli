import { spawn } from 'node:child_process';

import type { ToolInspector } from '../contracts/node-toolchain.types.js';

export const toolInspectionTimeoutMilliseconds = 5_000;
export const maximumVersionOutputBytes = 4 * 1024;

type SpawnTool = (
  executable: string,
  args: string[],
  options: {
    shell: false;
    stdio: ['ignore', 'pipe', 'pipe'];
  },
) => SpawnedToolProcess;

interface SpawnedToolProcess {
  stdout: ToolOutput | null;
  stderr: ToolOutput | null;
  kill(): boolean;
  on(event: 'error', listener: (error: unknown) => void): void;
  on(
    event: 'close',
    listener: (code: number | null, signal: string | null) => void,
  ): void;
}

interface ToolOutput {
  on(event: 'data', listener: (chunk: Buffer) => void): void;
  resume(): void;
}

export class ProcessToolInspector implements ToolInspector {
  constructor(private readonly spawnTool: SpawnTool = spawnToolProcess) {}

  inspect(
    tool: 'node' | 'npm',
  ): Promise<Awaited<ReturnType<ToolInspector['inspect']>>> {
    const executable = resolveExecutable(tool);

    return new Promise((resolve) => {
      let settled = false;
      let versionOutput = Buffer.alloc(0);
      let timeout: NodeJS.Timeout | undefined;

      const settle = (
        result: Awaited<ReturnType<ToolInspector['inspect']>>,
      ) => {
        if (settled) {
          return;
        }

        settled = true;
        clearTimeout(timeout);
        resolve(result);
      };

      let child: SpawnedToolProcess;
      try {
        child = this.spawnTool(executable, ['--version'], {
          shell: false,
          stdio: ['ignore', 'pipe', 'pipe'],
        });
      } catch (error) {
        settle(isErrorWithCode(error, 'ENOENT') ? unavailable() : failed());
        return;
      }

      child.stdout?.on('data', (chunk) => {
        if (settled) {
          return;
        }

        if (versionOutput.length + chunk.length > maximumVersionOutputBytes) {
          terminate(child);
          settle(failed());
          return;
        }

        versionOutput = Buffer.concat([versionOutput, chunk]);
      });
      child.stderr?.resume();

      child.on('error', (error) => {
        settle(isErrorWithCode(error, 'ENOENT') ? unavailable() : failed());
      });
      child.on('close', (code, signal) => {
        settle(
          code === 0 && signal === null
            ? {
                status: 'available',
                versionOutput: versionOutput.toString('utf8'),
              }
            : failed(),
        );
      });

      timeout = setTimeout(() => {
        terminate(child);
        settle(failed());
      }, toolInspectionTimeoutMilliseconds);
    });
  }
}

function spawnToolProcess(
  executable: string,
  args: string[],
  options: Parameters<SpawnTool>[2],
): SpawnedToolProcess {
  return spawn(executable, args, options) as unknown as SpawnedToolProcess;
}

function resolveExecutable(tool: 'node' | 'npm'): string {
  if (tool === 'npm' && process.platform === 'win32') {
    return 'npm.cmd';
  }

  return tool;
}

function terminate(child: SpawnedToolProcess): void {
  try {
    child.kill();
  } catch {
    // A falha de encerramento não deve expor uma exceção do processo ao chamador.
  }
}

function isErrorWithCode(error: unknown, code: string): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === code
  );
}

function unavailable(): Awaited<ReturnType<ToolInspector['inspect']>> {
  return { status: 'unavailable' };
}

function failed(): Awaited<ReturnType<ToolInspector['inspect']>> {
  return { status: 'failed' };
}
