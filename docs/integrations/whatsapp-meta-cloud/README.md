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
- Cross-org routing: quando várias orgs compartilham WABA/phone_number_id, a org destino é resolvida pelo identificador do canal antes de qualquer gravação (mesmo princípio do canal Twilio).

## Envio
- `meta-whatsapp-send` — chamada por `dispatchWhatsAppSend`.
- Política global, para todas as organizações e todos os números Meta Cloud: mensagens de texto solicitam a prévia de links com `text.preview_url: true`; o corpo deve conter a URL com `http://` ou `https://`. Não existe exceção por número nem configuração por tenant. Referência: [objeto de texto da Meta](https://whatsapp.github.io/WhatsApp-Nodejs-SDK/api-reference/types/TextObject/).
- A política cobre texto livre permitido pela janela de atendimento. Templates e anexos mantêm seus formatos próprios; não recebem `text.preview_url`. A integração Twilio usa a prévia automática do provedor, conforme seu [guia](../whatsapp-twilio/README.md).
- Templates: `meta-whatsapp-templates-create`, `meta-whatsapp-templates-sync`.

## Diagnósticos
- `meta-wa-diagnose` — checagem de saúde da integração.
- Priorização de sender outbound: prefere senders online; se o número estiver offline, cai para o próximo válido (`src/lib/dispatchWhatsAppSend.ts`).

## Falhas comuns
- Token expirado → renovar em Settings → Integrations.
- Phone number não registrado no WABA → verificar dashboard Meta.
- Rate limit Meta (429) → back-off exponencial.
- Janela 24h fechada → só templates aprovados podem ser enviados.

## Rate limits
Definidos pela tier Meta do WABA. Não gerenciamos localmente.
