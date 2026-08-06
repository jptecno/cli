# Contrato futuro de integridade de templates

## Objetivo

Esta especificação define a evolução futura do catálogo de templates para vincular cada versão a um commit Git e ao SHA-256 exato do archive baixado. Ela ainda **não altera** o schema aceito pela CLI, não calcula digests e não muda a URL de download.

O objetivo é impedir que a mesma tag SemVer produza conteúdo diferente após a publicação e permitir que a CLI detecte corrupção, substituição ou retargeting do archive antes de extraí-lo.

## Campos propostos

Cada entrada de template do próximo schema do registry deverá incluir os campos abaixo, além dos campos existentes.

| Campo | Tipo/formato | Semântica |
| --- | --- | --- |
| `commit` | string hexadecimal minúscula com 40 caracteres | SHA-1 do commit Git que a tag `ref` deve apontar no repositório informado. |
| `archiveSha256` | string hexadecimal minúscula com 64 caracteres | SHA-256 dos bytes brutos do archive `.tar.gz` servido para aquele repositório e commit. |

Exemplo futuro, apenas ilustrativo:

```json
{
  "id": "api-nodejs-typescript",
  "version": "v0.2.0",
  "ref": "v0.2.0",
  "commit": "0123456789abcdef0123456789abcdef01234567",
  "archiveSha256": "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"
}
```

`ref` continuará sendo a tag SemVer exibida ao usuário. O download deverá usar `commit`, não `ref`, para que uma eventual alteração posterior da tag não modifique os bytes buscados pela CLI.

## Validações futuras

Quando o contrato for implementado, a CLI deverá:

1. Exigir `commit` e `archiveSha256` juntos em cada entrada do schema novo; a presença de somente um deles é inválida.
2. Validar os formatos estritos: `commit` com `^[0-9a-f]{40}$` e `archiveSha256` com `^[0-9a-f]{64}$`.
3. Resolver ou verificar na publicação do registry que `ref` aponta para `commit`; uma tag retargetada deve falhar na validação do pipeline do registry.
4. Montar a URL codeload com o `commit` validado.
5. Calcular SHA-256 sobre os bytes brutos recebidos, antes de gravar ou extrair o archive.
6. Comparar o digest calculado com `archiveSha256` com comparação de tamanho fixo e resistente a timing, após validar previamente o formato hexadecimal.
7. Interromper a criação do projeto e remover o arquivo temporário se o digest divergir, sem extrair nenhum conteúdo.
8. Exibir erro em PT-BR que identifique o template e informe falha de integridade, sem imprimir URL autenticada, conteúdo do archive ou valores de segredo.

O digest é do payload HTTP bruto. Ele não deve ser calculado sobre arquivos extraídos, conteúdo descompactado ou uma recompactação local, pois esses formatos podem variar sem representar os mesmos bytes baixados.

## Migração proposta

1. **Publicador/registry:** para cada release de template, resolve a tag para o commit completo, baixa uma vez o archive codeload desse commit, calcula `archiveSha256` e registra ambos os valores. O processo deve falhar se uma tag não resolver para o commit esperado.
2. **Schema:** publica uma nova versão do schema do registry que torna os dois campos obrigatórios. Entradas novas não devem ser aceitas sem o par completo.
3. **CLI:** adiciona suporte explícito ao schema novo, preservando temporariamente a leitura do schema atual para os catálogos existentes. A escolha do schema deve ser inequívoca; não inferir integridade pela mera presença opcional de campos.
4. **Adoção:** atualiza todos os templates publicados e o registry público para o schema novo. A CI deve testar um caso válido, commit inválido, digest malformado e digest divergente.
5. **Encerramento:** após o período de compatibilidade definido em release futura, remove o suporte ao schema antigo em uma alteração versionada e comunicada como incompatível.

## Critérios de aceite para a implementação futura

- Um registry com os dois campos válidos permite materializar um archive cujo SHA-256 corresponda ao declarado.
- Commit malformado, digest malformado, campos incompletos ou duplicidade de IDs são rejeitados no parse do registry.
- Um digest divergente impede extração, renderização e execução de comandos pós-criação.
- Um erro de download continua distinto de uma falha de integridade.
- A suíte cobre a compatibilidade planejada entre schemas durante a migração e a remoção posterior do schema antigo.

## Decisões pendentes

- Confirmar se os repositórios de template permanecerão em SHA-1 de 40 caracteres; caso GitHub disponibilize identificadores de outro tamanho, o schema deverá versionar essa mudança em vez de aceitar formatos frouxos.
- Definir a duração do período de compatibilidade do schema atual e a versão SemVer da CLI que o removerá.
- Definir se o pipeline do registry também assinará o próprio arquivo do registry; `archiveSha256` protege o archive, não a autenticidade do catálogo obtido por HTTPS.
