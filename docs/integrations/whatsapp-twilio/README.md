# WhatsApp — Twilio

**Referência técnica:** `docs/audit/04-integracoes/whatsapp-twilio.md` e `docs/audit/02-edge-functions/twilio-whatsapp-*`.

## Finalidade
Canal WhatsApp via Twilio (mensagens + templates). Coexiste com Meta Cloud.

## Autenticação
- `Account SID` + `Auth Token` por org em `organization_integrations` (cifrado).
- Onboarding: `twilio-whatsapp-setup`.
- Twilio account global também pode existir em `admin_integrations`.

## Webhooks
- `twilio-whatsapp-webhook` — inbound.
- Resolve org por `messaging_service_sid` — cross-org routing conforme memory.
- Assinatura HMAC Twilio validada.

## Envio
- `twilio-whatsapp-send` — via `dispatchWhatsAppSend`.
- Templates: `twilio-whatsapp-templates` (sync + criação).
- Media proxy: `twilio-media-proxy` (evita expor URLs assinadas Twilio ao cliente).

## Priorização de sender
Memory `whatsapp-outbound-number-prioritization`: prefere ONLINE senders. Se número offline, cai para próximo válido.

## Migração para Railway
Memory `architecture/whatsapp-railway-migration-v2`: Railway agora processa mensageria; edge functions Twilio focam em templates.

## Falhas comuns
- Assinatura HMAC inválida → verificar Auth Token correto.
- Sandbox number expirado.
- `messaging_service_sid` não vinculado ao número.

## Rate limits
Configuráveis por account/messaging service no Twilio.
