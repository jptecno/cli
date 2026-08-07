---
description: Regras obrigatórias ao alterar download, validação, extração ou renderização de templates.
applyTo: "src/application/create-project.ts,src/application/parse-template-*.ts,src/adapters/github-*.ts,src/adapters/process-command-executor.ts,tests/application/create-project.test.ts,tests/application/parse-template-*.test.ts,tests/adapters/github-*.test.ts,tests/adapters/process-command-executor.test.ts"
---

# Segurança de templates

Leia e siga `AGENTS.md`. Para os arquivos deste escopo, estas condições são inegociáveis:

- trate registry, manifests, respostas de rede e archives como dados externos não confiáveis;
- modele entradas externas como `unknown` e valide o schema antes do uso;
- aceite apenas tags SemVer imutáveis e exija igualdade entre `version` e `ref`;
- impeça path traversal, escrita fora do destino e links simbólicos;
- renderize JSON de forma estruturada e preserve um documento válido;
- não permita que dados do template definam comandos arbitrários;
- não exponha tokens, URLs autenticadas ou dados sensíveis em erros e logs;
- adicione testes de regressão para falhas de validação, paths, archives, renderização ou execução.

Quando a alteração abranger esse fluxo, carregue também a skill `review-template-security` em `.agents/skills/review-template-security/SKILL.md`.
