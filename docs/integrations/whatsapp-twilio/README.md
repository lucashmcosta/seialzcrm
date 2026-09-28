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
- Resolve org por `messaging_service_sid` — quando várias orgs compartilham conta Twilio, a org destino é resolvida pelo identificador antes de qualquer gravação (cross-org routing).
- Assinatura HMAC Twilio validada.

## Envio
- `twilio-whatsapp-send` — via `dispatchWhatsAppSend`.
- Política global de prévia de links: para todas as organizações e números WhatsApp via Twilio, texto livre é enviado em `Body`, com a URL preservada. O provedor gera a prévia automaticamente em mensagens livres dentro da janela de atendimento; não é necessário um parâmetro `preview_url` da Meta nesse endpoint Twilio. O fluxo publicado já utiliza esse formato.
- Templates enviados com `ContentSid` não suportam a mesma prévia automática de URL. Não converter templates em texto livre para tentar forçar a prévia fora da janela. Referência: [prévia de links em mensagens livres — Twilio](https://www.twilio.com/docs/whatsapp/message-features#preview-weblinks-in-freeform-whatsapp-messages).
- Templates: `twilio-whatsapp-templates` (sync + criação).
- Media proxy: `twilio-media-proxy` (evita expor URLs assinadas Twilio ao cliente).

## Priorização de sender
Prefere senders ONLINE. Se número offline, cai para o próximo válido (`src/lib/dispatchWhatsAppSend.ts`).

## Migração para Railway
Railway processa a mensageria; edge functions Twilio focam em templates.

## Falhas comuns
- Assinatura HMAC inválida → verificar Auth Token correto.
- Sandbox number expirado.
- `messaging_service_sid` não vinculado ao número.

## Rate limits
Configuráveis por account/messaging service no Twilio.
