import { spawnSync } from 'node:child_process';
import {
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const hookPath = resolve('scripts/agent-hooks/check-edited-file.mjs');
const projectDir = process.cwd();

function runHook(filePath: string) {
  const result = spawnSync(process.execPath, [hookPath], {
    encoding: 'utf8',
    env: { ...process.env, CLAUDE_PROJECT_DIR: projectDir },
    input: JSON.stringify({
      cwd: projectDir,
      tool_input: { file_path: filePath },
    }),
  });

  return {
    status: result.status,
    output: result.stdout === '' ? null : JSON.parse(result.stdout),
  };
}

describe('check-edited-file', () => {
  it('ignora extensões que o feedback rápido não valida', () => {
    expect(runHook(resolve('README.md'))).toEqual({ status: 0, output: null });
  });

  it('ignora caminhos sensíveis antes de tentar resolvê-los', () => {
    expect(runHook(resolve('.env.json'))).toEqual({ status: 0, output: null });
  });

  it('não retorna feedback quando o arquivo passa no Biome', () => {
    expect(
      runHook(resolve('scripts/agent-hooks/guard-shell-command.mjs')),
    ).toEqual({
      status: 0,
      output: null,
    });
  });

  it('retorna feedback quando o Biome encontra um problema', () => {
    const directory = mkdtempSync(resolve('tests/.agent-hook-invalid-'));
    const filePath = join(directory, 'invalid.ts');
    const originalContent = 'const value={answer:42}\n';
    writeFileSync(filePath, originalContent);

    try {
      const result = runHook(filePath);

      expect(result.output?.hookSpecificOutput).toMatchObject({
        hookEventName: 'PostToolUse',
      });
      expect(result.output?.hookSpecificOutput.additionalContext).toContain(
        'O Biome encontrou problemas',
      );
      expect(readFileSync(filePath, 'utf8')).toBe(originalContent);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it('não valida um arquivo externo ao projeto', () => {
    const externalTemp = mkdtempSync(join(tmpdir(), 'agent-hook-external-'));
    const externalFile = join(externalTemp, 'outside.ts');
    writeFileSync(externalFile, 'const value={answer:42}\n');

    try {
      const result = runHook(externalFile);

      expect(result.output?.hookSpecificOutput.additionalContext).toContain(
        'fora do projeto ou sensível',
      );
    } finally {
      rmSync(externalTemp, { recursive: true, force: true });
    }
  });

  it.skipIf(process.platform === 'win32')(
    'não segue symlink do projeto para um arquivo externo',
    () => {
      const projectTemp = mkdtempSync(resolve('tests/.agent-hook-link-'));
      const externalTemp = mkdtempSync(join(tmpdir(), 'agent-hook-external-'));
      const externalFile = join(externalTemp, 'outside.ts');
      const linkPath = join(projectTemp, 'linked.ts');
      writeFileSync(externalFile, 'const value={answer:42}\n');
      symlinkSync(externalFile, linkPath);

      try {
        const result = runHook(linkPath);

        expect(result.output?.hookSpecificOutput.additionalContext).toContain(
          'fora do projeto ou sensível',
        );
      } finally {
        rmSync(projectTemp, { recursive: true, force: true });
        rmSync(externalTemp, { recursive: true, force: true });
      }
    },
  );
});
