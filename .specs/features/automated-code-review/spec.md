# Revisão automatizada — lote piloto

## Objetivo

Adicionar três revisores complementares para pull requests: Semgrep CE bloqueante apenas para achados locais de alta confiança, Danger JS para políticas objetivas e heurísticas, e PR-Agent estritamente advisory.

## Requisitos e critérios de aceitação

### R1 — análise estática

- **AC1.1:** regras Semgrep locais detectam execução shell/comandos inseguros e configurações perigosas de GitHub Actions, com casos positivos e negativos.
- **AC1.2:** a validação usa Semgrep CE com métricas desativadas e o comando oficial de teste da versão adotada.
- **AC1.3:** o workflow publica achados no diff via reviewdog sem mascarar a falha bloqueante do Semgrep.
- **AC1.4:** forks degradam com segurança, sem secrets; actions de terceiros usam SHA completo comentado com a versão.

### R2 — políticas de pull request

- **AC2.1:** políticas puras retornam `fail` para título fora de Conventional Commits, descrição vazia/com placeholders principais, PR para `main` cuja origem não seja `development`, promoção `development` → `main` sem homologação/impacto/rollback e inclusão de `dist/` ou `coverage/`.
- **AC2.2:** políticas retornam `warn`, sem bloquear, para PR grande, alteração comportamental sem teste aparente e arquivos sensíveis sem contexto.
- **AC2.3:** testes cobrem resultados positivos e negativos das políticas sem exigir arquivo de teste para toda mudança.
- **AC2.4:** Danger comenta ou atualiza o PR e falha somente quando houver resultados `fail`.

### R3 — revisão por IA

- **AC3.1:** instruções priorizam traversal, links, archives, command injection, JSON estruturado, dados externos, SemVer/ref, secrets, testes e fronteiras arquiteturais; excluem estilo/Biome e abstrações especulativas.
- **AC3.2:** PR-Agent roda apenas em PRs não draft e não originados de forks, nos eventos definidos, sem executar código do PR.
- **AC3.3:** a revisão é advisory e falhas da integração não bloqueiam o pull request.
- **AC3.4:** permissões são mínimas, não há `pull_request_target` nem token pessoal, e os secrets necessários ficam documentados.

### R4 — segurança e operação dos workflows

- **AC4.1:** todos os workflows novos têm `permissions` mínimas, `concurrency` e `timeout-minutes`.
- **AC4.2:** referências a GitHub Actions de terceiros são fixadas por SHA completo com comentário de versão.
- **AC4.3:** YAML e metadados de actions são validados com ferramentas disponíveis; limitações locais são registradas sem resultados inventados.

## Fora de escopo

CodeQL, Dependabot, cobertura, workflows reutilizáveis, alteração funcional da CLI e verificação independente final.
