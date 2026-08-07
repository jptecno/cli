# Backlog do CLI

Este arquivo registra somente evoluções futuras, fora do escopo do plano atual em [`docs/hardening-plan.md`](docs/hardening-plan.md). Os itens não são compromissos de prazo nem autorização para ampliar os PRs de hardening.

## Itens futuros

1. **Geração de templates a partir de bases**
   Permitir compor ou gerar templates a partir de bases reutilizáveis, depois que o contrato atual de registry, manifesto e toolchain estiver estabilizado.

2. **Validação profunda de manifests de cada ecosystem (evoluir C → B)**
   Inspecionar semanticamente arquivos nativos dos projetos gerados — por exemplo, manifests de dependências e scripts — além da validação estrutural e da allowlist do `template.json`.

3. **Novos ecosystems conforme templates**
   Adicionar ecosystems somente quando existir template real, mantenedor e matriz de comandos/requisitos testável; não ampliar allowlists de forma especulativa.

4. **Paralelização**
   Avaliar execução paralela de steps independentes preservando determinismo, logs compreensíveis, propagação de falhas e limites de recursos.

5. **Registry local público**
   Projetar uma modalidade pública de registry local sem enfraquecer autenticação, integridade, proteção contra rollback ou as restrições atuais de transporte.

6. **Log de transparência / Sigstore**
   Avaliar transparência pública, proveniência e Sigstore como complemento à assinatura Ed25519 e ao keyring embutido.

7. **Seleção múltipla interativa**
   Permitir escolher múltiplos itens em fluxos que venham a justificar isso, sem alterar o selector simples do ciclo atual.

8. **Keyring dinâmico**
   Implementar atualização/rotação dinâmica do keyring com uma cadeia de confiança verificável, política de expiração e recuperação segura.

9. **Repositório central de harness**
   Extrair e distribuir o harness determinístico compartilhado entre repositórios, mantendo versionamento, atualização controlada e políticas locais explícitas.

## Regra de promoção

Um item só sai deste backlog após ter caso de uso concreto, decisões de segurança registradas, dependências cross-repo identificadas, critérios de aceite e plano de rollout/rollback próprios. Até lá, ele não deve ser incluído nos PRs do plano de hardening atual.
