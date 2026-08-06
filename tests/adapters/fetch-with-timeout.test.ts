import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  fetchWithTimeout,
  formatFetchError,
  requestTimeoutMilliseconds,
} from '../../src/adapters/fetch-with-timeout.js';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('requestTimeoutMilliseconds', () => {
  it('define um limite de 30 segundos', () => {
    expect(requestTimeoutMilliseconds).toBe(30_000);
  });
});

describe('fetchWithTimeout', () => {
  it('chama fetch com um sinal de aborto', async () => {
    const response = new Response('ok');
    const fetchMock = vi.fn().mockResolvedValue(response);
    vi.stubGlobal('fetch', fetchMock);

    await expect(fetchWithTimeout('https://example.com/recurso')).resolves.toBe(
      response,
    );
    expect(fetchMock).toHaveBeenCalledWith(
      'https://example.com/recurso',
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
  });

  it('mescla opções adicionais preservando o sinal de aborto', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('ok'));
    vi.stubGlobal('fetch', fetchMock);

    await fetchWithTimeout('https://example.com/recurso', {
      method: 'POST',
    });

    expect(fetchMock).toHaveBeenCalledWith(
      'https://example.com/recurso',
      expect.objectContaining({
        method: 'POST',
        signal: expect.any(AbortSignal),
      }),
    );
  });
});

describe('formatFetchError', () => {
  it('formata erro de tempo limite (TimeoutError) em português', () => {
    expect(formatFetchError(new DOMException('', 'TimeoutError'))).toBe(
      'a solicitação excedeu o tempo limite de 30 segundos',
    );
  });

  it('formata erro de tempo limite (AbortError) em português', () => {
    expect(formatFetchError(new DOMException('', 'AbortError'))).toBe(
      'a solicitação excedeu o tempo limite de 30 segundos',
    );
  });

  it('preserva a mensagem de um erro conhecido', () => {
    expect(formatFetchError(new Error('falha de rede'))).toBe('falha de rede');
  });

  it('usa uma mensagem genérica para valores que não são Error', () => {
    expect(formatFetchError('algo inesperado')).toBe('erro desconhecido');
  });
});
