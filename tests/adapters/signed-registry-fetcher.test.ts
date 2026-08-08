import { afterEach, describe, expect, it, vi } from 'vitest';
import { Ed25519RegistryVerifier } from '../../src/adapters/ed25519-registry-verifier.js';
import { SignedRegistryFetcher } from '../../src/adapters/signed-registry-fetcher.js';
import { CliError } from '../../src/application/cli-error.js';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('SignedRegistryFetcher', () => {
  it('baixa registry e assinatura padrão em ordem, verifica os bytes e os retorna', async () => {
    const registry = Buffer.from('{conteúdo que não é JSON}');
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(registry))
      .mockResolvedValueOnce(new Response('{}'));
    vi.stubGlobal('fetch', fetchMock);
    const verifier = new Ed25519RegistryVerifier(new Map());
    const verify = vi.spyOn(verifier, 'verify').mockImplementation(() => {});

    const result = await new SignedRegistryFetcher(verifier).load(
      'https://registry.example/catalog.json',
    );

    expect(result).toEqual(new Uint8Array(registry));
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      'https://registry.example/catalog.json',
      expect.objectContaining({
        redirect: 'error',
        signal: expect.any(AbortSignal),
      }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'https://registry.example/catalog.json.sig',
      expect.objectContaining({
        redirect: 'error',
        signal: expect.any(AbortSignal),
      }),
    );
    expect(verify).toHaveBeenCalledWith(new Uint8Array(registry), {});
  });

  it('usa uma URL HTTPS de assinatura fornecida explicitamente', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response('registry'))
      .mockResolvedValueOnce(new Response('{}'));
    vi.stubGlobal('fetch', fetchMock);
    const verifier = new Ed25519RegistryVerifier(new Map());
    vi.spyOn(verifier, 'verify').mockImplementation(() => {});

    await new SignedRegistryFetcher(verifier).load(
      'https://registry.example/catalog.json',
      'https://signatures.example/catalog.sig',
    );

    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'https://signatures.example/catalog.sig',
      expect.any(Object),
    );
  });

  it.each([
    ['http://registry.example/catalog.json', undefined],
    [
      'https://registry.example/catalog.json',
      'http://signatures.example/catalog.sig',
    ],
  ])(
    'rejeita URL não HTTPS antes de iniciar qualquer download',
    async (url, signatureUrl) => {
      const fetchMock = vi.fn();
      vi.stubGlobal('fetch', fetchMock);
      const verifier = new Ed25519RegistryVerifier(new Map());

      await expect(
        new SignedRegistryFetcher(verifier).load(url, signatureUrl),
      ).rejects.toThrow('O endereço do catálogo assinado deve usar HTTPS');
      expect(fetchMock).not.toHaveBeenCalled();
    },
  );

  it('sanitiza falha HTTP sem ecoar URL ou corpo remoto', async () => {
    const url = 'https://token@example.com/catalog.json';
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(new Response('segredo remoto', { status: 503 })),
    );
    const verifier = new Ed25519RegistryVerifier(new Map());

    await expect(new SignedRegistryFetcher(verifier).load(url)).rejects.toEqual(
      expect.objectContaining({
        name: 'CliError',
        message: 'Não foi possível baixar o catálogo assinado: HTTP 503',
      }),
    );
  });

  it('rejeita resposta maior que 1 MiB sem verificar o conteúdo', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(new Uint8Array(1024 * 1024 + 1)));
    vi.stubGlobal('fetch', fetchMock);
    const verifier = new Ed25519RegistryVerifier(new Map());
    const verify = vi.spyOn(verifier, 'verify');

    await expect(
      new SignedRegistryFetcher(verifier).load(
        'https://registry.example/catalog.json',
      ),
    ).rejects.toThrow('O catálogo assinado excede o limite de tamanho');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(verify).not.toHaveBeenCalled();
  });

  it('rejeita envelope de assinatura maior que 64 KiB', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response('registry'))
      .mockResolvedValueOnce(new Response(new Uint8Array(64 * 1024 + 1)));
    vi.stubGlobal('fetch', fetchMock);
    const verifier = new Ed25519RegistryVerifier(new Map());

    await expect(
      new SignedRegistryFetcher(verifier).load(
        'https://registry.example/catalog.json',
      ),
    ).rejects.toThrow('O catálogo assinado excede o limite de tamanho');
  });

  it('rejeita envelope de assinatura que não é JSON', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response('registry'))
      .mockResolvedValueOnce(new Response('envelope inválido'));
    vi.stubGlobal('fetch', fetchMock);
    const verifier = new Ed25519RegistryVerifier(new Map());

    await expect(
      new SignedRegistryFetcher(verifier).load(
        'https://registry.example/catalog.json',
      ),
    ).rejects.toThrow('O envelope de assinatura do catálogo é inválido');
  });

  it('propaga a falha do verificador sem interpretar o registry', async () => {
    const registry = Buffer.from('isto não é JSON válido');
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(registry))
      .mockResolvedValueOnce(new Response('{"schemaVersion":1}'));
    vi.stubGlobal('fetch', fetchMock);
    const verifier = new Ed25519RegistryVerifier(new Map());
    vi.spyOn(verifier, 'verify').mockImplementation(() => {
      throw new CliError('A assinatura do catálogo é inválida');
    });

    await expect(
      new SignedRegistryFetcher(verifier).load(
        'https://registry.example/catalog.json',
      ),
    ).rejects.toThrow('A assinatura do catálogo é inválida');
  });

  it('retorna CliError sanitizado para falha de rede', async () => {
    const url = 'https://token@example.com/catalog.json';
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error(url)));
    const verifier = new Ed25519RegistryVerifier(new Map());

    await expect(new SignedRegistryFetcher(verifier).load(url)).rejects.toEqual(
      expect.objectContaining({
        name: CliError.name,
        message: 'Não foi possível baixar o catálogo assinado',
      }),
    );
  });
});
