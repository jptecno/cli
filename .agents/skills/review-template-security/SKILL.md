---
name: review-template-security
description: Use quando uma alteração afetar registry, manifests, download, archives, renderização, caminhos ou comandos de templates para revisar segurança e testes de regressão.
---

# Revisar segurança de templates

Execute uma revisão baseada em evidências das fronteiras que tratam templates como dados externos não confiáveis.

## Preparação

1. Leia `AGENTS.md` e trate suas regras de segurança como critérios obrigatórios.
2. Inspecione o diff e identifique os fluxos afetados antes de sugerir alterações.
3. Comece em modo somente leitura. Só modifique arquivos quando o usuário pedir explicitamente uma correção.
4. Restrinja a revisão a registry, manifests, download, archives, renderização, paths e execução pós-criação relacionados ao diff.

## Procedimento

1. Identifique cada entrada externa e confirme que ela é validada na borda antes de chegar à aplicação.
2. Confirme que dados externos são tratados como `unknown` e refinados sem uso de `any`.
3. Verifique o schema do registry e do `template.json`, incluindo campos obrigatórios e valores inesperados.
4. Confirme que templates usam tags SemVer imutáveis e que `version` e `ref` são iguais.
5. Verifique se extração e renderização impedem path traversal e escrita fora do diretório de destino.
6. Confirme que links simbólicos são rejeitados antes que possam escapar do destino.
7. Para JSON, confirme que valores são aplicados de forma estruturada e serializados como JSON válido, sem permitir alteração da estrutura.
8. Confirme que registry, manifesto e variáveis não controlam comandos arbitrários. Os únicos comandos permitidos no MVP são os definidos em `AGENTS.md`.
9. Verifique se erros e logs evitam tokens, URLs autenticadas e outros dados sensíveis.
10. Avalie o comportamento de `npm install` sem presumir `--ignore-scripts`; considere os lifecycle scripts do template no risco informado ao usuário.
11. Localize testes existentes antes de declarar ausência de cobertura. Para cada falha encontrada, indique o teste de regressão necessário.

## Validação

Quando houver correções autorizadas:

1. execute primeiro os testes específicos do fluxo alterado;
2. execute `npm run check` antes de concluir;
3. não enfraqueça, remova ou ignore testes para obter sucesso.

## Formato da resposta

Apresente:

1. achados em ordem de severidade;
2. arquivo, símbolo ou trecho que sustenta cada achado;
3. cenário de exploração ou falha observável;
4. correção mínima recomendada;
5. cobertura existente e testes de regressão ausentes;
6. comandos executados e respectivos resultados;
7. riscos residuais ou pontos que não puderam ser verificados.

Se não houver achados, declare isso explicitamente e ainda informe o escopo e as validações realizadas. Não invente vulnerabilidades sem evidência no código.
