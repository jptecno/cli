import type {
  NodeToolchain,
  ToolchainRequirement,
  ToolchainStep,
  ToolchainStepName,
} from '../contracts/node-toolchain.types.js';
import type {
  TemplateManifest,
  TemplateVariable,
} from '../contracts/template-manifest.types.js';
import { CliError } from './cli-error.js';
import { assertTemplateManifestV1Schema } from './validate-external-document.js';

const allowedSteps: Record<ToolchainStepName, readonly string[]> = {
  install: ['install'],
  formatCheck: ['run', 'format:check'],
  lint: ['run', 'lint'],
  typecheck: ['run', 'typecheck'],
  test: ['test'],
  build: ['run', 'build'],
};

export function parseTemplateManifest(value: unknown): TemplateManifest {
  assertTemplateManifestV1Schema(value);

  if (
    !isRecord(value) ||
    !isRecord(value.render) ||
    !isRecord(value.toolchain)
  ) {
    throw new CliError('O manifesto do template possui formato inválido');
  }

  if (
    !isNonEmptyString(value.id) ||
    !isNonEmptyString(value.name) ||
    !isNonEmptyString(value.description) ||
    !isNonEmptyString(value.repository) ||
    !Array.isArray(value.variables) ||
    !Array.isArray(value.render.include)
  ) {
    throw new CliError('O manifesto do template possui metadados inválidos');
  }

  const variables = value.variables.map(parseTemplateVariable);
  ensureVariableNamesAreUnique(variables);

  return {
    schemaVersion: 1,
    id: value.id,
    name: value.name,
    description: value.description,
    repository: value.repository,
    variables,
    render: { include: value.render.include.map(parseRelativePath) },
    toolchain: parseNodeToolchain(value.toolchain),
  };
}

function parseNodeToolchain(value: Record<string, unknown>): NodeToolchain {
  if (value.ecosystem !== 'node') {
    throw new CliError('O manifesto deve declarar uma toolchain Node.js');
  }

  if (!Array.isArray(value.requirements) || !isRecord(value.steps)) {
    throw new CliError('A toolchain do manifesto possui formato inválido');
  }

  const requirements = value.requirements.map(parseRequirement);
  ensureRequiredTools(requirements);

  const steps = {} as Partial<Record<ToolchainStepName, ToolchainStep>>;
  const stepEntries = Object.entries(value.steps);

  if (stepEntries.length === 0) {
    throw new CliError(
      'A toolchain do manifesto deve declarar ao menos uma etapa',
    );
  }

  for (const [name, step] of stepEntries) {
    if (!isToolchainStepName(name) || !isRecord(step)) {
      throw new CliError('A toolchain do manifesto possui uma etapa inválida');
    }

    steps[name] = parseToolchainStep(name, step);
  }

  ensureStepDependencies(steps);
  return { ecosystem: 'node', requirements, steps };
}

function parseRequirement(value: unknown): ToolchainRequirement {
  if (
    !isRecord(value) ||
    (value.tool !== 'node' && value.tool !== 'npm') ||
    !isStableVersion(value.minimumVersion)
  ) {
    throw new CliError('A toolchain do manifesto possui requisito inválido');
  }

  return { tool: value.tool, minimumVersion: value.minimumVersion };
}

function ensureRequiredTools(requirements: ToolchainRequirement[]): void {
  const tools = new Set<string>();

  for (const requirement of requirements) {
    if (tools.has(requirement.tool)) {
      throw new CliError(
        'A toolchain do manifesto possui requisitos duplicados',
      );
    }

    tools.add(requirement.tool);
  }

  if (!tools.has('node') || !tools.has('npm') || tools.size !== 2) {
    throw new CliError('A toolchain do manifesto deve exigir node e npm');
  }
}

function parseToolchainStep(
  name: ToolchainStepName,
  value: Record<string, unknown>,
): ToolchainStep {
  if (
    value.command !== 'npm' ||
    !Array.isArray(value.args) ||
    !value.args.every((argument) => typeof argument === 'string') ||
    !Array.isArray(value.dependsOn) ||
    !value.dependsOn.every(isToolchainStepName) ||
    typeof value.recommended !== 'boolean' ||
    !hasExactArguments(value.args, allowedSteps[name])
  ) {
    throw new CliError('A toolchain do manifesto possui comando não permitido');
  }

  return {
    command: 'npm',
    args: [...value.args],
    dependsOn: [...value.dependsOn],
    recommended: value.recommended,
  };
}

function ensureStepDependencies(
  steps: Partial<Record<ToolchainStepName, ToolchainStep>>,
): void {
  for (const [name, step] of Object.entries(steps) as Array<
    [ToolchainStepName, ToolchainStep]
  >) {
    if (step.dependsOn.includes(name)) {
      throw new CliError(
        'A toolchain do manifesto possui uma dependência própria',
      );
    }

    for (const dependency of step.dependsOn) {
      if (!steps[dependency]) {
        throw new CliError(
          'A toolchain do manifesto depende de uma etapa ausente',
        );
      }
    }
  }

  const visiting = new Set<ToolchainStepName>();
  const visited = new Set<ToolchainStepName>();

  function visit(name: ToolchainStepName): void {
    if (visiting.has(name)) {
      throw new CliError('As dependências da toolchain contêm um ciclo');
    }

    if (visited.has(name)) {
      return;
    }

    visiting.add(name);
    for (const dependency of steps[name]?.dependsOn ?? []) {
      visit(dependency);
    }
    visiting.delete(name);
    visited.add(name);
  }

  for (const name of Object.keys(steps) as ToolchainStepName[]) {
    visit(name);
  }
}

function parseTemplateVariable(value: unknown): TemplateVariable {
  if (
    !isRecord(value) ||
    !isNonEmptyString(value.name) ||
    !isVariableName(value.name) ||
    !isNonEmptyString(value.prompt) ||
    typeof value.required !== 'boolean'
  ) {
    throw new CliError('O manifesto do template possui uma variável inválida');
  }

  if (value.pattern !== undefined && !isNonEmptyString(value.pattern)) {
    throw new CliError(`O padrão da variável ${value.name} é inválido`);
  }

  if (value.pattern !== undefined) {
    try {
      new RegExp(value.pattern);
    } catch {
      throw new CliError(`O padrão da variável ${value.name} é inválido`);
    }
  }

  if (value.default !== undefined && typeof value.default !== 'string') {
    throw new CliError(`O valor padrão da variável ${value.name} é inválido`);
  }

  return {
    name: value.name,
    prompt: value.prompt,
    required: value.required,
    pattern: value.pattern,
    default: value.default,
  };
}

function ensureVariableNamesAreUnique(variables: TemplateVariable[]): void {
  const names = new Set<string>();

  for (const variable of variables) {
    if (names.has(variable.name)) {
      throw new CliError(
        `O manifesto possui variáveis duplicadas: ${variable.name}`,
      );
    }

    names.add(variable.name);
  }
}

function isStableVersion(value: unknown): value is string {
  return typeof value === 'string' && /^\d+\.\d+\.\d+$/.test(value);
}

function isToolchainStepName(value: unknown): value is ToolchainStepName {
  return typeof value === 'string' && Object.hasOwn(allowedSteps, value);
}

function hasExactArguments(
  actual: string[],
  expected: readonly string[],
): boolean {
  return (
    actual.length === expected.length &&
    actual.every((arg, index) => arg === expected[index])
  );
}

function isVariableName(value: string): boolean {
  return /^[A-Za-z][A-Za-z0-9_]*$/.test(value);
}

function parseRelativePath(value: unknown): string {
  if (
    !isNonEmptyString(value) ||
    value.includes('..') ||
    value.startsWith('/') ||
    value.startsWith('\\')
  ) {
    throw new CliError(
      'O manifesto do template possui um caminho de renderização inválido',
    );
  }

  return value;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim() !== '';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
