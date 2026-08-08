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

Para consultar outro catálogo:

```sh
npx @jptecno/cli template list --registry https://exemplo.com/registry.json
```

### Opções

```text
jp init <diretório> [opções]
jp template list [--registry <url>]

--template <id>       Seleciona o template sem abrir o seletor.
--set chave=valor     Define uma variável do template. Pode ser repetido.
--registry <url>      Sobrescreve a URL do registry (exige https).
--no-git              Não executa git init.
--install             Executa somente npm install após criar o projeto.
--no-install          Não executa npm install.
--validate            Executa as validações declaradas pelo template.
--help, -h            Mostra a ajuda e sai com código 0.
--version, -v         Mostra a versão instalada e sai com código 0.
```

Executar `jp` sem argumentos também mostra a ajuda e sai com código 0. Um argumento desconhecido é um erro (código de saída 1) e a mensagem sugere `jp --help`.

O `--registry` deve usar `https://`; o CLI rejeita `http://`, `file://` e URLs malformadas. Ao informar um registry diferente do padrão, o CLI avisa em stderr que um registry de terceiros controla qual código é baixado e executado.

Exemplo não interativo:

```sh
npx @jptecno/cli init billing-api \
  --template api-nodejs-typescript \
  --set projectName=billing-api \
  --set 'description=API de faturamento'
```

Por padrão, o CLI lê o catálogo público em `jptecno/template-registry`, baixa o archive GitHub da tag imutável declarada e executa `git init` no projeto gerado. Em um terminal interativo, pergunta sobre cada etapa de toolchain declarada pelo template, usando a recomendação do manifesto como padrão. Com entrada ou saída não interativa, não inspeciona nem executa etapas automaticamente.

Use `--install` para executar somente `npm install`. Use `--validate` para solicitar apenas as validações declaradas (`formatCheck`, `lint`, `typecheck`, `test` e `build`), sem executar a instalação. `--no-install` impede a instalação; combinado a `--validate`, etapas que dependem da instalação são ignoradas e a execução falha se uma validação solicitada não puder ser concluída. `--install` não pode ser combinado com `--no-install` nem com `--validate`. `--no-git` é independente dessas opções.

## Segurança

O CLI valida o catálogo e o manifesto do template antes de usá-los. Os únicos comandos pós-criação aceitos neste MVP são `git init`, `npm install` e as validações npm estritamente permitidas e declaradas no manifesto; a aplicação os executa diretamente, sem shell. Templates não podem fornecer comandos arbitrários.

Atenção: quando habilitado, `npm install` executa os lifecycle scripts definidos no `package.json` do template (por exemplo, `preinstall`, `install` e `postinstall`). Este comportamento é inerente ao npm e, por enquanto, o CLI não usa `--ignore-scripts`. Use somente templates confiáveis e revise seus arquivos antes de instalar dependências.
