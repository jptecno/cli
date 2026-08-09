import { describe, expect, it, vi } from 'vitest';

import {
  authorizeStaleRegistryUse,
  authorizeStaleTemplateCreation,
} from '../../src/application/authorize-stale-registry.js';
import type { LoadedTrustedRegistry } from '../../src/application/load-trusted-registry.js';
import type { Prompt } from '../../src/contracts/cli-ports.js';

function loadedRegistry(
  source: LoadedTrustedRegistry['source'],
  freshness: LoadedTrustedRegistry['freshness'],
): LoadedTrustedRegistry {
  return {
    registry: {
      schemaVersion: 2,
      revision: 1,
      publishedAt: '2026-08-08T00:00:00.000Z',
      templates: [],
    },
    source,
    freshness,
  };
}

function prompt(isInteractive: boolean, answers: boolean[] = []): Prompt {
  return {
    isInteractive: vi.fn(() => isInteractive),
    selectTemplate: vi.fn(),
    ask: vi.fn(),
    confirm: vi.fn(async () => answers.shift() ?? false),
  };
}

describe('authorizeStaleRegistryUse', () => {
  it.each(['network', 'cache'] as const)(
    'não pede autorização para registry fresh de %s',
    async (source) => {
      const cliPrompt = prompt(false);

      await expect(
        authorizeStaleRegistryUse(
          loadedRegistry(source, 'fresh'),
          { allowStaleRegistry: false, allowStaleTemplateCreation: false },
          { prompt: cliPrompt },
        ),
      ).resolves.toBeUndefined();

      expect(cliPrompt.confirm).not.toHaveBeenCalled();
    },
  );

  it.each([false, true])(
    'recusa uso stale em non-TTY sem allowStaleRegistry, mesmo com allowStaleTemplateCreation=%s',
    async (allowStaleTemplateCreation) => {
      const cliPrompt = prompt(false);

      await expect(
        authorizeStaleRegistryUse(
          loadedRegistry('cache', 'stale'),
          { allowStaleRegistry: false, allowStaleTemplateCreation },
          { prompt: cliPrompt },
        ),
      ).rejects.toThrow(
        'É necessária autorização para usar o catálogo desatualizado',
      );
      expect(cliPrompt.confirm).not.toHaveBeenCalled();
    },
  );

  it('autoriza uso stale em non-TTY com allowStaleRegistry', async () => {
    const cliPrompt = prompt(false);

    await expect(
      authorizeStaleRegistryUse(
        loadedRegistry('network', 'stale'),
        { allowStaleRegistry: true, allowStaleTemplateCreation: true },
        { prompt: cliPrompt },
      ),
    ).resolves.toBeUndefined();
    expect(cliPrompt.confirm).not.toHaveBeenCalled();
  });

  it('pede confirmação com padrão false e autoriza uso stale em TTY', async () => {
    const cliPrompt = prompt(true, [true]);

    await expect(
      authorizeStaleRegistryUse(
        loadedRegistry('cache', 'stale'),
        { allowStaleRegistry: false, allowStaleTemplateCreation: false },
        { prompt: cliPrompt },
      ),
    ).resolves.toBeUndefined();

    expect(cliPrompt.confirm).toHaveBeenCalledWith(
      'O catálogo está desatualizado. Deseja continuar usando-o?',
      false,
    );
  });

  it('recusa uso stale quando TTY rejeita a confirmação', async () => {
    await expect(
      authorizeStaleRegistryUse(
        loadedRegistry('cache', 'stale'),
        { allowStaleRegistry: true, allowStaleTemplateCreation: true },
        { prompt: prompt(true, [false]) },
      ),
    ).rejects.toThrow(
      'É necessária autorização para usar o catálogo desatualizado',
    );
  });
});

describe('authorizeStaleTemplateCreation', () => {
  it.each(['network', 'cache'] as const)(
    'não pede autorização para criar projeto com registry fresh de %s',
    async (source) => {
      const cliPrompt = prompt(false);

      await expect(
        authorizeStaleTemplateCreation(
          loadedRegistry(source, 'fresh'),
          { allowStaleRegistry: false, allowStaleTemplateCreation: false },
          { prompt: cliPrompt },
        ),
      ).resolves.toBeUndefined();

      expect(cliPrompt.confirm).not.toHaveBeenCalled();
    },
  );

  it.each([false, true])(
    'recusa criação stale em non-TTY sem allowStaleTemplateCreation, mesmo com allowStaleRegistry=%s',
    async (allowStaleRegistry) => {
      const cliPrompt = prompt(false);

      await expect(
        authorizeStaleTemplateCreation(
          loadedRegistry('cache', 'stale'),
          { allowStaleRegistry, allowStaleTemplateCreation: false },
          { prompt: cliPrompt },
        ),
      ).rejects.toThrow(
        'É necessária autorização para criar projeto com catálogo desatualizado',
      );
      expect(cliPrompt.confirm).not.toHaveBeenCalled();
    },
  );

  it('autoriza criação stale em non-TTY com allowStaleTemplateCreation', async () => {
    const cliPrompt = prompt(false);

    await expect(
      authorizeStaleTemplateCreation(
        loadedRegistry('network', 'stale'),
        { allowStaleRegistry: true, allowStaleTemplateCreation: true },
        { prompt: cliPrompt },
      ),
    ).resolves.toBeUndefined();
    expect(cliPrompt.confirm).not.toHaveBeenCalled();
  });

  it('pede confirmação com padrão false e autoriza criação stale em TTY', async () => {
    const cliPrompt = prompt(true, [true]);

    await expect(
      authorizeStaleTemplateCreation(
        loadedRegistry('cache', 'stale'),
        { allowStaleRegistry: false, allowStaleTemplateCreation: false },
        { prompt: cliPrompt },
      ),
    ).resolves.toBeUndefined();

    expect(cliPrompt.confirm).toHaveBeenCalledWith(
      'O catálogo está desatualizado. Deseja criar o projeto mesmo assim?',
      false,
    );
  });

  it('recusa criação stale quando TTY rejeita a confirmação', async () => {
    await expect(
      authorizeStaleTemplateCreation(
        loadedRegistry('cache', 'stale'),
        { allowStaleRegistry: true, allowStaleTemplateCreation: true },
        { prompt: prompt(true, [false]) },
      ),
    ).rejects.toThrow(
      'É necessária autorização para criar projeto com catálogo desatualizado',
    );
  });

  it('mantém a ordem dos dois consentimentos em TTY', async () => {
    const cliPrompt = prompt(true, [true, true]);
    const registry = loadedRegistry('cache', 'stale');

    await authorizeStaleRegistryUse(
      registry,
      { allowStaleRegistry: false, allowStaleTemplateCreation: false },
      { prompt: cliPrompt },
    );
    await authorizeStaleTemplateCreation(
      registry,
      { allowStaleRegistry: false, allowStaleTemplateCreation: false },
      { prompt: cliPrompt },
    );

    expect(cliPrompt.confirm).toHaveBeenNthCalledWith(
      1,
      'O catálogo está desatualizado. Deseja continuar usando-o?',
      false,
    );
    expect(cliPrompt.confirm).toHaveBeenNthCalledWith(
      2,
      'O catálogo está desatualizado. Deseja criar o projeto mesmo assim?',
      false,
    );
  });
});
