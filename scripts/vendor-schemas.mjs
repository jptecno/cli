import { copyFile } from 'node:fs/promises';

const schemas = [
  'template-registry-v2.schema.json',
  'template-manifest-v1.schema.json',
];
const canonicalDirectory = new URL(
  '../../../../template-registry/.worktrees/hardening-platform/schemas/',
  import.meta.url,
);
const vendoredDirectory = new URL('../src/schemas/', import.meta.url);

await Promise.all(
  schemas.map((schema) =>
    copyFile(
      new URL(schema, canonicalDirectory),
      new URL(schema, vendoredDirectory),
    ),
  ),
);
