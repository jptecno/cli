import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import * as tar from 'tar';

import { CliError } from '../application/cli-error.js';

import type { TemplateSource } from '../contracts/cli-ports.js';
import type { TemplateDefinition } from '../contracts/template-registry.types.js';

export class GitHubTemplateSource implements TemplateSource {
  async materialize(
    template: TemplateDefinition,
    destination: string,
  ): Promise<void> {
    const temporaryDirectory = await mkdtemp(join(tmpdir(), 'jp-template-'));
    const archivePath = join(temporaryDirectory, 'template.tar.gz');

    try {
      const response = await fetch(
        createGitHubArchiveUrl(template.repository, template.ref),
        { signal: AbortSignal.timeout(requestTimeoutMilliseconds) },
      );

      if (!response.ok) {
        throw new CliError(
          `Não foi possível baixar ${template.id}: GitHub respondeu ${response.status}`,
        );
      }

      const archive = await response.arrayBuffer();
      await writeFile(archivePath, Buffer.from(archive));
      await tar.x({
        cwd: destination,
        file: archivePath,
        strip: 1,
        strict: true,
      });
    } catch (error) {
      if (error instanceof CliError) {
        throw error;
      }

      throw new CliError(
        `Não foi possível baixar ${template.id}: ${formatError(error)}`,
      );
    } finally {
      await rm(temporaryDirectory, { force: true, recursive: true });
    }
  }
}

export function createGitHubArchiveUrl(
  repository: string,
  ref: string,
): string {
  return `https://codeload.github.com/${repository}/tar.gz/${encodeURIComponent(ref)}`;
}

const requestTimeoutMilliseconds = 30_000;

function formatError(error: unknown): string {
  if (isTimeoutError(error)) {
    return 'a solicitação excedeu o tempo limite de 30 segundos';
  }

  return error instanceof Error ? error.message : 'erro desconhecido';
}

function isTimeoutError(error: unknown): boolean {
  return (
    error instanceof DOMException &&
    (error.name === 'TimeoutError' || error.name === 'AbortError')
  );
}
