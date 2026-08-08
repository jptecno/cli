import { createHash, randomUUID } from 'node:crypto';
import {
  chmod,
  mkdir,
  readFile,
  rename,
  rmdir,
  unlink,
  writeFile,
} from 'node:fs/promises';
import { join } from 'node:path';
import { setTimeout } from 'node:timers/promises';

import { CliError } from '../application/cli-error.js';
import {
  type RegistryCache,
  type RegistryCacheCommitResult,
  RegistryCacheConcurrencyError,
  type RegistryCacheEntry,
  type RegistryCacheKey,
} from '../contracts/registry-cache.port.js';

const cacheFileMode = 0o600;
const cacheDirectoryMode = 0o700;
const lockRetryIntervalMs = 10;
const lockWaitTimeoutMs = 1_000;

interface PersistedRegistryCacheEntry {
  payload: string;
  signatureEnvelope: string;
  signatureUrl: string;
  verifiedAt: string;
  expiresAt: string;
  revision: number;
}

interface PersistedRegistryCacheState {
  version: 1;
  highWaterRevision: number;
  snapshot: PersistedRegistryCacheEntry;
}

export class FileRegistryCache implements RegistryCache {
  private static readonly pendingByDirectory = new Map<string, Promise<void>>();

  constructor(private readonly directory: string) {}

  async readHighWater(key: RegistryCacheKey): Promise<number | undefined> {
    return this.serialize(async () => {
      const state = await this.readState(this.pathFor(key));
      return state?.highWaterRevision;
    });
  }

  async commit(
    key: RegistryCacheKey,
    entry: RegistryCacheEntry,
  ): Promise<RegistryCacheCommitResult> {
    return this.serialize(async () => {
      const path = this.pathFor(key);
      await this.ensureCacheDirectory();

      return this.withLock(path, async () => {
        const state = await this.readState(path);

        if (state !== undefined && entry.revision < state.highWaterRevision) {
          return { accepted: false };
        }

        const nextState: PersistedRegistryCacheState = {
          version: 1,
          highWaterRevision: Math.max(
            state?.highWaterRevision ?? entry.revision,
            entry.revision,
          ),
          snapshot: serializeEntry(entry),
        };
        await this.writeState(path, nextState);

        return { accepted: true };
      });
    });
  }

  private async serialize<T>(operation: () => Promise<T>): Promise<T> {
    const pending = FileRegistryCache.pendingByDirectory.get(this.directory);
    const result = (pending ?? Promise.resolve()).then(operation, operation);
    FileRegistryCache.pendingByDirectory.set(
      this.directory,
      result.then(
        () => undefined,
        () => undefined,
      ),
    );
    return result;
  }

  private pathFor(key: RegistryCacheKey): string {
    const digest = createHash('sha256')
      .update(JSON.stringify([key.registryUrl, key.trustFingerprint]))
      .digest('hex');
    return join(this.directory, `${digest}.json`);
  }

  private async withLock<T>(
    path: string,
    operation: () => Promise<T>,
  ): Promise<T> {
    const lockPath = `${path}.lock`;
    await this.acquireLock(lockPath);

    try {
      return await operation();
    } finally {
      await rmdir(lockPath).catch(() => undefined);
    }
  }

  private async acquireLock(lockPath: string): Promise<void> {
    const deadline = Date.now() + lockWaitTimeoutMs;

    while (true) {
      try {
        await mkdir(lockPath, { mode: cacheDirectoryMode });
        return;
      } catch (error: unknown) {
        if (!isExistingPath(error)) {
          throw new CliError(
            'Não foi possível bloquear o cache do catálogo confiável',
          );
        }

        if (Date.now() >= deadline) {
          throw new RegistryCacheConcurrencyError();
        }

        await setTimeout(lockRetryIntervalMs);
      }
    }
  }

  private async ensureCacheDirectory(): Promise<void> {
    try {
      await mkdir(this.directory, {
        recursive: true,
        mode: cacheDirectoryMode,
      });
      await chmod(this.directory, cacheDirectoryMode);
    } catch {
      throw new CliError(
        'Não foi possível gravar o cache do catálogo confiável',
      );
    }
  }

  private async readState(
    path: string,
  ): Promise<PersistedRegistryCacheState | undefined> {
    let serialized: string;

    try {
      serialized = await readFile(path, 'utf8');
    } catch (error: unknown) {
      if (isMissingFile(error)) {
        return undefined;
      }
      throw new CliError('Não foi possível ler o cache do catálogo confiável');
    }

    try {
      return parseState(serialized);
    } catch {
      throw new CliError('O estado do cache do catálogo confiável é inválido');
    }
  }

  private async writeState(
    path: string,
    state: PersistedRegistryCacheState,
  ): Promise<void> {
    try {
      const temporaryPath = `${path}.${randomUUID()}.tmp`;
      try {
        await writeFile(temporaryPath, JSON.stringify(state), {
          encoding: 'utf8',
          mode: cacheFileMode,
          flag: 'wx',
        });
        await chmod(temporaryPath, cacheFileMode);
        await rename(temporaryPath, path);
        await chmod(path, cacheFileMode);
      } catch (error) {
        await unlink(temporaryPath).catch(() => undefined);
        throw error;
      }
    } catch {
      throw new CliError(
        'Não foi possível gravar o cache do catálogo confiável',
      );
    }
  }
}

function serializeEntry(
  entry: RegistryCacheEntry,
): PersistedRegistryCacheEntry {
  return {
    payload: Buffer.from(entry.payload).toString('base64'),
    signatureEnvelope: Buffer.from(entry.signatureEnvelope).toString('base64'),
    signatureUrl: entry.signatureUrl,
    verifiedAt: entry.verifiedAt.toISOString(),
    expiresAt: entry.expiresAt.toISOString(),
    revision: entry.revision,
  };
}

function parseState(serialized: string): PersistedRegistryCacheState {
  const value: unknown = JSON.parse(serialized);
  if (!isRecord(value) || value.version !== 1) {
    throw new Error();
  }

  const { highWaterRevision, snapshot } = value;
  if (!isRevision(highWaterRevision) || !isRecord(snapshot)) {
    throw new Error();
  }

  const {
    payload,
    signatureEnvelope,
    signatureUrl,
    verifiedAt,
    expiresAt,
    revision,
  } = snapshot;
  if (
    !isBase64(payload) ||
    !isBase64(signatureEnvelope) ||
    typeof signatureUrl !== 'string' ||
    !isIsoDate(verifiedAt) ||
    !isIsoDate(expiresAt) ||
    !isRevision(revision) ||
    revision > highWaterRevision
  ) {
    throw new Error();
  }

  return {
    version: 1,
    highWaterRevision,
    snapshot: {
      payload,
      signatureEnvelope,
      signatureUrl,
      verifiedAt,
      expiresAt,
      revision,
    },
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isRevision(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

function isBase64(value: unknown): value is string {
  if (typeof value !== 'string') {
    return false;
  }

  return Buffer.from(value, 'base64').toString('base64') === value;
}

function isIsoDate(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    !Number.isNaN(new Date(value).getTime()) &&
    new Date(value).toISOString() === value
  );
}

function isExistingPath(error: unknown): error is NodeJS.ErrnoException {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === 'EEXIST'
  );
}

function isMissingFile(error: unknown): error is NodeJS.ErrnoException {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === 'ENOENT'
  );
}
