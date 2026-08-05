import { PassThrough } from 'node:stream';

import { describe, expect, it } from 'vitest';

import { ReadlinePrompt } from '../../src/adapters/readline-prompt.js';

import type { TemplateDefinition } from '../../src/contracts/template-registry.types.js';

const templates: TemplateDefinition[] = [
  {
    id: 'api-nodejs-typescript',
    name: 'API Node.js + TypeScript',
    description: 'Fastify e PostgreSQL',
    repository: 'jptecno/template-api-nodejs-typescript',
    version: 'v0.1.0',
    ref: 'v0.1.0',
  },
  {
    id: 'worker-nodejs-typescript',
    name: 'Worker Node.js + TypeScript',
    description: 'Processamento assíncrono',
    repository: 'jptecno/template-worker-nodejs-typescript',
    version: 'v0.2.0',
    ref: 'v0.2.0',
  },
];

describe('ReadlinePrompt', () => {
  it('navega para o próximo template e confirma a seleção', async () => {
    const input = new FakeTerminalInput(true);
    const output = new FakeTerminalOutput(true);
    const prompt = new ReadlinePrompt(input, output);

    const selection = prompt.selectTemplate(templates);
    input.press({ name: 'down' });
    input.press({ name: 'return' });

    await expect(selection).resolves.toBe('worker-nodejs-typescript');
    expect(input.rawModes).toEqual([true, false]);
    expect(output.content).toContain('❯ Worker Node.js + TypeScript  v0.2.0');
  });

  it('navega circularmente para o último template ao subir no primeiro', async () => {
    const input = new FakeTerminalInput(true);
    const output = new FakeTerminalOutput(true);
    const prompt = new ReadlinePrompt(input, output);

    const selection = prompt.selectTemplate(templates);
    input.press({ name: 'up' });
    input.press({ name: 'enter' });

    await expect(selection).resolves.toBe('worker-nodejs-typescript');
  });

  it('cancela e restaura o modo raw ao receber Ctrl+C', async () => {
    const input = new FakeTerminalInput(true);
    const output = new FakeTerminalOutput(true);
    const prompt = new ReadlinePrompt(input, output);

    const selection = prompt.selectTemplate(templates);
    input.press({ ctrl: true, name: 'c' });

    await expect(selection).rejects.toThrow('Seleção de template cancelada');
    expect(input.rawModes).toEqual([true, false]);
  });

  it('exige --template fora de um terminal interativo', async () => {
    const prompt = new ReadlinePrompt(
      new FakeTerminalInput(false),
      new FakeTerminalOutput(false),
    );

    await expect(prompt.selectTemplate(templates)).rejects.toThrow(
      'Seleção interativa indisponível; informe --template <id>',
    );
  });
});

class FakeTerminalInput extends PassThrough {
  isRaw = false;
  isTTY: boolean;
  rawModes: boolean[] = [];

  constructor(isTTY: boolean) {
    super();
    this.isTTY = isTTY;
  }

  setRawMode(mode: boolean): void {
    this.isRaw = mode;
    this.rawModes.push(mode);
  }

  press(key: { ctrl?: boolean; name?: string }): void {
    this.emit('keypress', '', key);
  }
}

class FakeTerminalOutput extends PassThrough {
  isTTY: boolean;
  content = '';

  constructor(isTTY: boolean) {
    super();
    this.isTTY = isTTY;
  }

  override write(chunk: string | Uint8Array): boolean {
    this.content += chunk.toString();
    return super.write(chunk);
  }
}
