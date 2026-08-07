---
name: validate-pull-request
description: Use antes de abrir ou atualizar um pull request para revisar escopo, arquitetura, segurança, testes, documentação e o preenchimento do template obrigatório.
---

# Validar pull request

Prepare uma avaliação objetiva da alteração atual sem criar commits, enviar branches ou abrir pull requests sem solicitação explícita.

## Preparação

1. Leia `AGENTS.md`, `.github/pull_request_template.md` e os arquivos alterados.
2. Inspecione o estado e o diff do Git sem descartar, sobrescrever ou formatar mudanças não relacionadas.
3. Identifique a branch base e o destino pretendido quando essa informação estiver disponível. Não presuma homologação ou aprovação que não possa verificar.

## Procedimento

1. Resuma o objetivo observável do diff e sinalize arquivos fora do escopo.
2. Conte arquivos e linhas alteradas. Para PR humano acima de 30 arquivos ou 500 linhas, recomende divisão; se a mudança for atomicamente indivisível, exija `Motivo para não dividir` e `Estratégia de revisão` na seção `Escopo e tamanho`. Autores com sufixo `[bot]` são isentos dessa justificativa.
3. Confirme que o trabalho não está sendo feito diretamente em `development` ou `main` e que o fluxo de worktree descrito em `AGENTS.md` foi respeitado quando isso puder ser verificado.
4. Verifique as fronteiras arquiteturais entre `src/application/`, `src/contracts/`, `src/adapters/` e `src/main.ts`.
5. Verifique argumentos e dados externos nas bordas, mensagens acionáveis em português brasileiro e ausência de dados sensíveis.
6. Quando a alteração envolver templates, execute também a skill `review-template-security`.
7. Relacione cada mudança de comportamento a testes observáveis. Procure os testes antes de declarar uma lacuna.
8. Confirme que documentação, exemplos da CLI e configuração foram atualizados quando o comportamento público mudou.
9. Execute testes específicos quando houver um alvo claro e, ao final, execute `npm run check`.
10. Execute `npm pack --dry-run` somente quando houver impacto em build, conteúdo publicado, binário, dependências de runtime ou publicação.
11. Compare as evidências com todas as seções aplicáveis de `.github/pull_request_template.md`.

## Restrições

- Não faça commit, push, merge, tag, release ou abertura de PR sem pedido explícito.
- Não use `npm version` nem publique o pacote.
- Não altere código apenas para deixar o diff esteticamente uniforme.
- Não declare CI, aprovação, homologação ou proteção de branch como aprovadas sem evidência.
- Não esconda falhas de validação; informe o comando e o erro relevante.

## Formato da resposta

Forneça:

1. **Veredito:** pronto, pronto com ressalvas ou não pronto;
2. **Bloqueios:** problemas que impedem o PR;
3. **Observações:** riscos e melhorias não bloqueantes;
4. **Validação:** comandos executados e resultados;
5. **Template do PR:** rascunho preenchido conforme `.github/pull_request_template.md`, sem alegar evidências inexistentes;
6. **Próximos passos:** somente ações ainda necessárias.
