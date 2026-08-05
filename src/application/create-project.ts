import {
  lstat,
  mkdir,
  readdir,
  readFile,
  rm,
  writeFile,
} from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
import type {
  CommandExecutor,
  Prompt,
  TemplateSource,
} from '../contracts/cli-ports.js';
import type {
  TemplateManifest,
  TemplateVariable,
} from '../contracts/template-manifest.types.js';
import type {
  TemplateDefinition,
  TemplateRegistry,
} from '../contracts/template-registry.types.js';
import { CliError } from './cli-error.js';
import { parseTemplateManifest } from './parse-template-manifest.js';

export interface CreateProjectOptions {
  destination: string;
  templateId: string;
  values: Record<string, string>;
  installDependencies: boolean;
  initializeGit: boolean;
  validateProject: boolean;
}

export interface CreateProjectDependencies {
  templateSource: TemplateSource;
  commandExecutor: CommandExecutor;
  prompt: Prompt;
}

export async function createProject(
  registry: TemplateRegistry,
  options: CreateProjectOptions,
  dependencies: CreateProjectDependencies,
): Promise<TemplateDefinition> {
  const template = registry.templates.find(
    (item) => item.id === options.templateId,
  );

  if (!template) {
    throw new CliError(`Template não encontrado: ${options.templateId}`);
  }

  await ensureDestinationIsEmpty(options.destination);
  await dependencies.templateSource.materialize(template, options.destination);

  const manifest = await readTemplateManifest(options.destination);

  if (manifest.id !== template.id) {
    throw new CliError(
      `O manifesto baixado não corresponde ao template solicitado: ${template.id}`,
    );
  }

  const values = await resolveVariables(
    manifest,
    options.values,
    dependencies.prompt,
  );
  await renderTemplateFiles(options.destination, manifest, values);
  await removeTemplateMetadata(options.destination);

  if (options.initializeGit) {
    await dependencies.commandExecutor.run(
      'git',
      ['init'],
      options.destination,
    );
  }

  if (options.installDependencies) {
    await dependencies.commandExecutor.run(
      'npm',
      ['install'],
      options.destination,
    );
  }

  if (options.validateProject) {
    await dependencies.commandExecutor.run(
      'npm',
      ['run', 'check'],
      options.destination,
    );
  }

  return template;
}

async function ensureDestinationIsEmpty(destination: string): Promise<void> {
  try {
    const entries = await readdir(destination);

    if (entries.length > 0) {
      throw new CliError(
        `O diretório de destino não está vazio: ${destination}`,
      );
    }
  } catch (error) {
    if (isNotFoundError(error)) {
      await mkdir(destination, { recursive: true });
      return;
    }

    throw error;
  }
}

async function readTemplateManifest(
  destination: string,
): Promise<TemplateManifest> {
  const manifestPath = resolveTemplatePath(destination, 'template.json');

  try {
    await ensureRegularFile(manifestPath);
    const content = await readFile(manifestPath, 'utf8');
    return parseTemplateManifest(JSON.parse(content) as unknown);
  } catch (error) {
    if (error instanceof CliError) {
      throw error;
    }

    throw new CliError(
      `Não foi possível ler o manifesto do template: ${formatError(error)}`,
    );
  }
}

async function resolveVariables(
  manifest: TemplateManifest,
  providedValues: Record<string, string>,
  prompt: Prompt,
): Promise<Record<string, string>> {
  const values: Record<string, string> = {};

  for (const variable of manifest.variables) {
    const providedValue = providedValues[variable.name];
    const value =
      providedValue ?? (await prompt.ask(variable.prompt, variable.default));

    validateVariable(variable, value);
    values[variable.name] = value;
  }

  return values;
}

function validateVariable(variable: TemplateVariable, value: string): void {
  if (variable.required && value.trim() === '') {
    throw new CliError(`A variável ${variable.name} é obrigatória`);
  }

  if (variable.pattern && value !== '') {
    let expression: RegExp;

    try {
      expression = new RegExp(variable.pattern);
    } catch {
      throw new CliError(`O padrão da variável ${variable.name} é inválido`);
    }

    if (!expression.test(value)) {
      throw new CliError(`O valor da variável ${variable.name} é inválido`);
    }
  }
}

async function renderTemplateFiles(
  destination: string,
  manifest: TemplateManifest,
  values: Record<string, string>,
): Promise<void> {
  for (const relativePath of manifest.render.include) {
    const filePath = resolveTemplatePath(destination, relativePath);
    await ensureRegularFile(filePath);
    const content = await readFile(filePath, 'utf8');
    const rendered = renderTemplateContent(relativePath, content, values);

    ensureVariablesWereRendered(rendered, manifest, relativePath);
    await writeFile(filePath, rendered);
  }
}

function renderTemplateContent(
  relativePath: string,
  content: string,
  values: Record<string, string>,
): string {
  if (extname(relativePath) === '.json') {
    const renderedJson = renderJsonValue(
      JSON.parse(content) as unknown,
      values,
    );
    return `${JSON.stringify(renderedJson, null, 2)}\n`;
  }

  return renderText(content, values);
}

function renderJsonValue(
  value: unknown,
  values: Record<string, string>,
): unknown {
  if (typeof value === 'string') {
    return renderText(value, values);
  }

  if (Array.isArray(value)) {
    return value.map((item) => renderJsonValue(item, values));
  }

  if (typeof value === 'object' && value !== null) {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        key,
        renderJsonValue(item, values),
      ]),
    );
  }

  return value;
}

function renderText(content: string, values: Record<string, string>): string {
  return Object.entries(values).reduce(
    (currentContent, [name, value]) =>
      currentContent.split(`{{${name}}}`).join(value),
    content,
  );
}

function ensureVariablesWereRendered(
  content: string,
  manifest: TemplateManifest,
  relativePath: string,
): void {
  for (const variable of manifest.variables) {
    if (content.includes(`{{${variable.name}}}`)) {
      throw new CliError(
        `Não foi possível renderizar a variável ${variable.name} em ${relativePath}`,
      );
    }
  }
}

async function removeTemplateMetadata(destination: string): Promise<void> {
  await Promise.all(
    ['template.json', 'TEMPLATE.md'].map(async (relativePath) => {
      const path = resolveTemplatePath(destination, relativePath);
      await rm(path, { force: true });
    }),
  );
}

function resolveTemplatePath(
  destination: string,
  relativePath: string,
): string {
  const root = resolve(destination);
  const resolvedPath = resolve(root, relativePath);

  if (resolvedPath !== root && !resolvedPath.startsWith(`${root}${sep}`)) {
    throw new CliError(
      'O manifesto tentou acessar um arquivo fora do diretório do projeto',
    );
  }

  return resolvedPath;
}

async function ensureRegularFile(path: string): Promise<void> {
  const details = await lstat(path);

  if (!details.isFile() || details.isSymbolicLink()) {
    throw new CliError(`O template declarou um arquivo inválido: ${path}`);
  }
}

function isNotFoundError(error: unknown): error is NodeJS.ErrnoException {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === 'ENOENT'
  );
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : 'erro desconhecido';
}
