import { describe, expect, it } from 'vitest';

import {
  evaluatePullRequest,
  type PullRequestFacts,
} from '../../scripts/danger/pr-policies.js';

const completeBody = `## Resumo

Adiciona revisão automatizada aos pull requests.

## Configuração e segurança

Permissões mínimas e nenhuma credencial nova.

## Homologação, release e produção

- Ambiente de homologação e resultado: validado em development
- Impacto de produção: sem impacto na execução da CLI
- Próxima versão esperada (\`fix\` = patch, \`feat\` = minor, ou sem release): sem release
- Plano de rollback: reverter o merge
`;

function facts(overrides: Partial<PullRequestFacts> = {}): PullRequestFacts {
  return {
    title: 'ci(review): adiciona políticas de pull request',
    body: completeBody,
    baseBranch: 'development',
    headBranch: 'chore/automated-review',
    author: 'marcelo',
    files: [
      'scripts/danger/pr-policies.ts',
      'tests/scripts/pr-policies.test.ts',
    ],
    additions: 100,
    deletions: 20,
    ...overrides,
  };
}

describe('evaluatePullRequest', () => {
  it('aceita uma pull request que atende às políticas objetivas', () => {
    expect(evaluatePullRequest(facts())).toEqual({
      failures: [],
      warnings: [],
    });
  });

  it('reprova título fora de Conventional Commits', () => {
    expect(
      evaluatePullRequest(facts({ title: 'Adiciona revisão.' })).failures,
    ).toContain('Use um título no formato Conventional Commits.');
  });

  it('reprova resumo vazio ou mantido apenas como placeholder', () => {
    const body = `## Resumo

<!-- Explique o problema e a alteração em poucas linhas. -->

## Alterações

-`;

    expect(evaluatePullRequest(facts({ body })).failures).toContain(
      'Preencha a seção Resumo com uma descrição objetiva.',
    );
  });

  it('reprova pull request para main fora de development', () => {
    expect(
      evaluatePullRequest(
        facts({ baseBranch: 'main', headBranch: 'fix/urgente' }),
      ).failures,
    ).toContain('Pull requests para main devem ter origem em development.');
  });

  it('reprova promoção sem homologação, impacto e rollback preenchidos', () => {
    const body = `## Resumo

Promove a versão homologada.

## Homologação, release e produção

- Ambiente de homologação e resultado:
- Impacto de produção:
- Plano de rollback:`;
    const failures = evaluatePullRequest(
      facts({ body, baseBranch: 'main', headBranch: 'development' }),
    ).failures;

    expect(failures).toEqual([
      'Preencha o campo de promoção: Ambiente de homologação e resultado.',
      'Preencha o campo de promoção: Impacto de produção.',
      'Preencha o campo de promoção: Plano de rollback.',
    ]);
  });

  it('aceita a Release PR do Release Please com o cabeçalho configurado', () => {
    expect(
      evaluatePullRequest(
        facts({
          title: 'chore(main): release 0.3.0',
          body: `## Resumo

Release preparada pelo Release Please a partir dos commits convencionais.

## Configuração e segurança

Apenas bump de versão e changelog.`,
          baseBranch: 'main',
          headBranch: 'release-please--branches--main--components--cli',
          author: 'github-actions[bot]',
          files: [
            '.release-please-manifest.json',
            'CHANGELOG.md',
            'package-lock.json',
            'package.json',
          ],
        }),
      ),
    ).toEqual({ failures: [], warnings: [] });
  });

  it('exige resumo da Release PR, que não é dispensada da redação', () => {
    expect(
      evaluatePullRequest(
        facts({
          title: 'chore(main): release 0.3.0',
          body: ':robot: I have created a release *beep* *boop*',
          baseBranch: 'main',
          headBranch: 'release-please--branches--main--components--cli',
          author: 'github-actions[bot]',
        }),
      ).failures,
    ).toEqual(['Preencha a seção Resumo com uma descrição objetiva.']);
  });

  it('aceita a pull request de sincronização de release vinda do workflow', () => {
    expect(
      evaluatePullRequest(
        facts({
          title: 'chore(release): sincroniza v0.3.0 em development',
          body: `## Resumo

Sincroniza a release v0.3.0 de main para development.

## Configuração e segurança

Sem impacto.`,
          baseBranch: 'development',
          headBranch: 'chore/sync-release-v0.3.0',
          author: 'github-actions[bot]',
          files: ['package.json', 'package-lock.json', 'CHANGELOG.md'],
        }),
      ),
    ).toEqual({ failures: [], warnings: [] });
  });

  it('mantém a proibição de artefatos gerados na Release PR', () => {
    expect(
      evaluatePullRequest(
        facts({
          title: 'chore(main): release 0.3.0',
          body: '## Resumo\n\nRelease preparada pelo Release Please.',
          baseBranch: 'main',
          headBranch: 'release-please--branches--main--components--cli',
          author: 'github-actions[bot]',
          files: ['CHANGELOG.md', 'dist/main.js'],
        }),
      ).failures,
    ).toEqual(['Não versione artefatos gerados: dist/main.js.']);
  });

  it('não aceita branch de release aberta por autor humano como origem para main', () => {
    const failures = evaluatePullRequest(
      facts({
        title: 'chore(main): release 0.3.0',
        body: ':robot: I have created a release *beep* *boop*',
        baseBranch: 'main',
        headBranch: 'release-please--branches--main--components--cli',
        author: 'atacante',
      }),
    ).failures;

    expect(failures).toContain(
      'Preencha a seção Resumo com uma descrição objetiva.',
    );
    expect(failures).toContain(
      'Pull requests para main devem ter origem em development.',
    );
  });

  it('não isenta bot em branch fora dos padrões de automação', () => {
    expect(
      evaluatePullRequest(
        facts({
          title: 'chore(main): release 0.3.0',
          body: ':robot: I have created a release *beep* *boop*',
          baseBranch: 'main',
          headBranch: 'chore/release-manual',
          author: 'github-actions[bot]',
        }),
      ).failures,
    ).toContain('Pull requests para main devem ter origem em development.');
  });

  it('isenta as pull requests do Dependabot das políticas de redação', () => {
    expect(
      evaluatePullRequest(
        facts({
          title: 'chore(deps-dev): bump typescript from 5.9.3 to 7.0.2',
          body: 'Bumps [typescript](https://github.com/microsoft/TypeScript) from 5.9.3 to 7.0.2.',
          baseBranch: 'development',
          headBranch: 'dependabot/npm_and_yarn/development/typescript-7.0.2',
          author: 'dependabot[bot]',
          files: ['package.json', 'package-lock.json'],
        }),
      ),
    ).toEqual({ failures: [], warnings: [] });
  });

  it('isenta atualização de action do Dependabot sem avisar sobre workflow', () => {
    expect(
      evaluatePullRequest(
        facts({
          title: 'chore(deps): bump actions/checkout from 4.2.2 to 7.0.1',
          body: 'Bumps actions/checkout from 4.2.2 to 7.0.1.',
          baseBranch: 'development',
          headBranch:
            'dependabot/github_actions/development/actions/checkout-7.0.1',
          author: 'dependabot[bot]',
          files: ['.github/workflows/ci.yml'],
        }),
      ),
    ).toEqual({ failures: [], warnings: [] });
  });

  it('não isenta branch do Dependabot aberta por autor humano', () => {
    expect(
      evaluatePullRequest(
        facts({
          title: 'chore(deps-dev): bump typescript from 5.9.3 to 7.0.2',
          body: 'Bumps typescript from 5.9.3 to 7.0.2.',
          headBranch: 'dependabot/npm_and_yarn/development/typescript-7.0.2',
          author: 'atacante',
        }),
      ).failures,
    ).toContain('Preencha a seção Resumo com uma descrição objetiva.');
  });

  it('reprova artefatos em dist e coverage', () => {
    expect(
      evaluatePullRequest(
        facts({ files: ['dist/main.js', 'coverage/index.html'] }),
      ).failures,
    ).toContain(
      'Não versione artefatos gerados: dist/main.js, coverage/index.html.',
    );
  });

  it('reprova PR humano grande sem justificativa e estratégia de revisão', () => {
    expect(
      evaluatePullRequest(facts({ additions: 450, deletions: 51 })),
    ).toEqual({
      failures: [
        'PR grande: divida a mudança ou preencha Motivo para não dividir e Estratégia de revisão na seção Escopo e tamanho.',
      ],
      warnings: [],
    });
  });

  it('aplica a política somente acima de 30 arquivos ou 500 linhas', () => {
    const thirtyFiles = Array.from(
      { length: 30 },
      (_, index) => `docs/policy-${index}.md`,
    );
    const thirtyOneFiles = [...thirtyFiles, 'docs/policy-30.md'];

    expect(
      evaluatePullRequest(
        facts({ files: thirtyFiles, additions: 400, deletions: 100 }),
      ),
    ).toEqual({ failures: [], warnings: [] });
    expect(
      evaluatePullRequest(
        facts({ files: thirtyFiles, additions: 401, deletions: 100 }),
      ).failures,
    ).toContain(
      'PR grande: divida a mudança ou preencha Motivo para não dividir e Estratégia de revisão na seção Escopo e tamanho.',
    );
    expect(
      evaluatePullRequest(facts({ files: thirtyOneFiles })).failures,
    ).toContain(
      'PR grande: divida a mudança ou preencha Motivo para não dividir e Estratégia de revisão na seção Escopo e tamanho.',
    );
  });

  it.each([
    'Não se aplica',
    'Nao se aplica',
    'Não se aplica;',
    'Não se aplica?',
    'Não se aplica,',
    'Não se aplica…',
    'Não se aplica—',
    'N&atilde;o se aplica',
    'N&#227;o se aplica',
    'N/A',
    'N&#47;A',
    'N&sol;A',
  ])('reprova motivo não aplicável em PR grande: %s', (placeholder) => {
    const body = `${completeBody}

## Escopo e tamanho

- Motivo para não dividir: ${placeholder}
- Estratégia de revisão: revisar por grupos de arquivos relacionados.
`;

    expect(
      evaluatePullRequest(facts({ body, additions: 501 })).failures,
    ).toContain(
      'PR grande: divida a mudança ou preencha Motivo para não dividir e Estratégia de revisão na seção Escopo e tamanho.',
    );
  });

  it('reprova estratégia de revisão marcada como não aplicável', () => {
    const body = `${completeBody}

## Escopo e tamanho

- Motivo para não dividir: os arquivos formam uma única migração atômica.
- Estratégia de revisão: Não se aplica.
`;

    expect(
      evaluatePullRequest(facts({ body, additions: 501 })).failures,
    ).toContain(
      'PR grande: divida a mudança ou preencha Motivo para não dividir e Estratégia de revisão na seção Escopo e tamanho.',
    );
  });

  it.each([
    '<br>',
    '&nbsp;',
    '&ensp;',
    '&thinsp;',
    '&#8203;',
    '&#8204;',
    '&#8205;',
    '&#8288;',
    '&#65279;',
    '\u200B',
  ])('reprova conteúdo visualmente vazio em PR grande: %s', (placeholder) => {
    const body = `${completeBody}

## Escopo e tamanho

- Motivo para não dividir: ${placeholder}
- Estratégia de revisão: revisar por grupos de arquivos relacionados.
`;

    expect(
      evaluatePullRequest(facts({ body, additions: 501 })).failures,
    ).toContain(
      'PR grande: divida a mudança ou preencha Motivo para não dividir e Estratégia de revisão na seção Escopo e tamanho.',
    );
  });

  it('reprova PR grande quando apenas um dos campos está preenchido', () => {
    const body = `${completeBody}

## Escopo e tamanho

- Motivo para não dividir: os arquivos formam uma única migração atômica.
- Estratégia de revisão:
`;

    expect(
      evaluatePullRequest(facts({ body, additions: 501 })).failures,
    ).toContain(
      'PR grande: divida a mudança ou preencha Motivo para não dividir e Estratégia de revisão na seção Escopo e tamanho.',
    );
  });

  it('aceita PR humano grande com justificativa e estratégia de revisão', () => {
    const body = `${completeBody}

## Escopo e tamanho

- Motivo para não dividir: os módulos A&amp;B formam uma única migração atômica.
- Estratégia de revisão: revisar por commit e validar cada sensor separadamente.
`;

    expect(
      evaluatePullRequest(facts({ body, additions: 450, deletions: 51 })),
    ).toEqual({ failures: [], warnings: [] });
  });

  it('mantém automação conhecida isenta da justificativa de tamanho', () => {
    expect(
      evaluatePullRequest(
        facts({
          title: 'chore(deps-dev): bump vitest from 3.2.7 to 4.1.10',
          body: 'Bumps vitest from 3.2.7 to 4.1.10.',
          headBranch: 'dependabot/npm_and_yarn/development/vitest-4.1.10',
          author: 'dependabot[bot]',
          files: ['package.json', 'package-lock.json'],
          additions: 900,
          deletions: 900,
        }),
      ),
    ).toEqual({ failures: [], warnings: [] });
  });

  it('isenta autor bot da justificativa de tamanho em branch comum', () => {
    expect(
      evaluatePullRequest(
        facts({
          headBranch: 'chore/sync-release-v0.3.0',
          author: 'github-actions[bot]',
          additions: 900,
          deletions: 900,
        }),
      ),
    ).toEqual({ failures: [], warnings: [] });
  });

  it('não isenta PR humano grande por usar branch com nome de bot', () => {
    expect(
      evaluatePullRequest(
        facts({
          headBranch: 'dependabot/npm_and_yarn/development/vitest-4.1.10',
          author: 'atacante',
          additions: 900,
          deletions: 900,
        }),
      ).failures,
    ).toContain(
      'PR grande: divida a mudança ou preencha Motivo para não dividir e Estratégia de revisão na seção Escopo e tamanho.',
    );
  });

  it('avisa sobre alteração comportamental sem exigir teste para toda mudança', () => {
    expect(evaluatePullRequest(facts({ files: ['src/main.ts'] }))).toEqual({
      failures: [],
      warnings: [
        'Há alteração em src/ sem teste modificado; confirme a cobertura no PR.',
      ],
    });
    expect(
      evaluatePullRequest(
        facts({ files: ['src/main.ts', 'tests/main.test.ts'] }),
      ).warnings,
    ).not.toContain(
      'Há alteração em src/ sem teste modificado; confirme a cobertura no PR.',
    );
  });

  it('avisa sobre arquivo sensível somente quando falta contexto', () => {
    const bodyWithoutContext = `## Resumo

Atualiza o workflow.`;

    expect(
      evaluatePullRequest(
        facts({
          body: bodyWithoutContext,
          files: ['.github/workflows/ci.yml'],
        }),
      ).warnings,
    ).toContain(
      'Arquivos sensíveis foram alterados; descreva o contexto em Configuração e segurança.',
    );
    expect(
      evaluatePullRequest(facts({ files: ['.github/workflows/ci.yml'] }))
        .warnings,
    ).not.toContain(
      'Arquivos sensíveis foram alterados; descreva o contexto em Configuração e segurança.',
    );
  });
});
