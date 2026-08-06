export interface PullRequestFacts {
  title: string;
  body: string | null;
  baseBranch: string;
  headBranch: string;
  author: string;
  files: string[];
  additions: number;
  deletions: number;
}

export interface PolicyResults {
  failures: string[];
  warnings: string[];
}

const conventionalTitle =
  /^(build|chore|ci|docs|feat|fix|perf|refactor|revert|style|test)(\([a-z0-9-]+\))?!?: .+[^.]$/;
const artifactPath = /^(dist|coverage)(\/|$)/;
const behavioralPath = /^src\//;
const testPath = /^tests\/.*\.test\.ts$/;
const sensitivePath =
  /^(\.github\/workflows\/|package(?:-lock)?\.json$|scripts\/|\.npmrc$)/;
const dependabotBranch = /^dependabot\//;
const releasePleaseBranch = /^release-please--/;
const botAuthor = /\[bot\]$/;

function section(body: string, heading: string): string {
  const escapedHeading = heading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = body.match(
    new RegExp(
      `^## ${escapedHeading}\\s*$([\\s\\S]*?)(?=^## |(?![\\s\\S]))`,
      'im',
    ),
  );
  return match?.[1] ?? '';
}

function meaningfulText(value: string): string {
  return value
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/```[\s\S]*?```/g, '')
    .replace(/^\s*[-*]\s*$/gm, '')
    .replace(/^\s*- \[[ x]\].*$/gim, '')
    .replace(/[#*_`>]/g, '')
    .trim();
}

function hasPromotionField(body: string, label: string): boolean {
  const line = section(body, 'Homologação, release e produção')
    .split('\n')
    .find((candidate) => candidate.trim().startsWith(`- ${label}:`));
  return meaningfulText(line?.slice(line.indexOf(':') + 1) ?? '').length > 0;
}

function isBot(author: string): boolean {
  return botAuthor.test(author.trim());
}

/**
 * O corpo das pull requests do Dependabot é o changelog e as notas de release
 * da dependência atualizada, gerados por um serviço de terceiro que não aceita
 * template. Só as regras de redação são dispensadas; título convencional e
 * proibição de artefatos gerados continuam valendo.
 *
 * Automação cujo texto é nosso não entra aqui: a pull request de sincronização
 * de release é escrita pelo workflow `release-please.yml` e o cabeçalho da
 * Release PR vem de `release-please-config.json`. Nesses dois casos o padrão de
 * pull request é seguido, não dispensado.
 */
function waivesBodyTemplate(facts: PullRequestFacts): boolean {
  return dependabotBranch.test(facts.headBranch) && isBot(facts.author);
}

/**
 * A Release PR do Release Please é a única origem legítima para `main` além de
 * `development`: ela nasce da branch própria do bot e carrega o bump de versão
 * e o changelog. O corpo dela segue o padrão via `pull-request-header`.
 *
 * As duas condições, prefixo de branch e autor bot, são exigidas juntas para
 * que uma branch com nome parecido aberta por uma pessoa não escape da regra de
 * fluxo entre branches permanentes.
 */
function isReleasePullRequest(facts: PullRequestFacts): boolean {
  return releasePleaseBranch.test(facts.headBranch) && isBot(facts.author);
}

function findVersionedArtifacts(files: string[]): string[] {
  return files.filter((file) => artifactPath.test(file));
}

export function evaluatePullRequest(facts: PullRequestFacts): PolicyResults {
  const failures: string[] = [];
  const warnings: string[] = [];
  const body = facts.body ?? '';
  const bodyTemplateWaived = waivesBodyTemplate(facts);

  if (!conventionalTitle.test(facts.title.trim())) {
    failures.push('Use um título no formato Conventional Commits.');
  }

  if (
    !bodyTemplateWaived &&
    meaningfulText(section(body, 'Resumo')).length === 0
  ) {
    failures.push('Preencha a seção Resumo com uma descrição objetiva.');
  }

  if (
    facts.baseBranch === 'main' &&
    facts.headBranch !== 'development' &&
    !isReleasePullRequest(facts)
  ) {
    failures.push('Pull requests para main devem ter origem em development.');
  }

  if (facts.baseBranch === 'main' && facts.headBranch === 'development') {
    const requiredFields = [
      'Ambiente de homologação e resultado',
      'Impacto de produção',
      'Plano de rollback',
    ];

    for (const field of requiredFields) {
      if (!hasPromotionField(body, field)) {
        failures.push(`Preencha o campo de promoção: ${field}.`);
      }
    }
  }

  const artifacts = findVersionedArtifacts(facts.files);
  if (artifacts.length > 0) {
    failures.push(`Não versione artefatos gerados: ${artifacts.join(', ')}.`);
  }

  if (
    !bodyTemplateWaived &&
    (facts.files.length > 30 || facts.additions + facts.deletions > 500)
  ) {
    warnings.push(
      'PR grande: considere dividir a mudança para facilitar a revisão.',
    );
  }

  if (
    facts.files.some((file) => behavioralPath.test(file)) &&
    !facts.files.some((file) => testPath.test(file))
  ) {
    warnings.push(
      'Há alteração em src/ sem teste modificado; confirme a cobertura no PR.',
    );
  }

  if (
    !bodyTemplateWaived &&
    facts.files.some((file) => sensitivePath.test(file)) &&
    meaningfulText(section(body, 'Configuração e segurança')).length === 0
  ) {
    warnings.push(
      'Arquivos sensíveis foram alterados; descreva o contexto em Configuração e segurança.',
    );
  }

  return { failures, warnings };
}
