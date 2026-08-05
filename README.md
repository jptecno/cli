# @jptecno/cli

CLI para criar projetos padronizados a partir dos templates da JP Tecno.

## Uso

```sh
npx @jptecno/cli init billing-api
```

O comando lista os templates do registry, solicita as variáveis definidas pelo template e cria o projeto no diretório informado.

### Opções

```text
jp init <diretório> [opções]

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

## Publicação

1. Atualize a versão em `package.json` na branch de trabalho.
2. Execute `npm run check` e `npm pack --dry-run`.
3. Promova a alteração por pull request para `development` e valide-a no ambiente de testes.
4. Abra e aprove o pull request de `development` para `main`.
5. Após o merge em `main`, crie e envie a tag Git correspondente. O workflow `Publish package` validará a tag, executará o check e publicará automaticamente o pacote no npm.

### Trusted Publishing no npm

O workflow de publicação usa OpenID Connect (OIDC) e não requer `NPM_TOKEN`. Depois que o pacote existir no npm e o workflow estiver em `main`, cadastre o repositório `jptecno/cli` como Trusted Publisher nas configurações do pacote. No campo de workflow, informe somente `publish.yml` e não configure um environment, pois o workflow não usa GitHub Environments.

A tag deve ser criada a partir de um commit já presente em `main` e corresponder exatamente à versão de `package.json`:

```sh
git switch main
git pull --ff-only origin main
git tag v0.1.0
git push origin v0.1.0
```

O workflow executa `npm publish --provenance` com acesso público. Provenance só pode ser gerada pelo GitHub Actions/OIDC; uma publicação local não possui um provider compatível.

Para criar o pacote público pela primeira vez, após autenticar no npm, execute localmente sem a flag de provenance:

```sh
npm publish --access public
```

Em seguida, configure o Trusted Publisher no npm. As próximas versões devem ser publicadas exclusivamente pelo workflow acionado pela tag. Nunca adicione tokens npm ao repositório.
