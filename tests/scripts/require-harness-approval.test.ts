import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const scriptPath = resolve('scripts/danger/require-harness-approval.mjs');

function runCheck(files: string[], labels: string[]) {
  const directory = mkdtempSync(join(tmpdir(), 'harness-approval-'));
  const filesPath = join(directory, 'files');
  const labelsPath = join(directory, 'labels');
  writeFileSync(filesPath, files.join('\n'));
  writeFileSync(labelsPath, labels.join('\n'));

  try {
    return spawnSync(process.execPath, [scriptPath, filesPath, labelsPath], {
      encoding: 'utf8',
    });
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

describe('require-harness-approval', () => {
  it('não exige label para código da aplicação', () => {
    expect(runCheck(['src/application/run-cli.ts'], []).status).toBe(0);
  });

  it.each([
    'AGENTS.md',
    '.claude/settings.json',
    '.github/workflows/pr-policy.yml',
    '.semgrep/rules/unsafe-child-process.yaml',
    'dangerfile.ts',
    'scripts/agent-hooks/guard-shell-command.mjs',
    'scripts/danger/pr-policies.ts',
  ])('reprova alteração sensível sem confirmação: %s', (file) => {
    const result = runCheck([file], []);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('harness-change-approved');
  });

  it('aceita alteração sensível com a label manual', () => {
    expect(
      runCheck(
        ['.claude/settings.json'],
        ['documentation', 'harness-change-approved'],
      ).status,
    ).toBe(0);
  });
});
