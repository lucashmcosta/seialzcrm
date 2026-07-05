# Modelo de dados — WhatsApp Templates

| Tabela | Papel |
|---|---|
| `whatsapp_templates` | 25 col — corpo, categoria, idioma, status Meta/Twilio |
| `whatsapp_template_actions` | 9 col — botões / actions |
| `message_snippets` | Snippets internos (não são templates oficiais) |

RLS: 4 policies em `whatsapp_templates`. Ver memory `template-management-system-v3` para regra de admin-only.
