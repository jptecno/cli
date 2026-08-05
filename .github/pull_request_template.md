## Resumo

<!-- Explique o problema e a alteração em poucas linhas. -->

## Alterações

-

## Comportamento e compatibilidade

<!-- Descreva mudanças observáveis, compatibilidade, deprecações ou escreva "Sem alteração". -->

## Camadas afetadas

- [ ] `src/application/`
- [ ] `src/contracts/`
- [ ] `src/adapters/`
- [ ] `src/main.ts`
- [ ] Configuração, CI ou documentação

## Interface da CLI

<!-- Obrigatório quando houver mudança de comando, argumento, saída ou erro. Remova esta seção quando não se aplicar. -->

```sh
# Exemplo de uso
```

```text
# Saída esperada ou mensagem de erro
```

## Configuração e segurança

<!-- Variáveis, permissões, registry, publicação, tokens ou impacto de segurança. Escreva "Sem impacto" se não se aplicar. -->

## Validação

- [ ] `npm run check`
- [ ] `npm pack --dry-run` quando houver impacto no pacote
- [ ] Outros comandos ou evidências:

## Homologação, release e produção

<!-- Obrigatório em PRs de development para main. Em PRs para development, escreva "Não se aplica". O Release Please calcula a versão a partir dos commits convencionais; não crie tags ou Release PRs manualmente. -->

- Ambiente de homologação e resultado:
- Impacto de produção:
- Próxima versão esperada (`fix` = patch, `feat` = minor, ou sem release):
- Plano de rollback:

## Checklist

- [ ] Branch derivada de `development` e trabalho realizado em worktree.
- [ ] Mudança revisada e sem credenciais, tokens ou dados sensíveis.
- [ ] Testes adicionados ou atualizados quando aplicável.
- [ ] Documentação atualizada quando a experiência de uso mudou.
- [ ] Para PRs de `development` para `main`, a Release PR e a PR automática de sincronização `main` → `development` foram consideradas no plano de promoção.
