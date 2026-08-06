const askPatterns = [
  /\bgit\b[^;&|\n]*\b(?:commit|fetch|pull|push|merge|clone)\b/i,
  /\bgit\b[^;&|\n]*\breset\b[^;&|\n]*--hard\b/i,
  /\bgit\b[^;&|\n]*\bclean\b[^;&|\n]*-[a-z]*f[a-z]*\b/i,
  /\bgit\b[^;&|\n]*\bbranch\b[^;&|\n]*-[dD]\b/i,
  /\bgit\b[^;&|\n]*\btag(?:\s|$)/i,
  /\bgh\b[^;&|\n]*\bpr\b[^;&|\n]*\b(?:create|edit|close|reopen|merge)\b/i,
  /\bgh\b[^;&|\n]*\brelease\b[^;&|\n]*\b(?:create|delete|edit)\b/i,
  /\bgh\b[^;&|\n]*\brepo\b[^;&|\n]*\b(?:archive|delete|rename)\b/i,
  /\bnpm\b[^;&|\n]*\b(?:publish|pub|version)\b/i,
];

const criticalPaths = [
  /^\/+(?:\*)?$/,
  /^~(?:\/\*)?\/?$/,
  /^\.\.?(?:\/\*)?\/?$/,
  /^\$(?:HOME|\{HOME\})(?:\/\*)?\/?$/i,
  /^[a-z]:[\\/](?:\*)?$/i,
];

function tokenize(argumentsText) {
  return (argumentsText.match(/"(?:\\.|[^"])*"|'[^']*'|\S+/g) ?? []).map(
    (token) => token.replace(/^(?:"|')|(?:"|')$/g, ''),
  );
}

function isCriticalPath(token) {
  return criticalPaths.some((pattern) => pattern.test(token));
}

function findRemovalRisk(command) {
  const invocations = [
    ...command.matchAll(
      /(?:^|[^a-z0-9_-])(?:\/(?:usr\/)?bin\/)?rm\s+([^;&|)`\n]*)/gi,
    ),
    ...command.matchAll(/\b(?:remove-item|del)\s+([^;&|\n]*)/gi),
  ];

  for (const invocation of invocations) {
    const tokens = tokenize(invocation[1] ?? '');
    const recursive = tokens.some(
      (token) =>
        token === '--recursive' ||
        (/^-[^-]/.test(token) && /r/i.test(token.slice(1))),
    );
    const force = tokens.some(
      (token) =>
        token === '--force' ||
        (/^-[^-]/.test(token) && /f/i.test(token.slice(1))),
    );
    const targetsCriticalPath = tokens
      .filter((token) => token !== '--' && !token.startsWith('-'))
      .some(isCriticalPath);

    if (recursive && force && targetsCriticalPath) {
      return 'deny';
    }
    if (recursive || force) {
      return 'ask';
    }
  }

  return null;
}

export function evaluateShellCommand(command) {
  if (typeof command !== 'string' || command.trim() === '') {
    return {
      decision: 'deny',
      reason:
        'O hook não recebeu um comando de shell válido e bloqueou a operação por segurança.',
    };
  }

  const removalRisk = findRemovalRisk(command);
  if (removalRisk === 'deny') {
    return {
      decision: 'deny',
      reason:
        'Comando destrutivo contra um caminho crítico bloqueado pelo harness do projeto.',
    };
  }

  if (
    removalRisk === 'ask' ||
    askPatterns.some((pattern) => pattern.test(command))
  ) {
    return {
      decision: 'ask',
      reason:
        'Esta operação pode remover dados ou alterar estado Git, remoto ou de publicação. Confirme explicitamente antes de continuar.',
    };
  }

  return null;
}

async function readInput() {
  let input = '';
  for await (const chunk of process.stdin) {
    input += chunk;
  }
  return input;
}

function denyOnFailure() {
  return {
    decision: 'deny',
    reason:
      'O gate de segurança falhou ao analisar o comando e bloqueou a operação.',
  };
}

async function main() {
  let result;
  try {
    const payload = JSON.parse(await readInput());
    result = evaluateShellCommand(payload?.tool_input?.command);
  } catch {
    result = denyOnFailure();
  }

  if (!result) {
    return;
  }

  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: result.decision,
        permissionDecisionReason: result.reason,
      },
    }),
  );
}

await main();
