# WhatsApp — Meta Cloud API

## Fluxo

- **Conexão:** wizard chama `meta-whatsapp-connect` (grava `organization_integrations` + cria `communication_endpoints` por número). `meta-whatsapp-verify` valida token. `meta-wa-diagnose` para troubleshooting.
- **Envio:** `meta-whatsapp-send` (chamado por `dispatchWhatsAppSend` em `_shared/`). Precedência de endpoints ONLINE (memory `integrations/whatsapp-outbound-number-prioritization`).
- **Recebimento:** webhook `meta-whatsapp-webhook` — verify token (`GET`) + eventos (`POST`). Deduplica em `integration_inbound_events`. Cria contact/thread/message; captura referral CTWA (memory `integrations/whatsapp-ctwa-referral-capture`). Cross-org routing por WABA id (memory `integrations/twilio-whatsapp-cross-org-routing`).
- **Templates:** `meta-whatsapp-templates-sync` (poll Meta), `meta-whatsapp-templates-create` (criação). Metadata JSONB para render (memory `whatsapp/template-metadata-extraction`).
- **Desconexão:** `meta-whatsapp-disconnect`.

## Env vars

`META_APP_ID`, `META_APP_SECRET`, `META_VERIFY_TOKEN`, `META_GRAPH_VERSION` (via `_shared/meta-token.ts`/`meta-graph.ts`).

## Tabelas

Escreve: `organization_integrations`, `communication_endpoints`, `whatsapp_templates`, `whatsapp_template_actions`, `messages`, `message_threads`, `contacts`, `integration_inbound_events`, `capi_event_log` (via CAPI).

## UI

`src/components/integrations/meta-whatsapp-cloud/` — dialog de conexão, adição de números, migração de endpoint. Settings em `WhatsAppInboundSettings.tsx`, `MetaAdditionalEndpointsSection.tsx`.

## Observações

- Railway hospeda ingestão/sanitização de mensagens de saída (memory `architecture/whatsapp-railway-migration-v2`). Edge functions cuidam de templates + connect.
- Templates: admin-only (memory `whatsapp/template-management-system-v3`).
- Cutover Inbox v2 pendente (memory `features/inbox-v2/status-2026-06-11`).
