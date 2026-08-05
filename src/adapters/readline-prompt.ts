import { stdin, stdout } from 'node:process';
import { emitKeypressEvents } from 'node:readline';
import { createInterface } from 'node:readline/promises';

import { CliError } from '../application/cli-error.js';

import type { Prompt } from '../contracts/cli-ports.js';
import type { TemplateDefinition } from '../contracts/template-registry.types.js';

type TerminalInput = NodeJS.ReadableStream & {
  isRaw?: boolean;
  isTTY?: boolean;
  setRawMode?: (mode: boolean) => void;
};

type TerminalOutput = NodeJS.WritableStream & {
  isTTY?: boolean;
};

interface Keypress {
  ctrl?: boolean;
  name?: string;
}

export class ReadlinePrompt implements Prompt {
  constructor(
    private readonly input: TerminalInput = stdin,
    private readonly output: TerminalOutput = stdout,
  ) {}

  async selectTemplate(templates: TemplateDefinition[]): Promise<string> {
    if (templates.length === 0) {
      throw new CliError('Não há templates disponíveis para seleção');
    }

    const rawModeSetter = this.input.setRawMode;

    if (!this.input.isTTY || !this.output.isTTY || !rawModeSetter) {
      throw new CliError(
        'Seleção interativa indisponível; informe --template <id>',
      );
    }

    const setRawMode = (mode: boolean) => {
      rawModeSetter.call(this.input, mode);
    };

    return new Promise((resolve, reject) => {
      let selectedIndex = 0;
      let renderedLineCount = 0;
      const wasRaw = this.input.isRaw ?? false;

      const render = () => {
        if (renderedLineCount > 0) {
          this.output.write(`\u001B[${renderedLineCount}A\r\u001B[0J`);
        }

        const menu = formatTemplateMenu(templates, selectedIndex);
        this.output.write(`${menu}\n`);
        renderedLineCount = menu.split('\n').length + 1;
      };

      const cleanup = () => {
        this.input.off('keypress', onKeypress);
        setRawMode(wasRaw);
      };

      const confirm = () => {
        const template = templates[selectedIndex];

        cleanup();
        resolve(template.id);
      };

      const cancel = () => {
        cleanup();
        reject(new CliError('Seleção de template cancelada'));
      };

      const onKeypress = (_character: string, key: Keypress) => {
        if (key.ctrl && key.name === 'c') {
          cancel();
          return;
        }

        if (key.name === 'escape') {
          cancel();
          return;
        }

        if (key.name === 'return' || key.name === 'enter') {
          confirm();
          return;
        }

        if (key.name === 'up') {
          selectedIndex =
            (selectedIndex - 1 + templates.length) % templates.length;
          render();
          return;
        }

        if (key.name === 'down') {
          selectedIndex = (selectedIndex + 1) % templates.length;
          render();
        }
      };

      emitKeypressEvents(this.input);
      setRawMode(true);
      this.input.resume();
      this.input.on('keypress', onKeypress);
      render();
    });
  }

  async ask(question: string, defaultValue?: string): Promise<string> {
    const prompt = defaultValue
      ? `${question} [${defaultValue}]: `
      : `${question}: `;
    const readline = createInterface({
      input: this.input,
      output: this.output,
    });

    try {
      const answer = await readline.question(prompt);
      return answer.trim() || defaultValue || '';
    } finally {
      readline.close();
    }
  }
}

function formatTemplateMenu(
  templates: TemplateDefinition[],
  selectedIndex: number,
): string {
  const entries = templates.map((template, index) => {
    const marker = index === selectedIndex ? '❯' : ' ';
    return `${marker} ${template.name}  ${template.version}\n  ${template.description}`;
  });

  return `Qual template deseja usar?\n\n${entries.join('\n\n')}\n\nUse ↑/↓ para navegar e Enter para confirmar.`;
}
