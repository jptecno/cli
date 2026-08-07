# Melhorias futuras do harness

Este documento registra limitações conhecidas e evoluções que não devem ser tratadas como garantias já implementadas.

## Contexto atual

O projeto possui um único mantenedor. Por isso, o ruleset não exige aprovação humana nem code owner review: o autor não pode aprovar o próprio pull request. Alterações sensíveis usam a label `harness-change-approved` como confirmação manual em duas etapas, além dos checks obrigatórios `check`, `Semgrep CE` e `Danger JS`.

A label reduz o risco de uma alteração acidental feita por agente, mas não equivale a revisão independente e não protege contra um mantenedor malicioso ou uma conta comprometida.

## Limitações aceitas

### Interpretação de comandos shell

O gate classifica invocações literais conhecidas e pede confirmação para construções dinâmicas. Ele não executa o comando nem interpreta integralmente Bash ou PowerShell. Indireções arbitrárias, código gerado em runtime e ferramentas desconhecidas não podem ser provados seguros por uma análise textual.

O hook complementa, mas não substitui:

- permissões nativas do agente;
- sandbox do ambiente;
- pre-commit com Lefthook;
- checks obrigatórios da CI;
- proteção das branches permanentes;
- revisão consciente do diff.

### Timeout de hooks

Claude Code trata timeout ou falha de hook como erro não bloqueante em vários eventos. O timeout do gate foi ampliado e operações críticas também usam `permissions.ask`, mas não existe garantia fail-closed absoluta quando o runtime do agente deixa de executar o hook.

### Feedback pós-edição

O feedback rápido observa `Edit`, `Write` e `NotebookEdit` e valida apenas extensões suportadas pelo Biome. Alterações feitas por shell, geradores ou ferramentas externas podem receber feedback somente no pre-commit ou na CI. Executar a suíte completa após toda operação seria desproporcional ao custo.

## Backlog

1. Adicionar um segundo mantenedor ou equipe e então habilitar `required_approving_review_count`, code owner review e aprovação do último push.
2. Avaliar um GitHub App ou serviço externo com política imutável fora do repositório para revisar mudanças no próprio harness.
3. Substituir a classificação shell local por parser mantido e multiplataforma quando houver uma biblioteca estável que cubra Bash e PowerShell sem ampliar excessivamente a superfície de dependências.
4. Adicionar execução de testes dos hooks em Windows para validar volumes distintos, symlinks e sintaxe PowerShell em ambiente real.
5. Avaliar feedback incremental para Markdown e YAML sem tornar cada edição lenta.
6. Configurar MCP apenas quando existir caso de uso concreto, com credenciais exclusivamente por variáveis de ambiente e permissões mínimas.
7. Revisar periodicamente os comandos administrativos cobertos pelo gate conforme Git, GitHub CLI e npm adicionarem novos subcomandos.
