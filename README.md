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
--registry <url>      Sobrescreve a URL do registry.
--no-git              Não executa git init.
--no-install          Não executa npm install nem npm run check.
--no-validate         Não executa npm run check.
```

Exemplo não interativo:

```sh
npx @jptecno/cli init billing-api \
  --template api-nodejs-typescript \
  --set projectName=billing-api \
  --set 'description=API de faturamento'
```

Por padrão, o CLI lê o catálogo público em `jptecno/template-registry`, baixa o archive GitHub da tag imutável declarada e executa `git init`, `npm install` e `npm run check` no projeto gerado.

## Segurança

O CLI valida o catálogo e o manifesto do template antes de usá-los. Os únicos comandos pós-criação aceitos neste MVP são `npm install` e `npm run check`, controlados pelo próprio CLI; templates não podem fornecer comandos arbitrários para execução pelo manifesto.

Atenção: quando habilitado, `npm install` executa os lifecycle scripts definidos no `package.json` do template (por exemplo, `preinstall`, `install` e `postinstall`). Este comportamento é inerente ao npm e, por enquanto, o CLI não usa `--ignore-scripts`. Use somente templates confiáveis e revise seus arquivos antes de instalar dependências.
