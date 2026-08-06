# Tarefas — revisão automatizada

## Plano

- [x] **T1 — especificar o lote:** criar requisitos, ACs e matriz de testes/gates. Gate: inspeção do diff.
- [x] **T2 — regras Semgrep:** adicionar regras locais e fixtures positivas/negativas; executar teste oficial do Semgrep CE com métricas desativadas. Depende de T1.
- [x] **T3 — workflow Semgrep/reviewdog:** publicar findings no diff, preservar falha bloqueante e degradar com segurança em forks. Depende de T2.
- [ ] **T4 — políticas Danger:** adicionar dependência, funções puras, integração Danger e testes dos outcomes; executar testes específicos e `npm run check`. Depende de T1.
- [ ] **T5 — workflow Danger:** executar políticas com comentário atualizável e bloqueio somente por `fail`. Depende de T4.
- [ ] **T6 — PR-Agent advisory:** adicionar instruções e workflow seguro, sem execução de código do PR. Depende de T1.
- [ ] **T7 — gates finais:** executar instalação limpa, testes específicos, check, Semgrep e validação dos workflows; corrigir somente regressões do lote e atualizar este status. Depende de T2–T6.

## Matriz de testes e gates

| Requisito        | Evidência planejada                                                                 | Gate                                                            |
| ---------------- | ----------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| AC1.1–AC1.2      | Fixtures Semgrep positivas/negativas para TypeScript e Actions                      | Comando oficial `semgrep --test` da versão fixada, métricas off |
| AC1.3–AC1.4, AC4 | Inspeção e lint de `static-analysis.yml`; execução local controlada quando possível | actionlint/YAML + Semgrep local                                 |
| AC2.1            | Testes unitários para cada política bloqueante e caminho aceito                     | Vitest específico                                               |
| AC2.2–AC2.3      | Testes unitários para warnings e ausência de warning em mudanças justificadas       | Vitest específico                                               |
| AC2.4, AC4       | Inspeção e lint de `pr-policy.yml`                                                  | actionlint/YAML + `npm run check`                               |
| AC3.1            | Revisão textual das instruções contra a lista explícita                             | Inspeção do diff                                                |
| AC3.2–AC3.4, AC4 | Inspeção e lint de `ai-review.yml`                                                  | actionlint/YAML                                                 |
| Todos            | Instalação reproduzível e ausência de regressão                                     | `npm ci`, testes específicos, `npm run check`                   |

## Comandos de gate

- **Rápido:** `npm test -- tests/<arquivo>.test.ts`
- **Completo:** `npm run check`
- **Semgrep:** comando oficial confirmado na documentação/CLI da versão adotada, com métricas desativadas.
- **Workflows:** `actionlint` se disponível; caso contrário, parser YAML disponível e inspeção das referências/actions.

> A verificação independente final não faz parte deste lote; será executada pelo orquestrador.
