import { describe, expect, it, vi } from 'vitest';

import { evaluateToolRequirements } from '../../src/application/evaluate-tool-requirements.js';

import type { ToolInspector } from '../../src/application/toolchain.types.js';

function createToolInspector(
  results: Record<string, { found: boolean; versionOutput?: string }>,
): ToolInspector {
  return {
    inspect: async (tool) => results[tool] ?? { found: false },
  };
}

describe('evaluateToolRequirements', () => {
  it('aceita versões iguais ou maiores, incluindo prefixo v do Node', async () => {
    await expect(
      evaluateToolRequirements(
        [
          { tool: 'node', minimumVersion: '24.0.0' },
          { tool: 'npm', minimumVersion: '10.5' },
        ],
        createToolInspector({
          node: { found: true, versionOutput: 'v24.0.0\n' },
          npm: { found: true, versionOutput: '10.5.1\n' },
        }),
      ),
    ).resolves.toEqual([
      { tool: 'node', minimumVersion: '24.0.0', status: 'satisfied' },
      { tool: 'npm', minimumVersion: '10.5', status: 'satisfied' },
    ]);
  });

  it('distingue ferramenta ausente, saída inválida e versão insuficiente', async () => {
    await expect(
      evaluateToolRequirements(
        [
          { tool: 'node', minimumVersion: '24' },
          { tool: 'npm', minimumVersion: '10' },
          { tool: 'node', minimumVersion: '25' },
        ],
        createToolInspector({
          node: { found: true, versionOutput: 'v24.0.0' },
          npm: { found: true, versionOutput: 'npm versão desconhecida' },
        }),
      ),
    ).resolves.toEqual([
      { tool: 'node', minimumVersion: '24', status: 'satisfied' },
      { tool: 'npm', minimumVersion: '10', status: 'invalid-version' },
      { tool: 'node', minimumVersion: '25', status: 'below-minimum' },
    ]);
  });

  it('não aceita uma pré-release como mínimo estável', async () => {
    await expect(
      evaluateToolRequirements(
        [{ tool: 'node', minimumVersion: '24.0.0' }],
        createToolInspector({
          node: { found: true, versionOutput: 'v24.0.0-rc.1' },
        }),
      ),
    ).resolves.toEqual([
      { tool: 'node', minimumVersion: '24.0.0', status: 'below-minimum' },
    ]);
  });

  it('marca ferramenta ausente sem tentar interpretar uma versão', async () => {
    await expect(
      evaluateToolRequirements(
        [{ tool: 'npm', minimumVersion: '10' }],
        createToolInspector({ npm: { found: false } }),
      ),
    ).resolves.toEqual([
      { tool: 'npm', minimumVersion: '10', status: 'unavailable' },
    ]);
  });

  it('não sonda ferramentas fora da allowlist inicial', async () => {
    const inspect = vi.fn();

    const results = await evaluateToolRequirements(
      [{ tool: 'bun' as 'node', minimumVersion: '1' }],
      { inspect },
    );

    expect(results).toEqual([
      { tool: 'bun', minimumVersion: '1', status: 'unsupported' },
    ]);
    expect(inspect).not.toHaveBeenCalled();
  });
});
