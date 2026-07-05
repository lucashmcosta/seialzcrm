# WhatsApp — Meta Cloud API

**Referência técnica completa:** `docs/audit/04-integracoes/whatsapp-meta-cloud.md` e `docs/audit/02-edge-functions/meta-whatsapp-*`.

## Finalidade
Canal WhatsApp oficial via Meta Cloud API — envio, templates e recepção.

## Autenticação
- Credenciais por org em `organization_integrations` (JSONB cifrado via `_shared/crypto.ts`).
- Catálogo global em `admin_integrations` (App IDs).
- Onboarding: `meta-whatsapp-connect` (valida token/phone_number_id via `_shared/meta-graph.ts`), `meta-whatsapp-verify`.
- Desconectar: `meta-whatsapp-disconnect`.

## Webhooks
- Endpoint: edge function `meta-whatsapp-webhook`.
- Verificação Meta com `hub.verify_token`.
- Resolve org via `waba_id` → `communication_endpoints`.
- Cross-org routing: quando várias orgs compartilham WABA/phone_number_id — memory `integrations/twilio-whatsapp-cross-org-routing` (mesmo princípio).

## Envio
- `meta-whatsapp-send` — chamada por `dispatchWhatsAppSend`.
- Templates: `meta-whatsapp-templates-create`, `meta-whatsapp-templates-sync`.

## Diagnósticos
- `meta-wa-diagnose` — checagem de saúde da integração.
- Ver memories `integrations/twilio-whatsapp-configuration-and-diagnostics`, `whatsapp-outbound-number-prioritization`.

## Falhas comuns
- Token expirado → renovar em Settings → Integrations.
- Phone number não registrado no WABA → verificar dashboard Meta.
- Rate limit Meta (429) → back-off exponencial.
- Janela 24h fechada → só templates aprovados podem ser enviados.

## Rate limits
Definidos pela tier Meta do WABA. Não gerenciamos localmente.
