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

  it('isenta a Release PR do Release Please das políticas de redação e fluxo', () => {
    expect(
      evaluatePullRequest(
        facts({
          title: 'chore(main): release 0.3.0',
          body: ':robot: I have created a release *beep* *boop*',
          baseBranch: 'main',
          headBranch: 'release-please--branches--main--components--cli',
          author: 'github-actions[bot]',
          files: [
            '.release-please-manifest.json',
            'CHANGELOG.md',
            'package-lock.json',
            'package.json',
          ],
          additions: 60,
          deletions: 4,
        }),
      ),
    ).toEqual({ failures: [], warnings: [] });
  });

  it('mantém a proibição de artefatos gerados na Release PR', () => {
    expect(
      evaluatePullRequest(
        facts({
          title: 'chore(main): release 0.3.0',
          body: null,
          baseBranch: 'main',
          headBranch: 'release-please--branches--main--components--cli',
          author: 'github-actions[bot]',
          files: ['CHANGELOG.md', 'dist/main.js'],
        }),
      ).failures,
    ).toEqual(['Não versione artefatos gerados: dist/main.js.']);
  });

  it('não isenta branch de release aberta por autor humano', () => {
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

  it('não isenta bot em branch fora do padrão do Release Please', () => {
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

  it('reprova artefatos em dist e coverage', () => {
    expect(
      evaluatePullRequest(
        facts({ files: ['dist/main.js', 'coverage/index.html'] }),
      ).failures,
    ).toContain(
      'Não versione artefatos gerados: dist/main.js, coverage/index.html.',
    );
  });

  it('avisa sobre PR grande sem reprovar', () => {
    expect(
      evaluatePullRequest(facts({ additions: 450, deletions: 51 })),
    ).toEqual({
      failures: [],
      warnings: [
        'PR grande: considere dividir a mudança para facilitar a revisão.',
      ],
    });
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
