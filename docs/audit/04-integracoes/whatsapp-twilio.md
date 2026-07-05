# WhatsApp — Twilio

## Fluxo

- **Setup:** `twilio-whatsapp-setup` (registra credentials em `organization_integrations` + `communication_endpoints`).
- **Envio:** `twilio-whatsapp-send` (chamado por `dispatchWhatsAppSend`).
- **Recebimento:** `twilio-whatsapp-webhook` — recebe POST Twilio, valida assinatura, cross-org lookup por `MessagingServiceSid` / número (memory `integrations/twilio-whatsapp-cross-org-routing`). Deduplica em `integration_inbound_events`.
- **Templates:** `twilio-whatsapp-templates` (sync + criação). Status mapping Twilio→interno.

## Env vars

`TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_WEBHOOK_URL_BASE` (por org via `organization_integrations.config` também).

## Tabelas

Iguais a Meta Cloud + `communication_endpoints` (canal `twilio_whatsapp`).

## UI

`src/components/settings/WhatsAppInboundSettings.tsx`, `AddWhatsAppEndpointDialog.tsx` (multi-provider).

## Observações

- Coexiste com Meta Cloud — memory `integrations/twilio-whatsapp-configuration-and-diagnostics` cobre precedência e diagnostics.
- `twilio-media-proxy` para servir mídia autenticada com credencial da org.
- Isolation garante que webhooks Twilio não vazem entre orgs (memory `integrations/twilio-voice-security-isolation` — mesma lógica).
