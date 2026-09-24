# E2E V2 — diagnóstico do preview (request `a699c424-786f-4122-8537-4f670afc728b`)

Nada foi alterado nem enviado. Status do request: preparado, sem `provider_operation_id`, `sent_at` nulo.

## 1. Dados no CRM (contato `c90e9e78…`, Joao Teste)

| Campo | Valor no CRM |
|---|---|
| address_street | Rua teste (address_number vazio) |
| address_neighborhood | Bairro Teste |
| address_city | Cidade Teste |
| address_state | SP |
| address_zip | 12345600 |

Os dados existem. O caso A está descartado.

## 2–3. Mapa CRM → chave Seialz → variável do template → valor final

| CRM | Chave gerada no snapshot (`variables.custom`) | Variável do template | Valor final no snapshot |
|---|---|---|---|
| address_street | `address_street` = "Rua teste" | `Custom.Endereco` | `[Custom.Endereco]` literal |
| address_neighborhood | `address_neighborhood` = "Bairro Teste" | `Custom.Bairro` | `[Custom.Bairro]` literal |
| address_city | `address_city` = "Cidade Teste" | `Custom.Cidade` | `[Custom.Cidade]` literal |
| address_state | `address_state` = "SP" | `Custom.Estado` | `[Custom.Estado]` literal |
| address_zip | `address_zip` = "12345600" | `Custom.CEP` | `[Custom.CEP]` literal |

`frozen_content` contém exatamente 10 placeholders não resolvidos: esses 5, nas páginas 1 e 2.

## 4. Caso: B

`applyVariables` (`_shared/suvsign-v2.ts`, linha 117) só substitui `[Custom.<chave>]` quando a chave existe em `custom`. Hoje o `prepare_contract` (`signature-requests/index.ts`, linhas 186–189) grava as chaves com os nomes das colunas do CRM (`address_street`, `address_zip`…). Já o template usa `Endereco`, `Bairro`, `Cidade`, `Estado` e `CEP`. Por isso nenhuma das cinco chaves bate e os placeholders ficam no texto. Nome, CPF e e-mail foram resolvidos porque o template usa variáveis que batem com as chaves geradas.

## 5. Por que a validação deixou passar

- `missing_contact_fields` (linhas 182–184) só confere se o CRM tem os dados. Esses dados existem, então a checagem passa.
- Depois da substituição, nada verifica se sobrou algum `[Custom.*]`, `[Client.*]`, `[Contact.*]` ou `[Deal.*]` no `frozen_content`. O snapshot é congelado mesmo com placeholders.

## Correção proposta (aguardando aprovação; não aplicada)

1. No `prepare_contract`, incluir em `custom` os apelidos que o template usa:
   - `Endereco` = rua (e número, se houver);
   - `Bairro`, `Cidade`, `Estado`;
   - `CEP` = 8 dígitos formatados como 00000-000.

   As chaves atuais continuam iguais.
2. Depois de `applyVariables`, bloquear a preparação quando sobrar placeholder no conteúdo. A resposta seria 422 `unresolved_template_variables`, com a lista de variáveis, e nenhum snapshot seria gravado.
3. Descartar o request `a699c424…` (nunca enviado) e preparar de novo pelo mesmo botão V2. Conferir no preview que os 5 campos aparecem preenchidos antes de enviar.

Template, SuvSign, V1 e Nammux não mudam, e não há fallback para V1.

`CAUSA IDENTIFICADA — o Seialz grava o endereço com chaves do CRM (address_street, address_neighborhood, address_city, address_state, address_zip), mas o template espera Custom.Endereco/Bairro/Cidade/Estado/CEP; não há checagem de placeholders não resolvidos antes de congelar o snapshot`
