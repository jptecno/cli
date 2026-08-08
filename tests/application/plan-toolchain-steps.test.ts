import { describe, expect, it } from 'vitest';

import { CliError } from '../../src/application/cli-error.js';
import { planToolchainSteps } from '../../src/application/plan-toolchain-steps.js';

import type { NodeToolchain } from '../../src/application/toolchain.types.js';

function buildToolchain(steps: NodeToolchain['steps']): NodeToolchain {
  return {
    ecosystem: 'node',
    requirements: [{ tool: 'npm', minimumVersion: '10' }],
    steps,
  };
}

describe('planToolchainSteps', () => {
  it('ordena um DAG de forma topológica e usa a ordem canônica como desempate', () => {
    const plan = planToolchainSteps(
      buildToolchain({
        build: {
          command: 'npm',
          args: ['run', 'build'],
          dependsOn: ['test'],
          recommended: false,
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
        test: {
          command: 'npm',
          args: ['test'],
          dependsOn: ['install'],
          recommended: true,
        },
      }),
    );

    expect(plan.map((step) => step.name)).toEqual([
      'install',
      'lint',
      'test',
      'build',
    ]);
  });

  it('rejeita dependência para etapa não declarada', () => {
    expect(() =>
      planToolchainSteps(
        buildToolchain({
          test: {
            command: 'npm',
            args: ['test'],
            dependsOn: ['install'],
            recommended: true,
          },
        }),
      ),
    ).toThrow('A etapa test depende de uma etapa não declarada: install');
  });

  it('rejeita ciclos sem produzir um plano parcial', () => {
    expect(() =>
      planToolchainSteps(
        buildToolchain({
          lint: {
            command: 'npm',
            args: ['run', 'lint'],
            dependsOn: ['test'],
            recommended: true,
          },
          test: {
            command: 'npm',
            args: ['test'],
            dependsOn: ['lint'],
            recommended: true,
          },
        }),
      ),
    ).toThrow(CliError);
  });
});
