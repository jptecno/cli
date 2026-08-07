import { execFileSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';

const script = new URL(
  '../../scripts/verify-vendored-schemas.mjs',
  import.meta.url,
);

describe('verify-vendored-schemas', () => {
  it('confirma bytes e digests das cópias canônicas locais', () => {
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
});
