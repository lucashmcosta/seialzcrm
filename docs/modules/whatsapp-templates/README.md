# Módulo: WhatsApp Templates

## Rotas
- `/whatsapp/templates`
- `/whatsapp/templates/new`
- `/whatsapp/templates/:id`
- `/whatsapp/templates/:id/edit`

Páginas em `src/pages/whatsapp/`. Também `/settings/whatsapp-templates` e `/settings/whatsapp-snippets`.

## Comportamentos
- Gestão admin-only por design (usuários comuns apenas usam templates aprovados).
- Sync bidirecional com Twilio/Meta — mapping de status Twilio.
- Metadata JSONB (`whatsapp_templates` + `whatsapp_template_actions`) para renderizar quick-replies/botões no histórico da conversa.

## Edge functions
- `meta-whatsapp-templates-create`, `meta-whatsapp-templates-sync`
- `twilio-whatsapp-templates`
