# PR-Agent

O workflow `ai-review.yml` executa uma revisão advisory em pull requests internos que não sejam draft. Ele não faz checkout nem executa código do pull request; falhas do provedor ou do modelo não bloqueiam o merge.

## Configuração necessária

Crie o secret de Actions `OPENAI_KEY` com uma chave dedicada, de menor privilégio possível, no repositório ou na organização. O acesso ao GitHub usa somente o `github.token` efêmero fornecido ao workflow; não configure token pessoal.

Forks são ignorados para que secrets não sejam expostos. As instruções versionadas em `.pr_agent.toml` limitam a revisão aos riscos e às fronteiras arquiteturais relevantes para a CLI.
