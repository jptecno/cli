import { stdin, stdout } from 'node:process';
import { createInterface } from 'node:readline/promises';

import { CliError } from '../application/cli-error.js';

import type { Prompt } from '../contracts/cli-ports.js';
import type { TemplateDefinition } from '../contracts/template-registry.types.js';

export class ReadlinePrompt implements Prompt {
  async selectTemplate(templates: TemplateDefinition[]): Promise<string> {
    templates.forEach((template, index) => {
      stdout.write(
        `${index + 1}. ${template.name} — ${template.description}\n`,
      );
    });

    const answer = await this.ask('Qual template deseja usar?');
    const index = Number(answer) - 1;
    const template = templates[index];

    if (!Number.isInteger(index) || !template) {
      throw new CliError('Selecione um número de template válido');
    }

    return template.id;
  }

  async ask(question: string, defaultValue?: string): Promise<string> {
    const prompt = defaultValue
      ? `${question} [${defaultValue}]: `
      : `${question}: `;
    const readline = createInterface({ input: stdin, output: stdout });

    try {
      const answer = await readline.question(prompt);
      return answer.trim() || defaultValue || '';
    } finally {
      readline.close();
    }
  }
}
