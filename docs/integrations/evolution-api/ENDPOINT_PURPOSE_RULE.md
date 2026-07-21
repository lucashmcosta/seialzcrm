# Regra: `purpose` de endpoints Evolution API

Data: 2026-07-21
Contexto: incidente `evairferreiradesouza11` / 22 threads sumidas em `/messages`

## Regra

Todo `communication_endpoints` com `provider='evolution_api'` **deve** nascer
com `purpose` explicitamente definido conforme a finalidade operacional da
linha:

| Finalidade da linha        | `purpose` obrigatório  |
| -------------------------- | ---------------------- |
| Vendas / comercial         | `commercial`           |
| Atendimento / pós-venda    | `customer_service`     |
| Linha pessoal de vendedor  | `vendor_personal`      |

**Nunca** usar `other` como default silencioso.

## Motivo

O trigger `fn_message_threads_autofill_business_context` mapeia:

- `commercial` → `business_context = 'sales'` (aparece em `/messages`)
- `customer_service` / `support` → `business_context = 'customer_service'` (aparece em `/inbox`)
- **qualquer outro valor não-nulo** → `business_context = 'other'`

Threads com `business_context='other'` são invisíveis tanto em `/messages`
(RPC `rpc_list_message_threads` exige `sales` ou NULL) quanto em `/inbox`,
ficando em limbo. Foi exatamente o que aconteceu com o endpoint
`11111111-e701-4a01-8000-000000000001` (dev-int / Viagi) criado manualmente
na Fase 5 do piloto com `purpose='other'`.

## Como aplicar

- **Criação por SQL manual/admin**: setar `purpose` no INSERT.
- **Futura UI de provisionamento** (`/admin/evolution` ou similar): campo
  obrigatório de escolha entre `commercial | customer_service | vendor_personal`,
  sem default para `other`.
- **Edge functions** (`evolution-instance-manager` e correlatas): hoje não
  criam endpoints (documentado nas linhas 12 e 253-256 do
  `evolution-instance-manager/index.ts`). Se essa responsabilidade for movida
  para código no futuro, o parâmetro `purpose` deve ser obrigatório na entrada
  e validado contra a lista acima antes do INSERT.

## Precedentes

- Twilio e Meta Cloud API seguem a mesma regra: endpoints comerciais nascem
  com `purpose='commercial'`; endpoints de atendimento com `purpose='customer_service'`.
- A separação entre `provider` (tecnologia de transporte) e `purpose`
  (finalidade de negócio) é intencional — provider Evolution pode ser usado
  para vendas OU atendimento, e não deve ser inferido automaticamente pelo
  trigger.
