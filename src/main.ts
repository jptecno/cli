#!/usr/bin/env node

import { GitHubRegistryClient } from './adapters/github-registry-client.js';
import { GitHubTemplateSource } from './adapters/github-template-source.js';
import { ProcessCommandExecutor } from './adapters/process-command-executor.js';
import { ReadlinePrompt } from './adapters/readline-prompt.js';
import { CliError } from './application/cli-error.js';
import { createProject } from './application/create-project.js';
import { parseInitCommand } from './application/parse-command.js';

try {
  const options = parseInitCommand(process.argv.slice(2));
  const prompt = new ReadlinePrompt();
  const registry = await new GitHubRegistryClient().load(options.registryUrl);
  const templateId =
    options.templateId ?? (await prompt.selectTemplate(registry.templates));
  const template = await createProject(
    registry,
    { ...options, templateId },
    {
      templateSource: new GitHubTemplateSource(),
      commandExecutor: new ProcessCommandExecutor(),
      prompt,
    },
  );

  console.log(
    `Projeto criado com ${template.name} ${template.version} em ${options.destination}`,
  );
} catch (error) {
  const message =
    error instanceof CliError
      ? error.message
      : 'Erro inesperado ao criar o projeto';
  console.error(`Erro: ${message}`);
  process.exitCode = 1;
}
