# @jptecno/cli

CLI para criar projetos padronizados a partir dos templates da JP Tecno.

## Uso

```sh
npx @jptecno/cli init billing-api
```

Quando `--template` não é informado em um terminal interativo, o comando apresenta um menu navegável. Use `↑` e `↓` para escolher um template e `Enter` para confirmar. Use `Ctrl+C` ou `Esc` para cancelar.

Em scripts, pipes ou CI, informe `--template <id>` para evitar uma seleção interativa.

### Listar templates

```sh
npx @jptecno/cli template list
```

Para consultar outro catálogo:

```sh
npx @jptecno/cli template list --registry https://exemplo.com/registry.json
```

### Opções

```text
jp init <diretório> [opções]
jp template list [--registry <url>]

--template <id>       Seleciona o template sem abrir o seletor.
--set chave=valor     Define uma variável do template. Pode ser repetido.
--registry <url>      Sobrescreve a URL do registry.
--no-git              Não executa git init.
--no-install          Não executa npm install nem npm run check.
--no-validate         Não executa npm run check.
```

Exemplo não interativo:

```sh
npx @jptecno/cli init billing-api \
  --template api-nodejs-typescript \
  --set projectName=billing-api \
  --set 'description=API de faturamento'
```

Por padrão, o CLI lê o catálogo público em `jptecno/template-registry`, baixa o archive GitHub da tag imutável declarada e executa `git init`, `npm install` e `npm run check` no projeto gerado.

## Segurança

O CLI valida o catálogo e o manifesto do template antes de usá-los. Os únicos comandos pós-criação aceitos neste MVP são `npm install` e `npm run check`, controlados pelo próprio CLI; templates não podem fornecer scripts arbitrários para execução.

## Desenvolvimento

```sh
npm ci
npm run check
```

### Branches, worktrees e ambientes

O repositório possui duas branches permanentes:

| Branch        | Finalidade               | Ambiente |
| ------------- | ------------------------ | -------- |
| `development` | Integração e homologação | Testes   |
| `main`        | Código aprovado          | Produção |

Após o primeiro commit em `main`, crie a branch de integração uma única vez:

```sh
git switch -c development
git push -u origin development
```

Todo trabalho deve começar a partir de `development` em um worktree próprio. Isso permite desenvolver mais de uma tarefa sem misturar dependências, builds ou alterações locais:

```sh
git fetch origin
git switch development
git pull --ff-only origin development
git worktree add ../cli-feat-nome -b feat/nome development
```

No worktree criado:

```sh
npm ci
npm run check
```

Fluxo de promoção:

1. Crie uma branch curta (`feat/*`, `fix/*` ou equivalente) a partir de `development`.
2. Desenvolva, teste e envie a branch para o repositório remoto.
3. Abra um pull request para `development`.
4. Faça merge em `development` somente após revisão, CI verde e validação no ambiente de testes.
5. Após a homologação, abra um pull request de `development` para `main`.
6. Faça merge em `main` somente com revisão e CI verde; essa branch aciona o ambiente de produção.

Não faça push direto em `development` ou `main`. Configure proteções de branch, revisões obrigatórias e checks obrigatórios no GitHub. Segredos e configurações de testes/produção devem ser configurados no provedor de deploy por ambiente, nunca em branches ou arquivos versionados.

### Modelo de pull request

Todo pull request deve usar [`.github/pull_request_template.md`](./.github/pull_request_template.md). O modelo exige:

- resumo e lista objetiva das alterações;
- comportamento e compatibilidade;
- camadas afetadas;
- exemplos de uso e saída quando a interface da CLI mudar;
- impacto de configuração e segurança;
- comandos e evidências de validação.

Para pull requests de `development` para `main`, preencha também homologação, impacto de produção e plano de rollback. Não remova seções aplicáveis; registre `Sem impacto` ou `Não se aplica` quando necessário.

## Versionamento e releases

A CLI usa [SemVer](https://semver.org/) e o Release Please calcula a próxima versão a partir dos commits convencionais em `main`:

| Commit                                          | Próxima versão                       |
| ----------------------------------------------- | ------------------------------------ |
| `fix(...)`                                      | Patch, por exemplo `0.2.1` → `0.2.2` |
| `feat(...)`                                     | Minor, por exemplo `0.2.1` → `0.3.0` |
| `feat(...)!` ou `BREAKING CHANGE` após `v1.0.0` | Major, por exemplo `1.2.0` → `2.0.0` |

Enquanto a CLI estiver em `0.x`, funcionalidades novas e alterações incompatíveis recebem incremento minor. Commits que não representam mudança publicável, como `docs`, `test`, `ci` e `chore`, não abrem uma Release PR por si só.

### Criar uma release

1. Promova a alteração homologada por pull request de `development` para `main`.
2. Após o merge, o workflow **Release Please** cria ou atualiza automaticamente uma Release PR em `main`, com `package.json`, `package-lock.json`, `CHANGELOG.md` e `.release-please-manifest.json`.
3. Revise e faça merge da Release PR. O mesmo workflow cria a tag imutável, a GitHub Release e publica `@jptecno/cli` no npm com provenance.
4. Depois da publicação, o workflow abre uma PR `chore/sync-release-vX.Y.Z` de `main` para `development`. Revise e faça o merge para manter as branches sincronizadas.

Não crie versões com `npm version`, não crie tags manualmente e não reutilize uma versão npm ou tag Git já publicada. Nunca use `--delete-branch` em PRs cuja origem seja `development` ou `main`.

## Publicação

A publicação é exclusiva do workflow **Release Please**, acionado após o merge de uma Release PR. Ele executa `npm ci`, `npm run check` e `npm publish --provenance` na revisão marcada pela release. A publicação só acontece depois que essas validações passam.

### Trusted Publishing no npm

O workflow usa OpenID Connect (OIDC) e não requer `NPM_TOKEN`. Nas configurações de Trusted Publisher do pacote `@jptecno/cli`, cadastre:

- repositório: `jptecno/cli`;
- workflow: somente `release-please.yml`;
- environment: vazio.

O campo aceita apenas o nome do arquivo, não `.github/workflows/release-please.yml`. O `repository.url` de `package.json` deve continuar sendo `https://github.com/jptecno/cli`, pois o npm o valida contra a provenance. Nunca adicione tokens npm ao repositório.
