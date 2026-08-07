import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const expectedDigests = {
  'template-registry-v2.schema.json':
    'eb89b0052cffd5ddbd5e2aed5a3403886b2299c77f1c157b81bedb0ae8caa21a',
  'template-manifest-v1.schema.json':
    'd540a58589af07f1ff76f720e8d241231d77f0cdbf11d83351ff131931b26b36',
};
const externalSourceDirectory =
  process.argv[2] ?? process.env.VENDORED_SCHEMAS_SOURCE_DIR;
const vendoredDirectory = new URL('../src/schemas/', import.meta.url);

for (const [schema, expectedDigest] of Object.entries(expectedDigests)) {
  const vendored = await readFile(new URL(schema, vendoredDirectory));
  const digest = createHash('sha256').update(vendored).digest('hex');

  if (digest !== expectedDigest) {
    throw new Error(
      `O hash do schema vendorizado é inválido: ${schema}. Esperado: ${expectedDigest}. Encontrado: ${digest}.`,
    );
  }

  if (externalSourceDirectory) {
    const canonical = await readFile(resolve(externalSourceDirectory, schema));

    if (!canonical.equals(vendored)) {
      throw new Error(
        `O schema vendorizado diverge da origem externa: ${schema}`,
      );
    }
  }

  console.log(`${schema} ${digest}`);
}
