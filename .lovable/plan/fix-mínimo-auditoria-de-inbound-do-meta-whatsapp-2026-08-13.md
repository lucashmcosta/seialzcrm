# Fix mínimo: auditoria de inbound do Meta WhatsApp

## Problema confirmado (Etapa B)

O webhook `meta-whatsapp-webhook` falha em **toda** gravação de auditoria em
`integration_inbound_events` com erro `22P02`, por dois campos com tipo incompatível:

| Campo enviado | Valor atual | Tipo real da coluna |
|---|---|---|
| `parser_version` | `"v1"` (string) | `integer` |
| `correlation_id` | `params.contextId` (ex.: `wamid...`) | `uuid` |

Resultado: cada inbound perde a linha de auditoria (log `audit_insert_error`). O webhook
segue funcionando porque a auditoria é best-effort — não há perda de mensagem.

Este bug é **anterior** à Etapa A/A.1 e não tem relação com o gate canônico
(`evolution-webhook` já envia `parser_version: 1`, correto; é o único outro call site).

## Correção proposta (escopo mínimo)

Somente `supabase/functions/meta-whatsapp-webhook/index.ts`, no bloco de insert de auditoria:

1. `parser_version: "v1"` → `parser_version: 1` (alinha com o padrão já usado no Evolution).
2. `correlation_id: params.contextId ?? null` → `correlation_id: null`, e preservar o valor
   original dentro de `raw_headers` como `context_id: params.contextId ?? null`
   (nenhuma informação é perdida; `raw_headers` é JSONB).

Nada mais é alterado: sem mudança de schema, sem migração, sem tocar no gate
`salesCanonicalPathEnabled`, no helper `sales-thread.ts`, no outbound, no Atendimento
ou em qualquer flag.

## Validação

- `deno check` no `meta-whatsapp-webhook`.
- Deploy apenas dessa função.
- Após o próximo inbound real do Meta: confirmar zero `audit_insert_error` nos logs e
  confirmar linhas novas em `integration_inbound_events` (contagem antes/depois).
- Reconfirmar: flag `conv_route_resolver_v2` OFF, 0 organizações, caminho legacy,
  zero `SALES_THREAD_*` nos logs.

## Fora de escopo (permanece parado)

- Trigger `trg_zz_guard_sales_thread_canonical`.
- Índice unique parcial de Comercial.
- Habilitar `conv_route_resolver_v2` para a Viagi.
- Fase 3.
