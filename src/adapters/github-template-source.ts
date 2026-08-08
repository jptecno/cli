import { createWriteStream } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import * as tar from 'tar';

import { CliError } from '../application/cli-error.js';
import type { TemplateSource } from '../contracts/cli-ports.js';
import type { TemplateDefinition } from '../contracts/template-registry.types.js';
import { fetchWithTimeout, formatFetchError } from './fetch-with-timeout.js';

/**
 * Limite máximo de bytes aceito para o archive compactado de um template.
 *
 * Templates de projeto são código-fonte e alguns poucos assets; alguns
 * megabytes já são generosos para esse caso. 50 MiB dá margem confortável
 * para templates com binários leves (ícones, fontes), mas ainda impede que
 * um repositório muito grande ou um registry malicioso derrube o processo
 * por consumo de memória/disco sem limite.
 */
export const maximumArchiveBytes = 50 * 1024 * 1024;

/**
 * Proteção contra "zip bomb": aborta a extração se o conteúdo descompactado
 * crescer muito mais rápido do que o esperado em relação ao archive
 * compactado. Código-fonte típico dificilmente passa de uma razão de
 * compressão de 10x; 50x já cobre esse caso com folga sem abrir espaço para
 * um archive pequeno expandir para dezenas de gigabytes em disco.
 */
const maximumDecompressionRatio = 50;

export class GitHubTemplateSource implements TemplateSource {
  async materialize(
    template: TemplateDefinition,
    destination: string,
  ): Promise<void> {
    const temporaryDirectory = await mkdtemp(join(tmpdir(), 'jp-template-'));
    const archivePath = join(temporaryDirectory, 'template.tar.gz');

    try {
      const response = await fetchWithTimeout(
        createGitHubArchiveUrl(
          template.repository,
          template.commit ?? template.ref,
        ),
      );

      if (!response.ok) {
        throw new CliError(
          `Não foi possível baixar ${template.id}: GitHub respondeu ${response.status}`,
        );
      }

      await downloadArchiveToFile(response, archivePath, template.id);
      let containsForbiddenLink = false;

      await tar.x({
        cwd: destination,
        file: archivePath,
        strip: 1,
        strict: true,
        maxDecompressionRatio: maximumDecompressionRatio,
        filter: (_path, entry) => {
          if (
            'type' in entry &&
            (entry.type === 'Link' || entry.type === 'SymbolicLink')
          ) {
            containsForbiddenLink = true;
            return false;
          }

          return true;
        },
      });

      if (containsForbiddenLink) {
        throw new CliError(
          `Não foi possível baixar ${template.id}: o archive contém um link não permitido`,
        );
      }
    } catch (error) {
      if (error instanceof CliError) {
        throw error;
      }

      throw new CliError(
        `Não foi possível baixar ${template.id}: ${formatFetchError(error)}`,
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

async function downloadArchiveToFile(
  response: Response,
  archivePath: string,
  templateId: string,
): Promise<void> {
  if (!response.body) {
    throw new CliError(
      `Não foi possível baixar ${templateId}: GitHub não retornou conteúdo para o archive`,
    );
  }

  const declaredBytes = Number(response.headers.get('content-length'));
  if (Number.isFinite(declaredBytes) && declaredBytes > maximumArchiveBytes) {
    throw archiveTooLargeError(templateId);
  }

  let downloadedBytes = 0;
  const enforceByteLimit = new Transform({
    transform(chunk: Buffer, _encoding, callback) {
      downloadedBytes += chunk.length;

      if (downloadedBytes > maximumArchiveBytes) {
        callback(archiveTooLargeError(templateId));
        return;
      }

      callback(null, chunk);
    },
  });

  await pipeline(
    Readable.fromWeb(response.body),
    enforceByteLimit,
    createWriteStream(archivePath),
  );
}

function archiveTooLargeError(templateId: string): CliError {
  return new CliError(
    `Não foi possível baixar ${templateId}: o archive excede o limite de ${maximumArchiveBytes} bytes`,
  );
}
