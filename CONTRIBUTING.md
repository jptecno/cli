# Contribuindo com @jptecno/cli

Este guia descreve como desenvolver, validar, promover e publicar mudanças na CLI. As regras operacionais para agentes estão integralmente em [`AGENTS.md`](./AGENTS.md).

## Ambiente local

Pré-requisito: Node.js 24.

```sh
npm ci
npm run check
```

Os scripts de `package.json` são a fonte de verdade. Não versione `dist/`, `coverage/`, credenciais, tokens ou arquivos `.env`. Antes de uma publicação, valide também o conteúdo do pacote:

```sh
npm pack --dry-run
```

## Arquitetura e convenções

A CLI mantém separação simples entre aplicação e infraestrutura:

- `src/application/` — casos de uso, parsing, validação e erros;
- `src/contracts/` — tipos e portas de dependências;
- `src/adapters/` — GitHub, sistema de arquivos, processos, archive e terminal;
- `src/main.ts` — parsing, composição e código de saída;
- `tests/` — testes Vitest que espelham a camada testada.

Use TypeScript estrito, Biome, Vitest, arquivos em `kebab-case` e imports de tipos com `import type`. Teste comportamento observável; não use rede, shell ou entrada interativa reais nos testes de aplicação.

## Segurança de templates

O manifesto não pode controlar comandos arbitrários: a CLI somente dispara os comandos pós-criação previstos pela aplicação. Contudo, quando `npm install` está habilitado, o npm pode executar lifecycle scripts existentes no `package.json` do template, incluindo `preinstall`, `install` e `postinstall`. A CLI ainda não usa `--ignore-scripts`; contribua apenas com templates confiáveis e revise os arquivos do template antes de instalar dependências.

## Fluxo de desenvolvimento

As branches permanentes são:

| Branch | Finalidade | Ambiente |
| --- | --- | --- |
| `development` | Integração e homologação | Testes |
| `main` | Código aprovado | Produção |

Toda mudança começa em uma branch curta, criada de `development`, dentro de um worktree:

```sh
git fetch origin
git switch development
git pull --ff-only origin development
git worktree add ../cli-feat-nome -b feat/nome development
```

No worktree, desenvolva e execute `npm run check`. Abra uma pull request para `development`. Depois de revisão, CI verde e homologação, abra uma pull request de `development` para `main`.

Não faça push direto em `development` ou `main`. Nunca use `--delete-branch` em pull requests cuja origem seja uma dessas branches permanentes.

### Proteção externa das branches permanentes

O ruleset ativo `Proteção de branches permanentes` (ID `20485383`) cobre `main` e `development`. Ele exige pull request, uma aprovação e conversas resolvidas, bloqueia exclusão e force push e não permite bypass.

O ruleset exige o check obrigatório `check` da GitHub Actions. Portanto, além de executar `npm run check` localmente, aguarde a CI desse check ficar verde antes do merge.

## Pull requests

Use [`.github/pull_request_template.md`](./.github/pull_request_template.md). A PR deve registrar resumo, alterações, impacto de comportamento, configuração ou segurança e evidências de validação. PRs de `development` para `main` precisam registrar também homologação, impacto de produção, versão esperada e rollback.

Use Conventional Commits em português brasileiro, com escopo quando ele trouxer clareza:

```text
feat(init): adiciona criação de projeto por template
fix(render): escapa valores JSON do template
test(registry): cobre referência de tag inválida
chore(tooling): configura biome
```

## Runbook de release

A publicação usa Release Please e é guiada pelos commits convencionais que chegam a `main`.

| Commit | Próxima versão |
| --- | --- |
| `fix(...)` | Patch |
| `feat(...)` | Minor |
| `feat(...)!` ou `BREAKING CHANGE` após `v1.0.0` | Major |

Enquanto a CLI estiver em `0.x`, funcionalidades novas e alterações incompatíveis recebem incremento minor. Commits `docs`, `test`, `ci` e `chore` não abrem uma Release PR isoladamente.

O fluxo é:

1. Promova a alteração homologada por PR de `development` para `main`.
2. O workflow **Release Please** cria ou atualiza automaticamente uma Release PR com `package.json`, `package-lock.json`, `CHANGELOG.md` e `.release-please-manifest.json`.
3. Revise e faça merge da Release PR.
4. O workflow cria a tag, a GitHub Release, executa `npm ci`, `npm run check` e `npm pack --dry-run`, então publica no npm com provenance.
5. Depois da publicação, o workflow abre uma PR `chore/sync-release-vX.Y.Z` de `main` para `development`. Revise e faça merge para manter as branches sincronizadas.

Não use `npm version`, não crie ou envie tags manualmente e não reutilize versões npm ou tags Git publicadas.

### Configuração externa obrigatória

- GitHub Actions: `GITHUB_TOKEN` com permissões de escrita para conteúdo e pull requests; a organização/repositório deve permitir que GitHub Actions crie pull requests.
- npm Trusted Publisher: repositório `jptecno/cli`, workflow `release-please.yml` e environment vazio.
- O workflow usa OIDC. Não use, crie ou versione `NPM_TOKEN`.
- `package.json.repository.url` deve continuar sendo `https://github.com/jptecno/cli`, pois o npm valida essa URL contra a provenance.

### Diagnóstico e rollback

Se uma Release PR não for criada, confirme que há um commit `fix(...)` ou `feat(...)` elegível em `main`. Se a publicação falhar, corrija a causa em uma nova PR; não mova nem reutilize a tag ou versão. Para reverter a automação antes de uma nova release, reverta a PR que a introduziu em `main` e restaure a configuração do Trusted Publisher somente se voltar ao workflow anterior for indispensável.
