import { describe, expect, it, vi } from 'vitest';

import { executeToolchainPlan } from '../../src/application/execute-toolchain-plan.js';

import type {
  NodeToolchain,
  ToolInspector,
} from '../../src/application/toolchain.types.js';

function buildToolchain(steps: NodeToolchain['steps']): NodeToolchain {
  return {
    ecosystem: 'node',
    requirements: [{ tool: 'npm', minimumVersion: '10' }],
    steps,
  };
}

const installedNpm: ToolInspector = {
  inspect: async () => ({ found: true, versionOutput: '10.0.0' }),
};

describe('executeToolchainPlan', () => {
  it('executa uma vez por vez na ordem topológica canônica', async () => {
    const executionOrder: string[] = [];

    const result = await executeToolchainPlan(
      buildToolchain({
        test: {
          command: 'npm',
          args: ['test'],
          dependsOn: ['install'],
          recommended: true,
        },
        lint: {
          command: 'npm',
          args: ['run', 'lint'],
          dependsOn: ['install'],
          recommended: true,
        },
        install: {
          command: 'npm',
          args: ['install'],
          dependsOn: [],
          recommended: true,
        },
      }),
      { cwd: '/project' },
      {
        toolInspector: installedNpm,
        shouldRun: async () => true,
        run: async (_command, args, cwd) => {
          expect(cwd).toBe('/project');
          executionOrder.push(args.join(' '));
        },
      },
    );

    expect(executionOrder).toEqual(['install', 'run lint', 'test']);
    expect(result).toEqual({
      steps: [
        { step: 'install', status: 'succeeded' },
        { step: 'lint', status: 'succeeded' },
        { step: 'test', status: 'succeeded' },
      ],
      exitCode: 0,
    });
  });

  it('marca descendentes como skipped após falha e continua branches independentes', async () => {
    const run = vi.fn(async (_command: string, args: string[]) => {
      if (args[1] === 'lint') {
        throw new Error('lint falhou');
      }
    });

    const result = await executeToolchainPlan(
      buildToolchain({
        lint: {
          command: 'npm',
          args: ['run', 'lint'],
          dependsOn: [],
          recommended: true,
        },
        test: {
          command: 'npm',
          args: ['test'],
          dependsOn: ['lint'],
          recommended: true,
        },
        build: {
          command: 'npm',
          args: ['run', 'build'],
          dependsOn: [],
          recommended: true,
        },
      }),
      { cwd: '/project' },
      { toolInspector: installedNpm, shouldRun: async () => true, run },
    );

    expect(run.mock.calls.map(([, args]) => args)).toEqual([
      ['run', 'lint'],
      ['run', 'build'],
    ]);
    expect(result).toEqual({
      steps: [
        { step: 'lint', status: 'failed' },
        { step: 'test', status: 'skipped-dependency' },
        { step: 'build', status: 'succeeded' },
      ],
      exitCode: 1,
    });
  });

  it('distingue recusa, requisito bloqueado e dependência ignorada sem executar comandos', async () => {
    const run = vi.fn();

    const result = await executeToolchainPlan(
      buildToolchain({
        install: {
          command: 'npm',
          args: ['install'],
          dependsOn: [],
          recommended: true,
        },
        lint: {
          command: 'npm',
          args: ['run', 'lint'],
          dependsOn: ['install'],
          recommended: true,
        },
      }),
      { cwd: '/project', requestedSteps: ['lint'] },
      {
        toolInspector: { inspect: async () => ({ found: false }) },
        shouldRun: async () => false,
        run,
      },
    );

    expect(run).not.toHaveBeenCalled();
    expect(result).toEqual({
      steps: [
        { step: 'install', status: 'blocked-requirement' },
        { step: 'lint', status: 'skipped-dependency' },
      ],
      exitCode: 1,
    });
  });

  it('propaga uma recusa aos dependentes e mantém exit code zero sem solicitação explícita', async () => {
    const result = await executeToolchainPlan(
      buildToolchain({
        test: {
          command: 'npm',
          args: ['test'],
          dependsOn: [],
          recommended: false,
        },
        build: {
          command: 'npm',
          args: ['run', 'build'],
          dependsOn: ['test'],
          recommended: false,
        },
      }),
      { cwd: '/project' },
      {
        toolInspector: installedNpm,
        shouldRun: async () => false,
        run: async () => undefined,
      },
    );

    expect(result).toEqual({
      steps: [
        { step: 'test', status: 'declined' },
        { step: 'build', status: 'skipped-dependency' },
      ],
      exitCode: 0,
    });
  });
});
