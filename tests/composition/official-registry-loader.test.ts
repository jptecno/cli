import { describe, expect, it } from 'vitest';

import {
  createOfficialRegistryLoader,
  officialRegistryUrl,
} from '../../src/composition/official-registry-loader.js';

describe('official registry composition', () => {
  it('fixa o endpoint oficial Pages e compõe um carregador preguiçoso', () => {
    expect(officialRegistryUrl).toBe(
      'https://jptecno.github.io/template-registry/registry.json',
    );
    expect(createOfficialRegistryLoader()).toBeTypeOf('function');
  });
});
