import { afterEach, describe, expect, it, vi } from 'vitest';

import { Ed25519RegistryVerifier } from '../../src/adapters/ed25519-registry-verifier.js';
import { SignedRegistryFetcher } from '../../src/adapters/signed-registry-fetcher.js';
import { CliError } from '../../src/application/cli-error.js';
import { RegistryFetchUnavailableError } from '../../src/contracts/verified-registry-fetcher.port.js';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function fetcher() {
  return new SignedRegistryFetcher(new Ed25519RegistryVerifier(new Map()));
}

describe('SignedRegistryFetcher', () => {
  it('baixa registry e envelope, verifica os bytes exatos e os retorna sem alterá-los', async () => {
    const payload = new TextEncoder().encode('{conteúdo}');
    const envelope = new TextEncoder().encode('{}');
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(payload))
      .mockResolvedValueOnce(new Response(envelope));
    vi.stubGlobal('fetch', fetchMock);
    const verifier = new Ed25519RegistryVerifier(new Map());
    const verify = vi.spyOn(verifier, 'verify').mockImplementation(() => {});

    await expect(
      new SignedRegistryFetcher(verifier).load(
        'https://registry.example/catalog.json',
      ),
    ).resolves.toEqual({
      payload,
      signatureEnvelope: envelope,
      signatureUrl: 'https://registry.example/catalog.json.sig',
    });
    expect(verify).toHaveBeenCalledWith(payload, {});
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it.each([408, 429, 500, 503])(
    'classifica HTTP %i como indisponibilidade transitória sanitizada',
    async (status) => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue(new Response('segredo remoto', { status })),
      );
      await expect(
        fetcher().load('https://token@example.com/catalog.json'),
      ).rejects.toEqual(
        expect.objectContaining({
          name: RegistryFetchUnavailableError.name,
          message: 'Não foi possível baixar o catálogo assinado',
        }),
      );
    },
  );

  it.each([400, 401, 404])(
    'mantém HTTP %i como falha sem fallback',
    async (status) => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue(new Response('segredo remoto', { status })),
      );
      await expect(
        fetcher().load('https://token@example.com/catalog.json'),
      ).rejects.toEqual(
        expect.objectContaining({
          name: CliError.name,
          message: `Não foi possível baixar o catálogo assinado: HTTP ${status}`,
        }),
      );
    },
  );

  it('classifica falha de rede como indisponibilidade transitória sem expor URL', async () => {
    const url = 'https://token@example.com/catalog.json';
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error(url)));
    await expect(fetcher().load(url)).rejects.toBeInstanceOf(
      RegistryFetchUnavailableError,
    );
  });

  it('sanitiza redirect encadeado pelo fetch do Node sem classificar indisponibilidade', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockRejectedValue(
        new TypeError('fetch failed', {
          cause: new Error('unexpected redirect'),
        }),
      ),
    );

    await expect(
      fetcher().load('https://registry.example/catalog.json'),
    ).rejects.toEqual(
      expect.objectContaining({
        name: CliError.name,
        message: 'O catálogo assinado não permite redirecionamentos',
      }),
    );
  });

  it('rejeita URL não HTTPS antes de iniciar qualquer download', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    await expect(
      fetcher().load('http://registry.example/catalog.json'),
    ).rejects.toThrow('O endereço do catálogo assinado deve usar HTTPS');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('não classifica conteúdo ausente, limite e envelope inválido como indisponibilidade', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response(null, { status: 200 })),
    );
    await expect(
      fetcher().load('https://registry.example/catalog.json'),
    ).rejects.toBeInstanceOf(CliError);

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response(new Uint8Array(1024 * 1024 + 1))),
    );
    await expect(
      fetcher().load('https://registry.example/catalog.json'),
    ).rejects.toThrow('O catálogo assinado excede o limite de tamanho');

    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(new Response('registry'))
        .mockResolvedValueOnce(new Response('inválido')),
    );
    await expect(
      fetcher().load('https://registry.example/catalog.json'),
    ).rejects.toThrow('O envelope de assinatura do catálogo é inválido');
  });

  it('classifica falha durante a leitura do stream como indisponibilidade transitória', async () => {
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.error(new Error('stream falhou'));
      },
    });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(stream)));
    await expect(
      fetcher().load('https://registry.example/catalog.json'),
    ).rejects.toBeInstanceOf(RegistryFetchUnavailableError);
  });
});
