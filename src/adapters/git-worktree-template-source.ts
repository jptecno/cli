import { spawn } from 'node:child_process';
import { createWriteStream } from 'node:fs';
import { copyFile, lstat, mkdir, mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pipeline } from 'node:stream/promises';
import * as tar from 'tar';

import { CliError } from '../application/cli-error.js';
import type { TemplateSource } from '../contracts/cli-ports.js';
import type { TemplateDefinition } from '../contracts/template-registry.types.js';

export interface GitWorktreeTemplateSourceOptions {
  sourceDirectory: string;
  expectedRepository: string;
  expectedCommit: string;
}

/**
 * Fonte de templates para testes de integração locais.
 *
 * A cópia é produzida exclusivamente por `git archive` do commit validado.
 * Portanto, arquivos não rastreados e mudanças locais do worktree nunca são
 * materializados no destino.
 */
export class GitWorktreeTemplateSource implements TemplateSource {
  private readonly expectedCommit: string;

  constructor(private readonly options: GitWorktreeTemplateSourceOptions) {
    if (!/^[0-9a-f]{40}$/i.test(options.expectedCommit)) {
      throw new CliError(
        'O commit esperado do worktree deve ter 40 caracteres hexadecimais',
      );
    }

    if (!isRepositoryName(options.expectedRepository)) {
      throw new CliError('O repositório esperado do worktree é inválido');
    }

    this.expectedCommit = options.expectedCommit.toLowerCase();
  }

  async materialize(
    _template: TemplateDefinition,
    destination: string,
  ): Promise<void> {
    await this.assertExpectedRepositoryAndCommit();

    const temporaryDirectory = await mkdtemp(join(tmpdir(), 'jp-git-tree-'));
    const archivePath = join(temporaryDirectory, 'template.tar');
    const extractedDirectory = join(temporaryDirectory, 'tree');

    try {
      await archiveGitTree(
        this.options.sourceDirectory,
        this.expectedCommit,
        archivePath,
      );
      await mkdir(extractedDirectory);
      await extractSafeGitTree(archivePath, extractedDirectory);
      await ensureSafeEmptyDestination(destination);
      await copySafeTree(extractedDirectory, destination);
    } finally {
      await rm(temporaryDirectory, { force: true, recursive: true });
    }
  }

  private async assertExpectedRepositoryAndCommit(): Promise<void> {
    const remoteUrl = await runGit(
      this.options.sourceDirectory,
      ['remote', 'get-url', 'origin'],
      'Não foi possível confirmar o repositório de origem do worktree',
    );

    if (normalizeRepository(remoteUrl) !== this.options.expectedRepository) {
      throw new CliError(
        'O repositório de origem do worktree não corresponde ao esperado',
      );
    }

    const resolvedCommit = await runGit(
      this.options.sourceDirectory,
      ['rev-parse', '--verify', `${this.expectedCommit}^{commit}`],
      'O commit esperado não existe no repositório de origem do worktree',
    );

    if (resolvedCommit.toLowerCase() !== this.expectedCommit) {
      throw new CliError(
        'O commit resolvido do worktree não corresponde ao commit esperado',
      );
    }
  }
}

async function archiveGitTree(
  sourceDirectory: string,
  commit: string,
  archivePath: string,
): Promise<void> {
  const child = spawn(
    'git',
    ['-C', sourceDirectory, 'archive', '--format=tar', commit],
    { stdio: ['ignore', 'pipe', 'ignore'] },
  );

  if (!child.stdout) {
    throw new CliError('Não foi possível materializar a árvore Git do commit');
  }

  try {
    await Promise.all([
      pipeline(child.stdout, createWriteStream(archivePath)),
      waitForSuccessfulExit(child),
    ]);
  } catch {
    throw new CliError('Não foi possível materializar a árvore Git do commit');
  }
}

async function extractSafeGitTree(
  archivePath: string,
  destination: string,
): Promise<void> {
  let containsUnsafeEntry = false;

  try {
    await tar.x({
      cwd: destination,
      file: archivePath,
      strict: true,
      preservePaths: false,
      filter: (entryPath, entry) => {
        if (!isSafeArchivePath(entryPath) || isForbiddenLink(entry)) {
          containsUnsafeEntry = true;
          return false;
        }

        return true;
      },
    });
  } catch {
    throw new CliError('A árvore Git contém uma entrada não segura');
  }

  if (containsUnsafeEntry) {
    throw new CliError('A árvore Git contém uma entrada não segura');
  }

  await assertTreeHasOnlySafeFiles(destination);
}

function isForbiddenLink(entry: unknown): boolean {
  return (
    typeof entry === 'object' &&
    entry !== null &&
    'type' in entry &&
    (entry.type === 'Link' || entry.type === 'SymbolicLink')
  );
}

function isSafeArchivePath(entryPath: string): boolean {
  const normalizedPath = entryPath.replaceAll('\\', '/');
  const pathWithoutDirectoryMarker = normalizedPath.endsWith('/')
    ? normalizedPath.slice(0, -1)
    : normalizedPath;

  return (
    pathWithoutDirectoryMarker.length > 0 &&
    !normalizedPath.startsWith('/') &&
    !pathWithoutDirectoryMarker
      .split('/')
      .some((part) => part === '..' || part === '')
  );
}

async function assertTreeHasOnlySafeFiles(directory: string): Promise<void> {
  const entries = await readdir(directory, { withFileTypes: true });

  for (const entry of entries) {
    const path = join(directory, entry.name);
    const details = await lstat(path);

    if (
      details.isSymbolicLink() ||
      (!details.isDirectory() && !details.isFile())
    ) {
      throw new CliError('A árvore Git contém uma entrada não segura');
    }

    if (details.isFile() && details.nlink !== 1) {
      throw new CliError('A árvore Git contém uma entrada não segura');
    }

    if (details.isDirectory()) {
      await assertTreeHasOnlySafeFiles(path);
    }
  }
}

async function ensureSafeEmptyDestination(destination: string): Promise<void> {
  const details = await lstat(destination);

  if (!details.isDirectory() || details.isSymbolicLink()) {
    throw new CliError('O destino do template deve ser um diretório seguro');
  }

  if ((await readdir(destination)).length > 0) {
    throw new CliError('O destino do template deve estar vazio');
  }
}

async function copySafeTree(
  source: string,
  destination: string,
): Promise<void> {
  for (const entry of await readdir(source, { withFileTypes: true })) {
    const sourcePath = join(source, entry.name);
    const destinationPath = join(destination, entry.name);
    const details = await lstat(sourcePath);

    if (details.isDirectory()) {
      await mkdir(destinationPath);
      await copySafeTree(sourcePath, destinationPath);
      continue;
    }

    if (!details.isFile() || details.nlink !== 1) {
      throw new CliError('A árvore Git contém uma entrada não segura');
    }

    await copyFile(sourcePath, destinationPath);
  }
}

async function runGit(
  sourceDirectory: string,
  arguments_: string[],
  errorMessage: string,
): Promise<string> {
  const child = spawn('git', ['-C', sourceDirectory, ...arguments_], {
    stdio: ['ignore', 'pipe', 'ignore'],
  });

  if (!child.stdout) {
    throw new CliError(errorMessage);
  }

  const chunks: Buffer[] = [];
  child.stdout.on('data', (chunk: Buffer) => chunks.push(chunk));

  try {
    await waitForSuccessfulExit(child);
  } catch {
    throw new CliError(errorMessage);
  }

  return Buffer.concat(chunks).toString('utf8').trim();
}

function waitForSuccessfulExit(child: ReturnType<typeof spawn>): Promise<void> {
  return new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('close', (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error('git encerrou com falha'));
    });
  });
}

function isRepositoryName(value: string): boolean {
  return /^[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+$/.test(value);
}

function normalizeRepository(remoteUrl: string): string | undefined {
  const normalizedUrl = remoteUrl
    .trim()
    .replace(/\/$/, '')
    .replace(/\.git$/, '');

  if (isRepositoryName(normalizedUrl)) {
    return normalizedUrl;
  }

  const sshMatch = /^git@github\.com:([^/]+\/[^/]+)$/.exec(normalizedUrl);
  if (sshMatch?.[1] && isRepositoryName(sshMatch[1])) {
    return sshMatch[1];
  }

  try {
    const url = new URL(normalizedUrl);
    const repository = url.pathname.replace(/^\//, '');

    if (url.hostname === 'github.com' && isRepositoryName(repository)) {
      return repository;
    }
  } catch {
    return undefined;
  }

  return undefined;
}
