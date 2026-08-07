import { readFileSync } from 'node:fs';

export const HARNESS_APPROVAL_LABEL = 'harness-change-approved';

const harnessPaths = [
  /^AGENTS\.md$/,
  /^\.agents\//,
  /^\.claude\//,
  /^\.github\/CODEOWNERS$/,
  /^\.github\/agents\//,
  /^\.github\/copilot-instructions\.md$/,
  /^\.github\/instructions\//,
  /^\.github\/prompts\//,
  /^\.github\/workflows\//,
  /^\.semgrep\/rules\//,
  /^dangerfile\.ts$/,
  /^lefthook\.yml$/,
  /^scripts\/agent-hooks\//,
  /^scripts\/danger\//,
  /^tests\/scripts\/agent-hooks\//,
];

export function requiresHarnessApproval(files) {
  return files.some((file) =>
    harnessPaths.some((pattern) => pattern.test(file)),
  );
}

export function hasHarnessApproval(labels) {
  return labels.includes(HARNESS_APPROVAL_LABEL);
}

function readLines(path) {
  return readFileSync(path, 'utf8')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function main() {
  const [filesPath, labelsPath] = process.argv.slice(2);
  if (!filesPath || !labelsPath) {
    console.error('Informe os arquivos alterados e as labels do pull request.');
    process.exitCode = 1;
    return;
  }

  const files = readLines(filesPath);
  if (!requiresHarnessApproval(files)) {
    return;
  }

  const labels = readLines(labelsPath);
  if (!hasHarnessApproval(labels)) {
    console.error(
      `Alterações no harness exigem confirmação manual pela label ${HARNESS_APPROVAL_LABEL}.`,
    );
    process.exitCode = 1;
  }
}

if (process.argv[1]?.endsWith('require-harness-approval.mjs')) {
  main();
}
