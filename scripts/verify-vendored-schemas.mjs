import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';

const schemas = [
  'template-registry-v2.schema.json',
  'template-manifest-v1.schema.json',
];
const canonicalDirectory = new URL(
  '../../../../template-registry/.worktrees/hardening-platform/schemas/',
  import.meta.url,
);
const vendoredDirectory = new URL('../src/schemas/', import.meta.url);

for (const schema of schemas) {
  const [canonical, vendored] = await Promise.all([
    readFile(new URL(schema, canonicalDirectory)),
    readFile(new URL(schema, vendoredDirectory)),
  ]);

  if (!canonical.equals(vendored)) {
    throw new Error(
      `O schema vendorizado diverge da origem canônica: ${schema}`,
    );
  }

  const digest = createHash('sha256').update(canonical).digest('hex');
  console.log(`${schema} ${digest}`);
}
