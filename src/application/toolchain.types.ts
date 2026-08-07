export const toolchainStepNames = [
  'install',
  'formatCheck',
  'lint',
  'typecheck',
  'test',
  'build',
] as const;

export type ToolchainStepName = (typeof toolchainStepNames)[number];
export type SupportedTool = 'node' | 'npm';

export function isSupportedTool(value: string): value is SupportedTool {
  return value === 'node' || value === 'npm';
}

export interface ToolchainRequirement {
  tool: SupportedTool;
  minimumVersion: string;
}

export interface ToolchainStep {
  command: SupportedTool;
  args: string[];
  dependsOn: ToolchainStepName[];
  recommended: boolean;
}

export interface NodeToolchain {
  ecosystem: 'node';
  requirements: ToolchainRequirement[];
  steps: Partial<Record<ToolchainStepName, ToolchainStep>>;
}

export interface ToolInspection {
  found: boolean;
  versionOutput?: string;
}

export interface ToolInspector {
  inspect(tool: SupportedTool): Promise<ToolInspection>;
}

export type ToolRequirementStatus =
  | 'satisfied'
  | 'unsupported'
  | 'unavailable'
  | 'invalid-version'
  | 'below-minimum';

export interface ToolRequirementResult {
  tool: SupportedTool;
  minimumVersion: string;
  status: ToolRequirementStatus;
}

export type ToolchainStepStatus =
  | 'succeeded'
  | 'failed'
  | 'declined'
  | 'blocked-requirement'
  | 'skipped-dependency';

export interface ToolchainStepResult {
  step: ToolchainStepName;
  status: ToolchainStepStatus;
}

export interface ToolchainExecutionResult {
  steps: ToolchainStepResult[];
  exitCode: 0 | 1;
}
