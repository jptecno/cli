const criticalPaths = [
  /^\/+\*?$/,
  /^~(?:\/\*)?\/?$/,
  /^\.\.?(?:\/\*)?\/?$/,
  /^\$(?:HOME|\{HOME\})(?:\/\*)?\/?$/i,
  /^[a-z]:[\\/]\*?$/i,
];

const shellExecutables = new Set([
  'bash',
  'cmd',
  'powershell',
  'pwsh',
  'sh',
  'zsh',
]);

function tokenize(value) {
  const tokens = [];
  let token = '';
  let quote = null;
  let escaped = false;

  for (const character of value) {
    if (escaped) {
      token += character;
      escaped = false;
      continue;
    }
    if (character === '\\' && quote === '"') {
      escaped = true;
      continue;
    }
    if (character === '\\' && !quote) {
      token += character;
      continue;
    }
    if (quote) {
      if (character === quote) {
        quote = null;
      } else {
        token += character;
      }
      continue;
    }
    if (character === '"' || character === "'") {
      quote = character;
      continue;
    }
    if (/\s/.test(character)) {
      if (token) {
        tokens.push(token);
        token = '';
      }
      continue;
    }
    token += character;
  }

  if (token) {
    tokens.push(token);
  }
  return tokens;
}

function splitShellSegments(command) {
  const segments = [];
  let segment = '';
  let quote = null;
  let escaped = false;

  for (const character of command) {
    if (escaped) {
      segment += character;
      escaped = false;
      continue;
    }
    if (character === '\\' && quote === '"') {
      segment += character;
      escaped = true;
      continue;
    }
    if (character === '\\' && !quote) {
      segment += character;
      continue;
    }
    if (quote) {
      segment += character;
      if (character === quote) {
        quote = null;
      }
      continue;
    }
    if (character === '"' || character === "'") {
      quote = character;
      segment += character;
      continue;
    }
    if (/[;&|()\n]/.test(character)) {
      if (segment.trim()) {
        segments.push(segment.trim());
      }
      segment = '';
      continue;
    }
    segment += character;
  }

  if (segment.trim()) {
    segments.push(segment.trim());
  }
  return segments;
}

function basename(command) {
  return command.replaceAll('\\', '/').split('/').at(-1)?.toLowerCase() ?? '';
}

function unwrapCommand(tokens) {
  let index = 0;

  while (index < tokens.length) {
    while (/^[a-z_][a-z0-9_]*=/i.test(tokens[index] ?? '')) {
      index += 1;
    }

    const wrapper = basename(tokens[index] ?? '');
    if (wrapper === 'env' || wrapper === 'command') {
      index += 1;
      while ((tokens[index] ?? '').startsWith('-')) {
        index += 1;
      }
      continue;
    }

    if (wrapper === 'sudo') {
      index += 1;
      while ((tokens[index] ?? '').startsWith('-')) {
        const option = tokens[index];
        index += 1;
        if (['-C', '-g', '-h', '-p', '-R', '-T', '-u'].includes(option ?? '')) {
          index += 1;
        }
      }
      continue;
    }

    break;
  }

  return tokens.slice(index);
}

function isCriticalPath(token) {
  return criticalPaths.some((pattern) => pattern.test(token));
}

function classifyRemoval(tokens) {
  const recursive = tokens.some(
    (token) =>
      token.toLowerCase() === '--recursive' ||
      (/^-[^-]/.test(token) && /r/i.test(token.slice(1))),
  );
  const force = tokens.some(
    (token) =>
      token.toLowerCase() === '--force' ||
      (/^-[^-]/.test(token) && /f/i.test(token.slice(1))),
  );
  const targetsCriticalPath = tokens
    .filter((token) => token !== '--' && !token.startsWith('-'))
    .some(isCriticalPath);

  return recursive && force && targetsCriticalPath ? 'deny' : 'ask';
}

function findSubcommand(tokens, optionsWithValues) {
  let index = 1;
  while (index < tokens.length) {
    const token = tokens[index] ?? '';
    if (token === '--') {
      return {
        command: tokens[index + 1]?.toLowerCase() ?? '',
        index: index + 1,
      };
    }
    if (token.startsWith('-')) {
      const option = token.split('=')[0] ?? token;
      index += token.includes('=') || !optionsWithValues.has(option) ? 1 : 2;
      continue;
    }
    return { command: token.toLowerCase(), index };
  }
  return { command: '', index };
}

function classifyGit(tokens) {
  const { command, index } = findSubcommand(
    tokens,
    new Set(['-C', '-c', '--git-dir', '--namespace', '--work-tree']),
  );
  const args = tokens.slice(index + 1);

  if (command.includes('$')) {
    return 'ask';
  }
  if (
    [
      'clone',
      'commit',
      'fetch',
      'merge',
      'pull',
      'push',
      'restore',
      'rm',
    ].includes(command)
  ) {
    return 'ask';
  }
  if (command === 'reset' && args.includes('--hard')) {
    return 'ask';
  }
  if (
    command === 'clean' &&
    args.some((arg) => arg === '--force' || /^-[a-z]*f/i.test(arg))
  ) {
    return 'ask';
  }
  if (
    command === 'branch' &&
    args.some((arg) => arg === '--delete' || /^-[dD]$/.test(arg))
  ) {
    return 'ask';
  }
  if (
    command === 'tag' &&
    args.length > 0 &&
    !args.some((arg) => ['-l', '--list'].includes(arg))
  ) {
    return 'ask';
  }
  if (command === 'checkout' && args.includes('--')) {
    return 'ask';
  }
  if (
    command === 'stash' &&
    args.some((arg) => ['apply', 'clear', 'drop', 'pop'].includes(arg))
  ) {
    return 'ask';
  }
  if (command === 'update-ref' || command === 'reflog') {
    return 'ask';
  }
  if (
    command === 'worktree' &&
    args.some((arg) => ['prune', 'remove'].includes(arg))
  ) {
    return 'ask';
  }
  if (command === 'gc' && args.some((arg) => arg.startsWith('--prune'))) {
    return 'ask';
  }
  return null;
}

function classifyGitHub(tokens) {
  const { command: group, index } = findSubcommand(
    tokens,
    new Set(['-R', '--hostname', '--repo']),
  );
  const args = tokens.slice(index + 1).map((arg) => arg.toLowerCase());

  if (group.includes('$')) {
    return 'ask';
  }
  if (group === 'api') {
    const methodArgument = args.find((arg) =>
      /^(?:-x.+|-x$|--method(?:=|$))/.test(arg),
    );
    const methodIndex = methodArgument ? args.indexOf(methodArgument) : -1;
    const method = !methodArgument
      ? undefined
      : methodArgument.startsWith('-x') && methodArgument.length > 2
        ? methodArgument.slice(2)
        : methodArgument.includes('=')
          ? methodArgument.split('=')[1]
          : args[methodIndex + 1];
    const sendsFields = args.some((arg) =>
      /^-(?:f|F)$|^--(?:field|raw-field)(?:=|$)/.test(arg),
    );
    if (sendsFields || (method && method.toUpperCase() !== 'GET')) {
      return 'ask';
    }
  }

  const riskyActions = {
    pr: ['close', 'create', 'edit', 'merge', 'reopen'],
    release: ['create', 'delete', 'edit'],
    repo: ['archive', 'delete', 'rename'],
    run: ['cancel', 'delete', 'rerun'],
    secret: ['delete', 'set'],
    variable: ['delete', 'set'],
    workflow: ['run'],
  };
  const { command: action } = findSubcommand(
    [group, ...args],
    new Set([
      '-R',
      '--hostname',
      '--json',
      '--limit',
      '--repo',
      '--search',
      '--state',
    ]),
  );
  if (action.includes('$') || riskyActions[group]?.includes(action)) {
    return 'ask';
  }
  return null;
}

function classifyNpm(tokens) {
  const { command, index } = findSubcommand(
    tokens,
    new Set(['-C', '--prefix', '--registry', '--workspace']),
  );
  const args = tokens.slice(index + 1).map((arg) => arg.toLowerCase());

  if (command.includes('$')) {
    return 'ask';
  }
  if (
    [
      'access',
      'deprecate',
      'owner',
      'pub',
      'publish',
      'token',
      'unpublish',
      'version',
    ].includes(command)
  ) {
    return 'ask';
  }
  if (
    command === 'dist-tag' &&
    args.some((arg) => ['add', 'rm'].includes(arg))
  ) {
    return 'ask';
  }
  return null;
}

function classifySegment(segment) {
  const tokens = unwrapCommand(tokenize(segment));
  const executable = basename(tokens[0] ?? '');
  const args = tokens.slice(1);

  if (!executable) {
    return null;
  }
  if (
    executable.startsWith('$') ||
    executable === 'eval' ||
    shellExecutables.has(executable)
  ) {
    return 'ask';
  }
  if (['del', 'remove-item', 'rm', 'rmdir'].includes(executable)) {
    return classifyRemoval(args);
  }
  if (executable === 'git') {
    return classifyGit(tokens);
  }
  if (executable === 'gh') {
    return classifyGitHub(tokens);
  }
  if (executable === 'npm') {
    return classifyNpm(tokens);
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

  let decision =
    command.includes('<<') || command.includes('`') || command.includes('$(')
      ? 'ask'
      : null;
  for (const segment of splitShellSegments(command)) {
    const segmentDecision = classifySegment(segment);
    if (segmentDecision === 'deny') {
      decision = 'deny';
      break;
    }
    if (segmentDecision === 'ask') {
      decision = 'ask';
    }
  }

  if (!decision) {
    return null;
  }
  return {
    decision,
    reason:
      decision === 'deny'
        ? 'Comando destrutivo contra um caminho crítico bloqueado pelo harness do projeto.'
        : 'Esta operação pode remover dados, executar shell dinâmico ou alterar estado Git, remoto ou de publicação. Confirme explicitamente antes de continuar.',
  };
}

async function readInput() {
  let input = '';
  for await (const chunk of process.stdin) {
    input += chunk;
  }
  return input;
}

async function main() {
  let result;
  try {
    const payload = JSON.parse(await readInput());
    result = evaluateShellCommand(payload?.tool_input?.command);
  } catch {
    result = {
      decision: 'deny',
      reason:
        'O gate de segurança falhou ao analisar o comando e bloqueou a operação.',
    };
  }

  if (result) {
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
}

await main();
