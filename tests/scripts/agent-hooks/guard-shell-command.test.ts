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
  it('não interfere em comandos de validação seguros', () => {
    const result = runHook({ tool_input: { command: 'npm run check' } });

    expect(result).toEqual({ status: 0, output: null });
  });

  it.each([
    'git commit -m "testa harness"',
    'GIT_EDITOR=true git commit -m "testa harness"',
    'env GIT_EDITOR=true git commit -m "testa harness"',
    'sudo -u root git push origin feat/harness',
    'git -C /tmp/repo push origin feat/harness',
    '(git push origin feat/harness)',
    'git fetch origin',
    'git pull --ff-only origin development',
    'git push origin feat/harness',
    'gh repo delete jptecno/cli --yes',
    'gh --repo jptecno/cli pr merge 42',
    'gh pr --repo jptecno/cli merge 42',
    'npm --registry https://registry.npmjs.org publish',
    'npm --registry https://registry.npmjs.org pub',
  ])(
    'pede confirmação para operação com estado local ou remoto: %s',
    (command) => {
      expectDecision(command, 'ask');
    },
  );

  it.each([
    'rm -rf /',
    'rm -r -f /',
    'rm -rf -- /',
    'rm --recursive --force /',
    'echo ok && rm -fr ~',
    'echo $(rm -rf ..)',
    'sudo /usr/bin/rm --recursive --force /',
    'FOO="a b" rm -rf /',
    'env FOO=bar rm -rf /',
    'sudo -u root rm -rf /',
    'command rm -rf /',
    '(rm -rf /)',
    'sh -c "rm -rf /"',
    'echo ok\nrm -rf /',
    'rm -rf //',
    'Remove-Item C:\\ -Recurse -Force',
  ])('bloqueia variante de remoção contra caminho crítico: %s', (command) => {
    expectDecision(command, 'deny');
  });

  it.each(['rm -rf build', 'Remove-Item build -Recurse -Force'])(
    'pede confirmação para remoção recursiva fora de caminho crítico: %s',
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
