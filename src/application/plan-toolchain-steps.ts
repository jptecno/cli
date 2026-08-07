import { CliError } from './cli-error.js';
import {
  type NodeToolchain,
  type ToolchainStepName,
  toolchainStepNames,
} from './toolchain.types.js';

export interface PlannedToolchainStep {
  name: ToolchainStepName;
  dependsOn: ToolchainStepName[];
}

export function planToolchainSteps(
  toolchain: NodeToolchain,
): PlannedToolchainStep[] {
  const declaredSteps = toolchainStepNames.filter(
    (name) => toolchain.steps[name] !== undefined,
  );
  const pendingDependencies = new Map<
    ToolchainStepName,
    Set<ToolchainStepName>
  >();

  for (const name of declaredSteps) {
    const step = toolchain.steps[name];

    if (!step) {
      continue;
    }

    const dependencies = new Set(step.dependsOn);

    for (const dependency of dependencies) {
      if (!toolchain.steps[dependency]) {
        throw new CliError(
          `A etapa ${name} depende de uma etapa não declarada: ${dependency}`,
        );
      }
    }

    pendingDependencies.set(name, dependencies);
  }

  const plan: PlannedToolchainStep[] = [];

  while (pendingDependencies.size > 0) {
    const next = declaredSteps.find(
      (name) => pendingDependencies.get(name)?.size === 0,
    );

    if (!next) {
      throw new CliError('As dependências da toolchain contêm um ciclo');
    }

    const step = toolchain.steps[next];

    if (!step) {
      throw new Error(`Etapa planejada ausente: ${next}`);
    }

    plan.push({ name: next, dependsOn: step.dependsOn });
    pendingDependencies.delete(next);

    for (const dependencies of pendingDependencies.values()) {
      dependencies.delete(next);
    }
  }

  return plan;
}
