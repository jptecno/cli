import { EventEmitter } from 'node:events';

import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  maximumVersionOutputBytes,
  ProcessToolInspector,
  toolInspectionTimeoutMilliseconds,
} from '../../src/adapters/process-tool-inspector.js';

class FakeOutput extends EventEmitter {
  readonly resume = vi.fn();

  write(value: string): void {
    this.emit('data', Buffer.from(value));
  }
}

class FakeChildProcess extends EventEmitter {
  readonly stdout = new FakeOutput();
  readonly stderr = new FakeOutput();
  readonly kill = vi.fn(() => true);
}

function createInspector(child = new FakeChildProcess()) {
  const spawnTool = vi.fn(() => child);
  return { child, inspector: new ProcessToolInspector(spawnTool), spawnTool };
}

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('ProcessToolInspector', () => {
  it('inspeciona apenas node com argumentos e opções fixos', async () => {
    const { child, inspector, spawnTool } = createInspector();

    const result = inspector.inspect('node');

    expect(spawnTool).toHaveBeenCalledWith('node', ['--version'], {
      shell: false,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    expect(child.stderr.resume).toHaveBeenCalledOnce();

    child.stdout.write('v24.0.0\n');
    child.stderr.write('aviso privado\n');
    child.emit('close', 0, null);

    const inspection = await result;
    expect(inspection).toEqual({
      status: 'available',
      versionOutput: 'v24.0.0\n',
    });
    expect(inspection).not.toHaveProperty('stderr');
  });

  it('usa npm.cmd para npm no Windows', async () => {
    const originalDescriptor = Object.getOwnPropertyDescriptor(
      process,
      'platform',
    );
    Object.defineProperty(process, 'platform', {
      value: 'win32',
      configurable: true,
    });

    try {
      const { child, inspector, spawnTool } = createInspector();
      const result = inspector.inspect('npm');

      expect(spawnTool).toHaveBeenCalledWith('npm.cmd', ['--version'], {
        shell: false,
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      child.emit('close', 0, null);
      await expect(result).resolves.toEqual({
        status: 'available',
        versionOutput: '',
      });
    } finally {
      if (originalDescriptor) {
        Object.defineProperty(process, 'platform', originalDescriptor);
      }
    }
  });

  it('classifica ENOENT como indisponível', async () => {
    const { child, inspector } = createInspector();
    const result = inspector.inspect('node');

    child.emit(
      'error',
      Object.assign(new Error('não encontrado'), { code: 'ENOENT' }),
    );

    await expect(result).resolves.toEqual({ status: 'unavailable' });
  });

  it('não altera o resultado quando close ocorre após error', async () => {
    const { child, inspector } = createInspector();
    const result = inspector.inspect('node');

    child.emit(
      'error',
      Object.assign(new Error('não encontrado'), { code: 'ENOENT' }),
    );
    child.emit('close', 0, null);

    await expect(result).resolves.toEqual({ status: 'unavailable' });
  });

  it.each([
    ['EACCES', Object.assign(new Error('acesso negado'), { code: 'EACCES' })],
    ['erro de spawn desconhecido', new Error('erro interno')],
  ])('classifica %s como falha de inspeção', async (_name, error) => {
    const { child, inspector } = createInspector();
    const result = inspector.inspect('node');

    child.emit('error', error);

    await expect(result).resolves.toEqual({ status: 'failed' });
  });

  it('classifica código de saída não zero como falha de inspeção', async () => {
    const { child, inspector } = createInspector();
    const result = inspector.inspect('npm');

    child.emit('close', 1, null);

    await expect(result).resolves.toEqual({ status: 'failed' });
  });

  it('classifica término por sinal como falha de inspeção', async () => {
    const { child, inspector } = createInspector();
    const result = inspector.inspect('npm');

    child.emit('close', null, 'SIGTERM');

    await expect(result).resolves.toEqual({ status: 'failed' });
  });

  it('interrompe e falha ao exceder o limite de saída', async () => {
    const { child, inspector } = createInspector();
    const result = inspector.inspect('node');

    child.stdout.write('x'.repeat(maximumVersionOutputBytes + 1));

    expect(child.kill).toHaveBeenCalledOnce();
    await expect(result).resolves.toEqual({ status: 'failed' });
  });

  it('interrompe e falha após cinco segundos', async () => {
    vi.useFakeTimers();
    const { child, inspector } = createInspector();
    const result = inspector.inspect('node');

    await vi.advanceTimersByTimeAsync(toolInspectionTimeoutMilliseconds);

    expect(child.kill).toHaveBeenCalledOnce();
    await expect(result).resolves.toEqual({ status: 'failed' });
  });
});
