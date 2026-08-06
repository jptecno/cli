import { afterEach, describe, expect, it, vi } from 'vitest';

import { GitHubRegistryClient } from '../../src/adapters/github-registry-client.js';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('GitHubRegistryClient', () => {
  it('informa em português quando o carregamento do catálogo excede o tempo limite', async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValue(new DOMException('', 'TimeoutError'));
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      new GitHubRegistryClient().load('https://example.com/registry.json'),
    ).rejects.toThrow(
      'Não foi possível acessar o catálogo de templates: a solicitação excedeu o tempo limite de 30 segundos',
    );
    expect(fetchMock).toHaveBeenCalledWith(
      'https://example.com/registry.json',
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
  });

  it('preserva uma mensagem acionável para erro de rede ao carregar o catálogo', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockRejectedValue(new Error('falha de rede')),
    );

    await expect(
      new GitHubRegistryClient().load('https://example.com/registry.json'),
    ).rejects.toThrow(
      'Não foi possível acessar o catálogo de templates: falha de rede',
    );
  });
});
