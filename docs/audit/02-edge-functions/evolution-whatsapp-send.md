# evolution-whatsapp-send

Path: `supabase/functions/evolution-whatsapp-send/index.ts`

Adicionado após o congelamento da auditoria (2026-07-04). Documentação canônica: [`docs/integrations/evolution-api/PRODUCTION_READY_AUDIT.md`](../../integrations/evolution-api/PRODUCTION_READY_AUDIT.md).

## Gatilho
- Chamada do dispatcher compartilhado (`src/lib/dispatchWhatsAppSend.ts` / `_shared/dispatch-whatsapp-send.ts`) para envio outbound via Evolution API (Baileys).

## Tabelas — LEITURA
- `communication_endpoints`
- `evolution_instances`
- `message_threads`
- `messages` (dedupe / quoted lookup)
- `feature_flags`

## Tabelas — ESCRITA
- `messages` (insert outbound, updates de `whatsapp_status`, `whatsapp_message_sid`)
- `message_threads` (update de `last_message_*`)

## APIs externas
- Evolution API (Baileys) — `/message/sendText`, `/message/sendMedia`, `/message/sendWhatsAppAudio`, `/message/sendSticker`.

## Observações
- Feature flag `evolution_api_enabled` obrigatória (piloto Viagi).
- Templates aprovados Meta são bloqueados com `400 templates_not_supported_on_evolution`.
- Rate-limit in-memory por isolate (60 req/60s por caller).

> **Regra de roteamento (2026-07-22):** a função honra o `endpointId` explícito enviado pelo dispatcher após validar `organization_id`, `provider = evolution_api` e `is_active`. Fallback a `thread.primary_endpoint_id` só ocorre quando o payload não traz `endpointId`. Log `line_routing_honored` (info) quando o endpoint efetivo diverge do primary da thread. Racional em [`docs/plans/2026-07-endpoint-lines-rotation.md`](../../plans/2026-07-endpoint-lines-rotation.md).
