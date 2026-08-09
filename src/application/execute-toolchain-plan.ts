import { evaluateToolRequirements } from './evaluate-tool-requirements.js';
import { planToolchainSteps } from './plan-toolchain-steps.js';
import type {
  NodeToolchain,
  ToolchainExecutionResult,
  ToolchainStep,
  ToolchainStepName,
  ToolchainStepResult,
  ToolInspector,
} from './toolchain.types.js';
import { isSupportedTool } from './toolchain.types.js';

export interface ExecuteToolchainPlanDependencies {
  toolInspector: ToolInspector;
  run(command: 'node' | 'npm', args: string[], cwd: string): Promise<void>;
  shouldRun(
    step: ToolchainStepName,
    definition: ToolchainStep,
  ): Promise<boolean>;
}

export interface ExecuteToolchainPlanOptions {
  cwd: string;
  requestedSteps?: ToolchainStepName[];
}

export async function executeToolchainPlan(
  toolchain: NodeToolchain,
  options: ExecuteToolchainPlanOptions,
  dependencies: ExecuteToolchainPlanDependencies,
): Promise<ToolchainExecutionResult> {
  const plan = planToolchainSteps(toolchain);
  const requirements = await evaluateToolRequirements(
    toolchain.requirements,
    dependencies.toolInspector,
  );
  const unavailableTools = new Set(
    requirements
      .filter((requirement) => requirement.status !== 'satisfied')
      .map((requirement) => requirement.tool),
  );
  const results: ToolchainStepResult[] = [];

  for (const plannedStep of plan) {
    const step = toolchain.steps[plannedStep.name];

    if (!step) {
      throw new Error(`Etapa planejada ausente: ${plannedStep.name}`);
    }

    if (
      plannedStep.dependsOn.some(
        (dependency) => !wasSuccessful(results, dependency),
      )
    ) {
      results.push({ step: plannedStep.name, status: 'skipped-dependency' });
      continue;
    }

    if (!isSupportedTool(step.command) || unavailableTools.has(step.command)) {
      results.push({ step: plannedStep.name, status: 'blocked-requirement' });
      continue;
    }

    if (!(await dependencies.shouldRun(plannedStep.name, step))) {
      results.push({ step: plannedStep.name, status: 'declined' });
      continue;
    }

    try {
      await dependencies.run(step.command, step.args, options.cwd);
      results.push({ step: plannedStep.name, status: 'succeeded' });
    } catch {
      results.push({ step: plannedStep.name, status: 'failed' });
    }
  }

  return {
    steps: results,
    exitCode: hasUnmetExecution(results, options.requestedSteps ?? []) ? 1 : 0,
  };
}

function wasSuccessful(
  results: ToolchainStepResult[],
  step: ToolchainStepName,
): boolean {
  return results.find((result) => result.step === step)?.status === 'succeeded';
}

function hasUnmetExecution(
  results: ToolchainStepResult[],
  requestedSteps: ToolchainStepName[],
): boolean {
  return (
    results.some((result) => result.status === 'failed') ||
    requestedSteps.some(
      (requestedStep) =>
        results.find((result) => result.step === requestedStep)?.status !==
        'succeeded',
    )
  );
}
