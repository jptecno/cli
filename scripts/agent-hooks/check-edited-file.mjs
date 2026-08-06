import { spawnSync } from 'node:child_process';
import { realpathSync } from 'node:fs';
import { createRequire } from 'node:module';
import { isAbsolute, relative, resolve } from 'node:path';

const supportedExtensions = /\.(?:c?js|mjs|ts|jsonc?)$/i;
const sensitivePaths =
  /(?:^|[/\\])(?:\.env(?:\..*)?|\.git|node_modules|dist|coverage)(?:[/\\]|$)/i;

async function readInput() {
  let input = '';
  for await (const chunk of process.stdin) {
    input += chunk;
  }
  return input;
}

function emitFeedback(message) {
  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'PostToolUse',
        additionalContext: message.slice(0, 10_000),
      },
    }),
  );
}

async function main() {
  let payload;
  try {
    payload = JSON.parse(await readInput());
  } catch {
    return;
  }

  const filePath = payload?.tool_input?.file_path;
  if (
    typeof filePath !== 'string' ||
    !supportedExtensions.test(filePath) ||
    sensitivePaths.test(filePath)
  ) {
    return;
  }

  let projectDir;
  let canonicalFilePath;
  try {
    projectDir = realpathSync(
      resolve(process.env.CLAUDE_PROJECT_DIR ?? payload.cwd ?? process.cwd()),
    );
    canonicalFilePath = realpathSync(resolve(filePath));
  } catch {
    emitFeedback(
      'O arquivo editado não pôde ser resolvido com segurança para validação pelo Biome.',
    );
    return;
  }

  const relativePath = relative(projectDir, canonicalFilePath);
  if (
    relativePath === '' ||
    relativePath === '..' ||
    relativePath.startsWith(`..${process.platform === 'win32' ? '\\' : '/'}`) ||
    isAbsolute(relativePath) ||
    sensitivePaths.test(canonicalFilePath)
  ) {
    emitFeedback(
      'A validação automática ignorou um caminho fora do projeto ou sensível.',
    );
    return;
  }

  let biomeCli;
  try {
    biomeCli = createRequire(import.meta.url).resolve(
      '@biomejs/biome/bin/biome',
    );
  } catch {
    emitFeedback(
      'O Biome local não está instalado. Execute `npm ci` antes de validar arquivos editados.',
    );
    return;
  }

  const result = spawnSync(
    process.execPath,
    [biomeCli, 'check', '--no-errors-on-unmatched', canonicalFilePath],
    {
      cwd: projectDir,
      encoding: 'utf8',
      timeout: 30_000,
    },
  );

  if (result.status === 0) {
    return;
  }

  const details = [result.stdout, result.stderr]
    .filter(Boolean)
    .join('\n')
    .trim();
  emitFeedback(
    `O Biome encontrou problemas após a edição de ${relativePath}. Corrija-os antes de concluir a tarefa.\n${details}`,
  );
}

await main();
