import { execFileSync } from 'node:child_process';
import { copyFile, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

const script = new URL(
  '../../scripts/verify-vendored-schemas.mjs',
  import.meta.url,
);
const vendoredSchemasDirectory = new URL('../../src/schemas/', import.meta.url);
const schemas = [
  'template-registry-v2.schema.json',
  'template-manifest-v1.schema.json',
];
const temporaryDirectories: string[] = [];

async function createExternalSchemasDirectory(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'verify-vendored-schemas-'));
  temporaryDirectories.push(directory);

  await Promise.all(
    schemas.map((schema) =>
      copyFile(
        new URL(schema, vendoredSchemasDirectory),
        join(directory, schema),
      ),
    ),
  );

  return directory;
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { force: true, recursive: true })),
  );
});

describe('verify-vendored-schemas', () => {
  it('confirma os hashes esperados das cópias vendorizadas sem fonte externa', () => {
    const output = execFileSync(process.execPath, [script.pathname], {
      encoding: 'utf8',
    });

    expect(output).toContain(
      'template-registry-v2.schema.json eb89b0052cffd5ddbd5e2aed5a3403886b2299c77f1c157b81bedb0ae8caa21a',
    );
    expect(output).toContain(
      'template-manifest-v1.schema.json d540a58589af07f1ff76f720e8d241231d77f0cdbf11d83351ff131931b26b36',
    );
  });

  it('compara a fonte externa fornecida pela variável de ambiente', async () => {
    const externalSchemasDirectory = await createExternalSchemasDirectory();

    expect(() =>
      execFileSync(process.execPath, [script.pathname], {
        encoding: 'utf8',
        env: {
          ...process.env,
          VENDORED_SCHEMAS_SOURCE_DIR: externalSchemasDirectory,
        },
      }),
    ).not.toThrow();
  });

  it('rejeita uma fonte externa divergente fornecida por argumento', async () => {
    const externalSchemasDirectory = await createExternalSchemasDirectory();
    await writeFile(
      join(externalSchemasDirectory, 'template-registry-v2.schema.json'),
      '{}',
    );

    expect(() =>
      execFileSync(
        process.execPath,
        [script.pathname, externalSchemasDirectory],
        {
          encoding: 'utf8',
        },
      ),
    ).toThrow('O schema vendorizado diverge da origem externa');
  });
});
