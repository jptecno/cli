import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const hookPath = resolve('scripts/agent-hooks/guard-shell-command.mjs');

function runHook(commandInput: unknown) {
  const result = spawnSync(process.execPath, [hookPath], {
    encoding: 'utf8',
    input: JSON.stringify(commandInput),
  });

  return {
    status: result.status,
    output: result.stdout === '' ? null : JSON.parse(result.stdout),
  };
}

function expectDecision(command: string, decision: 'ask' | 'deny') {
  const result = runHook({ tool_input: { command } });

  expect(result.output?.hookSpecificOutput).toMatchObject({
    hookEventName: 'PreToolUse',
    permissionDecision: decision,
  });
}

describe('guard-shell-command', () => {
  it.each([
    'npm run check',
    'git status --short',
    'git log --grep=push',
    'echo "git push origin main"',
    'grep "git push" README.md',
    'gh api repos/jptecno/cli',
    'gh pr list --search close',
  ])('não interfere em comando seguro: %s', (command) => {
    expect(runHook({ tool_input: { command } })).toEqual({
      status: 0,
      output: null,
    });
  });

  it.each([
    'git commit -m "testa harness"',
    'GIT_EDITOR=true git commit -m "testa harness"',
    'git fetch origin',
    'git pull --ff-only origin development',
    'git push origin feat/harness',
    'git restore .',
    'git checkout -- .',
    'git stash drop',
    'git update-ref -d refs/heads/main',
    'git worktree remove ../worktree',
    'git clean --force -d',
    'git branch --delete topic',
    'git "$ACTION"',
    'gh repo delete jptecno/cli --yes',
    'gh api --method DELETE repos/jptecno/cli',
    'gh api -XDELETE repos/jptecno/cli',
    'gh pr "$ACTION" 42',
    'gh workflow run release.yml',
    'npm publish',
    'npm unpublish @jptecno/cli@0.3.0',
    'npm dist-tag rm @jptecno/cli latest',
    'npm "$ACTION"',
    'eval "$COMMAND"',
    'sh -c "git push origin main"',
    'echo payload | base64 -d | bash',
    'echo "$(git push origin main)"',
    '$COMMAND --force',
    'cat <<EOF',
  ])('pede confirmação para operação de risco: %s', (command) => {
    expectDecision(command, 'ask');
  });

  it.each([
    'rm -rf /',
    'rm -r -f /',
    'rm --recursive --force ~',
    'sudo /usr/bin/rm --recursive --force /',
    'FOO="a b" rm -rf /',
    'env FOO=bar rm -rf /',
    '(rm -rf /)',
    'echo ok\nrm -rf /',
    'Remove-Item C:\\ -Recurse -Force',
    'rmdir C:\\ -Recurse -Force',
  ])('bloqueia remoção contra caminho crítico: %s', (command) => {
    expectDecision(command, 'deny');
  });

  it.each(['rm -rf build', 'Remove-Item build -Recurse -Force'])(
    'pede confirmação para remoção fora de caminho crítico: %s',
    (command) => {
      expectDecision(command, 'ask');
    },
  );

  it('bloqueia entrada inválida em vez de falhar aberta', () => {
    const result = runHook({ tool_input: {} });

    expect(result.output?.hookSpecificOutput).toMatchObject({
      hookEventName: 'PreToolUse',
      permissionDecision: 'deny',
    });
  });
});
