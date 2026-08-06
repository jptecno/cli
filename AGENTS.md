# Diretrizes do Repositório

## Stack

- Node.js 24, TypeScript e configuração base `@tsconfig/node24`.
- CLI distribuída como pacote npm `@jptecno/cli`, com binário `jp` apontando para `dist/main.js`.
- APIs nativas do Node.js para sistema de arquivos, processos e entrada interativa.
- `tar` para extrair archives dos templates.
- BiomeJS como formatador e linter.
- Vitest para testes.

Mantenha as versões e os scripts definidos em `package.json` como fonte de verdade. Arquivos gerados devem permanecer em `dist/` e a cobertura em `coverage/`; nenhum deles deve ser versionado. O pacote publicado deve conter somente os arquivos declarados em `package.json`.

## Documentação para Agentes

Este arquivo é a fonte canônica e autocontida das regras operacionais para Claude Code, OpenCode, Codex, Cursor, Gemini CLI e demais agentes. Não dependa de links ou de outros documentos para encontrar instruções obrigatórias. `CONTRIBUTING.md` explica o processo para contribuidores humanos e complementa este arquivo, mas não substitui nenhuma regra abaixo.

Agentes não devem criar commits, fazer push, abrir ou atualizar pull requests, fazer merge, criar tags, publicar releases ou executar outras operações remotas sem solicitação explícita do usuário. Instruções operacionais abaixo descrevem o fluxo permitido, não concedem autorização para executá-lo autonomamente.

## Arquitetura e Estrutura

A CLI mantém separação simples entre fluxo de aplicação e detalhes de infraestrutura:

- `src/application/` — casos de uso, parsing, validação e erros da CLI. Não depende de GitHub, processos, terminal ou formato de archive.
- `src/contracts/` — tipos e portas que definem as dependências da aplicação, como catálogo, fonte de template, prompt e executor de comandos.
- `src/adapters/` — implementações das portas para GitHub, processos do sistema, archives e terminal interativo.
- `src/main.ts` — ponto de entrada que compõe as implementações concretas e traduz erros para saída de terminal.
- `tests/` — espelha a camada testada.

Regras de fronteira:

- A aplicação depende de contratos, nunca de adaptadores concretos.
- Adaptadores traduzem APIs externas e erros de infraestrutura; não concentram regras de criação de projeto.
- `main.ts` deve permanecer fino: parsing de argumentos, composição e código de saída.
- Mantenha módulos pequenos, coesos e com nomes que expressem a responsabilidade.

## Simplicidade e Clean Code

Evite over-engineering. Implemente somente abstrações justificadas por um fluxo real da CLI.

- Prefira código explícito, funções pequenas e responsabilidades únicas.
- Não introduza padrões, camadas, genéricos, factories ou interfaces sem uma dependência concreta a isolar.
- Prefira injeção de dependências nas funções/casos de uso que precisam ser testáveis sem rede, shell ou entrada interativa.
- Valide argumentos e dados externos nas bordas e retorne erros claros, acionáveis e em português brasileiro.
- Elimine duplicação relevante, sem abstrair prematuramente códigos que ainda não são estáveis.

## Estilo e Convenções

- Use TypeScript estrito, indentação de dois espaços, aspas simples, ponto e vírgula e imports de tipo com `import type` quando aplicável.
- O BiomeJS é a fonte de verdade para formatação e lint.
- Classes, tipos, interfaces e enums utilizam `PascalCase`; funções, variáveis e propriedades utilizam `camelCase`.
- Nomes de arquivos e diretórios utilizam `kebab-case`.
- Use nomes específicos que indiquem a responsabilidade, como `github-template-source.ts` e `parse-template-manifest.ts`.
- Evite arquivos genéricos como `utils.ts`, `helpers.ts` ou `common.ts`.
- Evite `any`; modele dados externos como `unknown` e faça o refinamento necessário antes do uso.

## Templates, Rede e Execução de Comandos

O CLI trata registry, manifests e archives como dados externos não confiáveis.

- Valide o schema do registry e do `template.json` antes de usá-los.
- Templates devem ser referenciados por tags SemVer imutáveis; não aceite branches como `main` ou `develop`.
- Valide que `version` e `ref` do template sejam iguais.
- Restrinja arquivos renderizados ao diretório de destino e rejeite caminhos com traversal ou links simbólicos.
- Para arquivos JSON, faça renderização estruturada e serialização válida; nunca permita que variáveis alterem a estrutura do documento.
- Não execute comandos arbitrários fornecidos por registry, template ou valores de variáveis.
- Os únicos comandos pós-criação permitidos no MVP são `git init`, `npm install` e `npm run check`, disparados explicitamente pela aplicação; o manifesto não controla comandos arbitrários.
- Quando a aplicação executa `npm install`, o npm pode executar lifecycle scripts declarados no `package.json` do template, como `preinstall`, `install` e `postinstall`. Este comportamento não deve ser alterado para `--ignore-scripts` sem decisão específica; use apenas templates confiáveis e revise-os antes da instalação.
- Nunca exponha tokens, URLs autenticadas ou dados sensíveis em mensagens de erro ou logs.

## Testes e Validação

- Testes Vitest ficam em `tests/` e terminam em `.test.ts`.
- Teste comportamento observável, não detalhes de implementação.
- Casos de uso devem ser testados com portas falsas, sem rede, shell ou entrada interativa reais.
- Adaptadores devem testar tradução de URLs, respostas e erros de dependências externas quando houver comportamento próprio.
- Todo bug corrigido deve receber um teste de regressão quando viável, especialmente para validação, paths, renderização e execução de comandos.
- Antes de enviar mudanças, execute `npm run check`.
- Antes de publicar, execute `npm pack --dry-run` e confirme que o pacote contém apenas os artefatos esperados.

## Fluxo Git, Worktrees e Ambientes

O repositório mantém duas branches permanentes:

- `development` — integração e ambiente de testes/homologação.
- `main` — código aprovado para produção.

Após o primeiro commit em `main`, crie e publique a base de integração:

```sh
git switch -c development
git push -u origin development
```

Todo desenvolvimento deve ocorrer em uma branch curta criada a partir de `development`, em um worktree separado. Não desenvolva diretamente em `development` ou `main`.

```sh
git fetch origin
git switch development
git pull --ff-only origin development
git worktree add ../cli-feat-nome -b feat/nome development
```

Fluxo obrigatório de promoção:

1. Desenvolva e valide a alteração no worktree da branch `feat/*`, `fix/*` ou equivalente.
2. Execute `npm run check` antes de abrir o pull request.
3. Abra pull request da branch de trabalho para `development`.
4. Após aprovação, CI verde e validação no ambiente de testes, faça merge em `development`.
5. Abra pull request de `development` para `main` somente após a homologação em `development`.
6. Faça merge em `main` somente com CI verde e aprovação; essa branch representa produção.

O ruleset ativo `Proteção de branches permanentes` (ID `20485383`) cobre a branch padrão (`main`) e `development`. Ele exige pull request, uma aprovação e conversas resolvidas; também bloqueia exclusão de branches e force push, sem bypass configurado.

O ruleset exige o check obrigatório `check` da GitHub Actions. Assim, além da execução local de `npm run check`, a CI desse check precisa estar verde para permitir o merge. Mantenha segredos e configurações de ambiente no provedor de deploy, nunca em branches ou arquivos versionados.

Para hotfixes urgentes feitos a partir de `main`, promova a correção de volta para `development` por pull request ou merge, evitando divergência entre as branches permanentes.

## Commits, Pull Requests e Publicação

Use Conventional Commits em português brasileiro, com escopo quando ele tornar a alteração mais clara. Exemplos:

- `feat(init): adiciona criação de projeto por template`
- `fix(render): escapa valores JSON do template`
- `test(registry): cobre referência de tag inválida`
- `chore(tooling): configura biome`

Use `.github/pull_request_template.md` como modelo obrigatório para todos os pull requests. Pull requests para `development` devem explicar resumo, alteração de comportamento do comando, templates ou registry afetados, camadas impactadas, compatibilidade, configuração/segurança e comandos de validação executados. Inclua exemplos de uso e saída para mudanças na interface da CLI. Pull requests de `development` para `main` devem preencher também a homologação realizada, impacto de produção e plano de rollback.

A CLI usa SemVer: correções compatíveis incrementam patch, novas funcionalidades compatíveis incrementam minor e mudanças incompatíveis incrementam major após `v1.0.0`. Enquanto a CLI estiver em `0.x`, trate novos recursos ou mudanças incompatíveis como incremento minor.

A publicação usa Release Please. Após o merge de `development` para `main`, o workflow `.github/workflows/release-please.yml` cria ou atualiza uma Release PR usando os commits convencionais. O merge dessa PR atualiza versão, lockfile e changelog, cria a tag e a GitHub Release, valida o pacote e publica `@jptecno/cli` por OIDC/Trusted Publishing. Depois da publicação, ele abre uma PR de sincronização `main` para `development`; ela deve ser revisada e integrada para evitar divergência entre as branches permanentes.

Não use `npm version`, não crie ou envie tags manualmente, não reutilize tags ou versões já publicadas e não use nem versione `NPM_TOKEN`. No npm Trusted Publisher, configure somente o nome `release-please.yml` como workflow, sem environment. Nunca use `--delete-branch` ao integrar PRs cuja origem seja `development` ou `main`.
