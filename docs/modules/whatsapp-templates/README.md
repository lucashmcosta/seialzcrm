# Módulo: WhatsApp Templates

## Rotas
- `/whatsapp/templates`
- `/whatsapp/templates/new`
- `/whatsapp/templates/:id`
- `/whatsapp/templates/:id/edit`

Páginas em `src/pages/whatsapp/`. Também `/settings/whatsapp-templates` e `/settings/whatsapp-snippets`.

## Comportamentos
- Admin only por design (memory `whatsapp/template-management-system-v3`).
- Sync bidirecional com Twilio/Meta — mapping de status Twilio.
- Metadata JSONB para renderizar quick-replies na history (memory `template-metadata-extraction`, `template-message-rendering-history`).

## Edge functions
- `meta-whatsapp-templates-create`, `meta-whatsapp-templates-sync`
- `twilio-whatsapp-templates`
