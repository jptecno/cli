#!/usr/bin/env node

import { GitHubRegistryClient } from './adapters/github-registry-client.js';
import { GitHubTemplateSource } from './adapters/github-template-source.js';
import { ProcessCommandExecutor } from './adapters/process-command-executor.js';
import { ReadlinePrompt } from './adapters/readline-prompt.js';
import { CliError } from './application/cli-error.js';
import { createProject } from './application/create-project.js';
import { formatTemplateList } from './application/format-template-list.js';
import { parseCliCommand } from './application/parse-cli-command.js';

try {
  const command = parseCliCommand(process.argv.slice(2));
  const registry = await new GitHubRegistryClient().load(command.registryUrl);

  if (command.kind === 'template-list') {
    console.log(formatTemplateList(registry.templates));
  } else {
    const prompt = new ReadlinePrompt();
    const templateId =
      command.templateId ?? (await prompt.selectTemplate(registry.templates));
    const template = await createProject(
      registry,
      { ...command, templateId },
      {
        templateSource: new GitHubTemplateSource(),
        commandExecutor: new ProcessCommandExecutor(),
        prompt,
      },
    );

    console.log(
      `Projeto criado com ${template.name} ${template.version} em ${command.destination}`,
    );
  }
} catch (error) {
  const message =
    error instanceof CliError
      ? error.message
      : 'Erro inesperado ao criar o projeto';
  console.error(`Erro: ${message}`);
  process.exitCode = 1;
}
