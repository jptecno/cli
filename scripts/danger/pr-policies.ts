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

const namedPolicyEntities: Readonly<Record<string, string>> = {
  amp: '&',
  apos: "'",
  atilde: 'ã',
  emsp: ' ',
  ensp: ' ',
  gt: '>',
  lt: '<',
  nbsp: ' ',
  quot: '"',
  sol: '/',
  thinsp: ' ',
  zerowidthspace: '',
};

function decodePolicyEntities(value: string): string {
  return value.replace(
    /&#([0-9]+);?|&#x([0-9a-f]+);?|&([a-z][a-z0-9]+);/gi,
    (entity, decimal: string, hexadecimal: string, named: string) => {
      if (decimal || hexadecimal) {
        const codePoint = Number.parseInt(
          decimal || hexadecimal,
          decimal ? 10 : 16,
        );
        return codePoint <= 0x10ffff ? String.fromCodePoint(codePoint) : '';
      }
      return namedPolicyEntities[named.toLocaleLowerCase('en-US')] ?? entity;
    },
  );
}

function meaningfulText(value: string): string {
  return decodePolicyEntities(value)
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/```[\s\S]*?```/g, '')
    .replace(/<\/?[a-z][^>]*>/gi, '')
    .replace(/&[a-z][a-z0-9]+;/gi, '')
    .replace(/[\p{Cf}\p{M}]/gu, '')
    .replace(/^\s*[-*]\s*$/gm, '')
    .replace(/^\s*- \[[ x]\].*$/gim, '')
    .replace(/[#*_`>]/g, '')
    .trim();
}

function sectionFieldRawValue(
  body: string,
  heading: string,
  label: string,
): string {
  const line = section(body, heading)
    .split('\n')
    .find((candidate) => candidate.trim().startsWith(`- ${label}:`));
  return line?.slice(line.indexOf(':') + 1) ?? '';
}

function sectionFieldValue(
  body: string,
  heading: string,
  label: string,
): string {
  return meaningfulText(sectionFieldRawValue(body, heading, label));
}

function hasPromotionField(body: string, label: string): boolean {
  return (
    sectionFieldValue(body, 'Homologação, release e produção', label).length > 0
  );
}

function hasLargePullRequestField(body: string, label: string): boolean {
  const fieldValue = sectionFieldValue(body, 'Escopo e tamanho', label);
  const normalizedValue = fieldValue
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLocaleLowerCase('pt-BR')
    .replace(/^[\p{P}\p{S}]+|[\p{P}\p{S}]+$/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
  return (
    /[\p{L}\p{N}]/u.test(fieldValue) &&
    normalizedValue !== 'nao se aplica' &&
    normalizedValue !== 'n/a'
  );
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

  const largePullRequest =
    facts.files.length > 30 || facts.additions + facts.deletions > 500;
  if (
    largePullRequest &&
    !isBot(facts.author) &&
    (!hasLargePullRequestField(body, 'Motivo para não dividir') ||
      !hasLargePullRequestField(body, 'Estratégia de revisão'))
  ) {
    failures.push(
      'PR grande: divida a mudança ou preencha Motivo para não dividir e Estratégia de revisão na seção Escopo e tamanho.',
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
