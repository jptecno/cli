import { createHash } from 'node:crypto';
import {
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  rm,
  rmdir,
  stat,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { FileRegistryCache } from '../../src/adapters/file-registry-cache.js';
import {
  RegistryCacheConcurrencyError,
  type RegistryCacheEntry,
  type RegistryCacheKey,
} from '../../src/contracts/registry-cache.port.js';

const directories: string[] = [];

async function cacheDirectory(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'jp-registry-cache-'));
  directories.push(directory);
  return directory;
}

function key(
  registryUrl = 'https://registry.example/catalog.json',
  trustFingerprint = 'ed25519:one',
): RegistryCacheKey {
  return { registryUrl, trustFingerprint };
}

function entry(revision = 4): RegistryCacheEntry {
  return {
    payload: new TextEncoder().encode('{"schemaVersion":2}'),
    signatureEnvelope: new TextEncoder().encode('{"signature":"abc"}'),
    signatureUrl: 'https://registry.example/catalog.json.sig',
    verifiedAt: new Date('2026-08-08T00:00:00.000Z'),
    expiresAt: new Date('2026-08-15T00:00:00.000Z'),
    revision,
  };
}

function cacheFile(directory: string, cacheKey: RegistryCacheKey): string {
  const digest = createHash('sha256')
    .update(JSON.stringify([cacheKey.registryUrl, cacheKey.trustFingerprint]))
    .digest('hex');
  return join(directory, `${digest}.json`);
}

afterEach(async () => {
  await Promise.all(
    directories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe('FileRegistryCache', () => {
  it('isola cada state por URL e fingerprint sem expor a URL no caminho', async () => {
    const directory = await cacheDirectory();
    const cache = new FileRegistryCache(directory);
    const firstKey = key();
    const secondKey = key('https://other.example/catalog.json');
    const thirdKey = key(undefined, 'ed25519:two');

    await cache.commit(firstKey, entry(4));
    await cache.commit(secondKey, entry(5));
    await cache.commit(thirdKey, entry(6));

    expect(await readdir(directory)).toEqual(
      expect.arrayContaining([
        basename(cacheFile(directory, firstKey)),
        basename(cacheFile(directory, secondKey)),
        basename(cacheFile(directory, thirdKey)),
      ]),
    );
    expect(await readdir(directory)).not.toContain('registry.example');
    expect(await cache.readHighWater(firstKey)).toBe(4);
    expect(await cache.readHighWater(secondKey)).toBe(5);
    expect(await cache.readHighWater(thirdKey)).toBe(6);
  });

  it('persiste o high-water e o snapshot com bytes, URLs e TTL serializados', async () => {
    const directory = await cacheDirectory();
    const cacheKey = key();
    const cache = new FileRegistryCache(directory);

    await cache.commit(cacheKey, entry());

    expect(
      JSON.parse(await readFile(cacheFile(directory, cacheKey), 'utf8')),
    ).toEqual({
      version: 1,
      highWaterRevision: 4,
      snapshot: {
        payload: 'eyJzY2hlbWFWZXJzaW9uIjoyfQ==',
        signatureEnvelope: 'eyJzaWduYXR1cmUiOiJhYmMifQ==',
        signatureUrl: 'https://registry.example/catalog.json.sig',
        verifiedAt: '2026-08-08T00:00:00.000Z',
        expiresAt: '2026-08-15T00:00:00.000Z',
        revision: 4,
      },
    });
    expect(await new FileRegistryCache(directory).readHighWater(cacheKey)).toBe(
      4,
    );
  });

  it('mantém o high-water monotônico para commits concorrentes', async () => {
    const directory = await cacheDirectory();
    const cacheKey = key();
    const newerCache = new FileRegistryCache(directory);
    const olderCache = new FileRegistryCache(directory);

    const [newer, older] = await Promise.all([
      newerCache.commit(cacheKey, entry(5)),
      olderCache.commit(cacheKey, entry(4)),
    ]);

    expect(newer).toEqual({ accepted: true });
    expect(older).toEqual({ accepted: false });
    expect(await newerCache.readHighWater(cacheKey)).toBe(5);
  });

  it('aguarda a liberação do lock da chave antes de gravar o commit', async () => {
    const directory = await cacheDirectory();
    const cacheKey = key();
    const path = cacheFile(directory, cacheKey);
    const lockPath = `${path}.lock`;
    const cache = new FileRegistryCache(directory);

    await mkdir(lockPath);
    const commit = cache.commit(cacheKey, entry());

    await new Promise((resolve) => setTimeout(resolve, 25));
    await expect(readFile(path, 'utf8')).rejects.toMatchObject({
      code: 'ENOENT',
    });

    await rmdir(lockPath);

    await expect(commit).resolves.toEqual({ accepted: true });
    expect(await cache.readHighWater(cacheKey)).toBe(4);
  });

  it('rejeita timeout de lock e preserva o state anterior', async () => {
    const directory = await cacheDirectory();
    const cacheKey = key();
    const path = cacheFile(directory, cacheKey);
    const cache = new FileRegistryCache(directory);

    await cache.commit(cacheKey, entry(4));
    await mkdir(`${path}.lock`);

    await expect(cache.commit(cacheKey, entry(5))).rejects.toBeInstanceOf(
      RegistryCacheConcurrencyError,
    );

    await rmdir(`${path}.lock`);
    expect(await cache.readHighWater(cacheKey)).toBe(4);
  });

  it('substitui o state por rename atômico sem deixar arquivo temporário', async () => {
    const directory = await cacheDirectory();
    const cache = new FileRegistryCache(directory);
    const cacheKey = key();

    await cache.commit(cacheKey, entry(4));
    await cache.commit(cacheKey, entry(5));

    expect(await readdir(directory)).toEqual([
      basename(cacheFile(directory, cacheKey)),
    ]);
    expect(await cache.readHighWater(cacheKey)).toBe(5);
  });

  it('rejeita state truncado ou malformado', async () => {
    const directory = await cacheDirectory();
    const cacheKey = key();
    await writeFile(cacheFile(directory, cacheKey), '{"version":1', 'utf8');

    await expect(
      new FileRegistryCache(directory).readHighWater(cacheKey),
    ).rejects.toThrow('O estado do cache do catálogo confiável é inválido');
  });

  it('restringe permissões do diretório e do arquivo quando o sistema as informa', async () => {
    const directory = await cacheDirectory();
    const cacheKey = key();
    const cache = new FileRegistryCache(directory);

    await cache.commit(cacheKey, entry());

    if (process.platform !== 'win32') {
      expect((await stat(directory)).mode & 0o777).toBe(0o700);
      expect((await stat(cacheFile(directory, cacheKey))).mode & 0o777).toBe(
        0o600,
      );
    }
  });
});
