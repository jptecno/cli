# Validação — revisão automatizada

**Data:** 2026-08-06
**Spec:** `.specs/features/automated-code-review/spec.md`
**Diff:** `0e85cf0..d355a3e`
**Verificador:** passagem fresh-eyes local, sem subagente por solicitação do usuário

## Resultado

**PASS:** os critérios do lote estão implementados e os gates disponíveis passaram.

| Critério | Evidência | Resultado |
| --- | --- | --- |
| AC1.1–AC1.2 | `.semgrep/rules/*.test.*`; `semgrep --test` 3/3; scan CE 1.172.0 com `SEMGREP_SEND_METRICS=off`, 0 findings | PASS |
| AC1.3–AC1.4 | `.github/workflows/static-analysis.yml`: SARIF para reviewdog, status preservado, fork sem publicação e Actions por SHA | PASS |
| AC2.1 | `tests/scripts/pr-policies.test.ts:44-94`: assertions específicas para título, resumo, origem de `main`, promoção e artefatos | PASS |
| AC2.2–AC2.3 | `tests/scripts/pr-policies.test.ts:95-155`: warnings de tamanho, teste aparente e arquivo sensível sem transformar heurísticas em failures | PASS |
| AC2.4 | `dangerfile.ts`: somente `results.failures` chama `fail`; warnings chamam `warn`; workflow usa revisão base confiável | PASS |
| AC3.1 | `.pr_agent.toml`: riscos do CLI priorizados e estilo/abstrações especulativas excluídos | PASS |
| AC3.2–AC3.4 | `.github/workflows/ai-review.yml`: draft/fork ignorados, sem checkout, `continue-on-error`, permissões mínimas; secret documentado em `.github/pr-agent.md` | PASS |
| AC4.1–AC4.3 | Todos os workflows novos têm permissões, concurrency e timeout; `actionlint` 1.7.7 passou; Actions por SHA | PASS |

## Gates executados

- `npm --prefix .worktrees/automated-review ci`: passou; npm reportou 2 vulnerabilidades transitivas (1 moderada, 1 alta).
- Teste Danger específico: 9/9 passou.
- `npm --prefix .worktrees/automated-review run check`: passou; 7 arquivos e 39 testes, lint, typecheck e build.
- Semgrep CE 1.172.0: fixtures 3/3; scan real com 3 regras e 0 findings.
- `actionlint` 1.7.7 em `.github/workflows/*.yml`: passou sem findings.
- Parser TOML (`tomllib`) e parser YAML (Ruby Psych): passaram.

## Sensor de discriminação

Em worktree temporário descartável, a condição que reprova título não convencional foi substituída por `false`. O teste `tests/scripts/pr-policies.test.ts:49-51` falhou na assertion `expect(...failures).toContain('Use um título no formato Conventional Commits.')`.

**Resultado:** 1/1 mutação eliminada. O worktree temporário foi removido.

## Limitações

- Os workflows não foram disparados em um pull request real nesta máquina.
- A chamada externa ao modelo do PR-Agent não foi executada porque depende do secret `OPENAI_KEY` e gera uso do provedor.
- A instalação de `danger@13.0.10` trouxe vulnerabilidades transitivas reportadas pelo `npm ci`; não foi aplicado `npm audit fix --force` porque isso introduziria mudanças fora do escopo e potencialmente incompatíveis.
