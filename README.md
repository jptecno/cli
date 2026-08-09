# @jptecno/cli

CLI para criar projetos padronizados a partir dos templates da JP Tecno.

## Uso

```sh
npx @jptecno/cli init billing-api
```

Quando `--template` não é informado em um terminal interativo, o comando apresenta um menu navegável. Use `↑` e `↓` para escolher um template e `Enter` para confirmar. Use `Ctrl+C` ou `Esc` para cancelar.

Em scripts, pipes ou CI, informe `--template <id>` para evitar uma seleção interativa.

### Listar templates

```sh
npx @jptecno/cli template list
```

O CLI consulta exclusivamente o catálogo oficial publicado em `https://jptecno.github.io/template-registry/registry.json` e sua assinatura derivada `.sig`. Não há suporte a catálogos alternativos.

### Opções

```text
jp init <diretório> [opções]
jp template list [--allow-stale-registry]

--template <id>                  Seleciona o template sem abrir o seletor.
--set chave=valor                Define uma variável do template. Pode ser repetido.
--no-git                         Não executa git init.
--install                        Executa somente npm install após criar o projeto.
--no-install                     Não executa npm install.
--validate                       Executa as validações declaradas pelo template.
--allow-stale-registry           Autoriza usar o catálogo assinado desatualizado sem prompt.
--allow-stale-template-creation  Autoriza criar projeto com catálogo desatualizado sem prompt (somente init).
--help, -h                       Mostra a ajuda e sai com código 0.
--version, -v                    Mostra a versão instalada e sai com código 0.
```

Executar `jp` sem argumentos também mostra a ajuda e sai com código 0. Um argumento desconhecido é um erro (código de saída 1) e a mensagem sugere `jp --help`.

Em caso de indisponibilidade de rede, o CLI pode usar um snapshot assinado no cache local. Em modo não interativo, o uso de um catálogo expirado exige `--allow-stale-registry`. Para criar um projeto a partir desse catálogo, `jp init` exige também `--allow-stale-template-creation`. Em um terminal interativo, cada decisão é confirmada separadamente.

Exemplo não interativo:

```sh
npx @jptecno/cli init billing-api \
  --template api-nodejs-typescript \
  --set projectName=billing-api
```

Por padrão, o CLI lê o catálogo oficial assinado, baixa o archive GitHub do commit imutável declarado e executa `git init` no projeto gerado. Em um terminal interativo, pergunta sobre cada etapa de toolchain declarada pelo template, usando a recomendação do manifesto como padrão. Com entrada ou saída não interativa, não inspeciona nem executa etapas automaticamente.

Use `--install` para executar somente `npm install`. Use `--validate` para solicitar apenas as validações declaradas (`formatCheck`, `lint`, `typecheck`, `test` e `build`), sem executar a instalação. `--no-install` impede a instalação; combinado a `--validate`, etapas que dependem da instalação são ignoradas e a execução falha se uma validação solicitada não puder ser concluída. `--install` não pode ser combinado com `--no-install` nem com `--validate`. `--no-git` é independente dessas opções.

## Segurança

O catálogo só é aceito quando a assinatura Ed25519 corresponde aos bytes baixados e a uma chave pública oficial integrada ao CLI. O cache é segregado pela URL e pelo fingerprint determinístico do keyring, e mantém uma revisão máxima para bloquear rollback. O CLI valida também o manifesto do template antes de usá-lo. Os únicos comandos pós-criação aceitos neste MVP são `git init`, `npm install` e as validações npm estritamente permitidas e declaradas no manifesto; a aplicação os executa diretamente, sem shell. Templates não podem fornecer comandos arbitrários.

Atenção: quando habilitado, `npm install` executa os lifecycle scripts definidos no `package.json` do template (por exemplo, `preinstall`, `install` e `postinstall`). Este comportamento é inerente ao npm e, por enquanto, o CLI não usa `--ignore-scripts`. Use somente templates confiáveis e revise seus arquivos antes de instalar dependências.
