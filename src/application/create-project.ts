import {
  lstat,
  mkdir,
  readdir,
  readFile,
  realpath,
  rm,
  writeFile,
} from 'node:fs/promises';
import { basename, dirname, extname, resolve, sep } from 'node:path';
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
  initializeGit: boolean;
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

  const destinationWasCreated = await ensureDestinationIsEmpty(
    options.destination,
  );

  try {
    await dependencies.templateSource.materialize(
      template,
      options.destination,
    );

    const manifest = await readTemplateManifest(options.destination);

    if (manifest.id !== template.id) {
      throw new CliError(
        `O manifesto baixado não corresponde ao template solicitado: ${template.id}`,
      );
    }

    if (manifest.repository !== template.repository) {
      throw new CliError(
        'O manifesto baixado não corresponde ao repositório do template solicitado',
      );
    }

    ensureProvidedValuesAreDeclared(manifest, options.values);

    const values = await resolveVariables(
      manifest,
      options.values,
      dependencies.prompt,
    );
    await renderTemplateFiles(options.destination, manifest, values);
    await removeTemplateMetadata(options.destination);
  } catch (error) {
    await rollbackDestination(options.destination, destinationWasCreated);
    throw error;
  }

  if (options.initializeGit) {
    await dependencies.commandExecutor.run(
      'git',
      ['init'],
      options.destination,
    );
  }

  return template;
}

/**
 * Garante que o diretório de destino existe e está vazio.
 *
 * Retorna `true` quando o diretório foi criado por esta chamada (e portanto
 * pode ser removido por completo em caso de falha posterior) e `false`
 * quando o diretório já existia previamente vazio (nesse caso, uma falha
 * posterior deve limpar apenas o conteúdo criado, preservando o diretório).
 */
async function ensureDestinationIsEmpty(destination: string): Promise<boolean> {
  try {
    const entries = await readdir(destination);

    if (entries.length > 0) {
      throw new CliError(
        `O diretório de destino não está vazio: ${destination}`,
      );
    }

    return false;
  } catch (error) {
    if (isNotFoundError(error)) {
      await mkdir(destination, { recursive: true });
      return true;
    }

    if (error instanceof CliError) {
      throw error;
    }

    if (isNotDirectoryError(error)) {
      throw new CliError(
        `O destino informado é um arquivo, não um diretório: ${destination}`,
      );
    }

    throw error;
  }
}

/**
 * Desfaz a criação parcial do projeto após uma falha.
 *
 * Se o diretório de destino foi criado por esta execução, ele é removido
 * por completo. Se já existia (e estava vazio), apenas o conteúdo criado é
 * removido, preservando o diretório em si — a solução mais simples que
 * evita remover um diretório que não pertence ao CLI. Falhas durante a
 * limpeza são silenciadas para que o erro original seja o propagado.
 */
async function rollbackDestination(
  destination: string,
  destinationWasCreated: boolean,
): Promise<void> {
  try {
    if (destinationWasCreated) {
      await rm(destination, { recursive: true, force: true });
      return;
    }

    const entries = await readdir(destination);
    await Promise.all(
      entries.map((entry) =>
        rm(resolve(destination, entry), { recursive: true, force: true }),
      ),
    );
  } catch {
    // A falha de limpeza não deve mascarar o erro original.
  }
}

async function readTemplateManifest(
  destination: string,
): Promise<TemplateManifest> {
  const manifestPath = await resolveTemplatePath(destination, 'template.json');

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

function ensureProvidedValuesAreDeclared(
  manifest: TemplateManifest,
  providedValues: Record<string, string>,
): void {
  const declaredNames = new Set(
    manifest.variables.map((variable) => variable.name),
  );

  for (const name of Object.keys(providedValues)) {
    if (!declaredNames.has(name)) {
      throw new CliError(
        'A variável informada não existe no template: ' +
          name +
          '. Use apenas variáveis declaradas pelo template.',
      );
    }
  }
}

async function resolveVariables(
  manifest: TemplateManifest,
  providedValues: Record<string, string>,
  prompt: Prompt,
): Promise<Record<string, string>> {
  const values: Record<string, string> = {};

  for (const variable of manifest.variables) {
    const providedValue = Object.hasOwn(providedValues, variable.name)
      ? providedValues[variable.name]
      : undefined;

    values[variable.name] =
      providedValue === undefined
        ? await resolveVariableFromPrompt(variable, prompt)
        : resolveVariableFromProvidedValue(variable, providedValue);
  }

  return values;
}

/**
 * Valores vindos de `--set` falham imediatamente quando inválidos: o
 * usuário forneceu o valor de forma explícita e não há prompt interativo
 * para corrigi-lo.
 */
function resolveVariableFromProvidedValue(
  variable: TemplateVariable,
  value: string,
): string {
  validateVariable(variable, value);
  return value;
}

const MAX_PROMPT_ATTEMPTS = 3;

/**
 * Valores vindos de prompt interativo são re-perguntados até
 * `MAX_PROMPT_ATTEMPTS` vezes antes de abortar. Isso evita que uma variável
 * obrigatória sem valor padrão (usuário aperta Enter sem digitar nada)
 * derrube o projeto já extraído por um simples deslize. O limite também
 * evita loop infinito quando stdin não é interativo, onde `ask` retorna
 * string vazia repetidamente em EOF. O motivo da recusa é incorporado à
 * pergunta da próxima tentativa.
 */
async function resolveVariableFromPrompt(
  variable: TemplateVariable,
  prompt: Prompt,
): Promise<string> {
  let question = variable.prompt;
  let lastError: CliError | undefined;

  for (let attempt = 0; attempt < MAX_PROMPT_ATTEMPTS; attempt += 1) {
    const value = await prompt.ask(question, variable.default);

    try {
      validateVariable(variable, value);
      return value;
    } catch (error) {
      if (!(error instanceof CliError)) {
        throw error;
      }

      lastError = error;
      question = `${error.message}. ${variable.prompt}`;
    }
  }

  throw lastError ?? new CliError(`A variável ${variable.name} é obrigatória`);
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
    const filePath = await resolveTemplatePath(destination, relativePath);
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

const PLACEHOLDER_PATTERN = /\{\{([^{}]+)\}\}/g;

/**
 * Substitui placeholders `{{nome}}` em uma única passagem sobre o conteúdo.
 *
 * Usar `String.replace` com um regex global garante que cada trecho do
 * conteúdo original seja varrido exatamente uma vez: o valor de substituição
 * retornado pelo callback nunca é reprocessado pelo próprio regex. Isso
 * evita que um valor contendo `{{outraVariavel}}` seja expandido de forma
 * recursiva e torna o resultado independente da ordem das chaves em
 * `values`. Placeholders não declarados em `values` são preservados
 * literalmente.
 */
function renderText(content: string, values: Record<string, string>): string {
  return content.replace(PLACEHOLDER_PATTERN, (match, name: string) => {
    const value = values[name];
    return value === undefined ? match : value;
  });
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
      const path = await resolveTemplatePath(destination, relativePath);
      await rm(path, { force: true });
    }),
  );
}

/**
 * Resolve um caminho declarado pelo manifesto e garante que ele permaneça
 * dentro do diretório de destino.
 *
 * A checagem léxica com `resolve()` é a primeira barreira, mas não resolve
 * links simbólicos em diretórios intermediários. Por isso o caminho real
 * (`realpath`) do destino e do caminho alvo também é comparado — os dois
 * lados precisam passar por `realpath`, pois em alguns sistemas (ex.: `/tmp`
 * no macOS, que é um link para `/private/tmp`) apenas o destino já contém um
 * link simbólico normalizado pelo próprio SO.
 */
async function resolveTemplatePath(
  destination: string,
  relativePath: string,
): Promise<string> {
  const root = resolve(destination);
  const resolvedPath = resolve(root, relativePath);

  if (resolvedPath !== root && !resolvedPath.startsWith(`${root}${sep}`)) {
    throw new CliError(
      'O manifesto tentou acessar um arquivo fora do diretório do projeto',
    );
  }

  await ensureRealPathIsContained(root, resolvedPath);

  return resolvedPath;
}

async function ensureRealPathIsContained(
  root: string,
  targetPath: string,
): Promise<void> {
  const realRoot = await realpath(root);
  const realTarget = await resolveRealPath(targetPath);

  if (realTarget !== realRoot && !realTarget.startsWith(`${realRoot}${sep}`)) {
    throw new CliError(
      'O manifesto tentou acessar um arquivo fora do diretório do projeto',
    );
  }
}

/**
 * Resolve o caminho real de `targetPath`. Quando o arquivo ainda não existe
 * (por exemplo, um caminho que será escrito), resolve o caminho real do
 * diretório pai e compõe com o nome do arquivo.
 */
async function resolveRealPath(targetPath: string): Promise<string> {
  try {
    return await realpath(targetPath);
  } catch (error) {
    if (isNotFoundError(error)) {
      const realParent = await realpath(dirname(targetPath));
      return resolve(realParent, basename(targetPath));
    }

    throw error;
  }
}

async function ensureRegularFile(path: string): Promise<void> {
  const details = await lstat(path);

  if (!details.isFile() || details.isSymbolicLink()) {
    throw new CliError(`O template declarou um arquivo inválido: ${path}`);
  }
}

function isNotFoundError(error: unknown): error is NodeJS.ErrnoException {
  return hasErrorCode(error, 'ENOENT');
}

function isNotDirectoryError(error: unknown): error is NodeJS.ErrnoException {
  return hasErrorCode(error, 'ENOTDIR');
}

function hasErrorCode(error: unknown, code: string): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === code
  );
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : 'erro desconhecido';
}
