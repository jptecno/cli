import { describe, expect, it } from 'vitest';

import { createGitHubArchiveUrl } from '../../src/adapters/github-template-source.js';

describe('createGitHubArchiveUrl', () => {
  it('cria a URL codeload para a tag imutável do template', () => {
    expect(
      createGitHubArchiveUrl(
        'jptecno/template-api-nodejs-typescript',
        'v0.1.0',
      ),
    ).toBe(
      'https://codeload.github.com/jptecno/template-api-nodejs-typescript/tar.gz/v0.1.0',
    );
  });

  it('codifica referências que contêm caracteres reservados', () => {
    expect(
      createGitHubArchiveUrl(
        'jptecno/template-api-nodejs-typescript',
        'release/test',
      ),
    ).toBe(
      'https://codeload.github.com/jptecno/template-api-nodejs-typescript/tar.gz/release%2Ftest',
    );
  });
});
