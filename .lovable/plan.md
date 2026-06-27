## Ajustes confirmados via diagnóstico
1. **Provider padrão**: `communication_endpoints.provider` usa `twilio` e `meta_cloud_api` (18 e 2 rows). Adoto exatamente esses dois valores em `whatsapp_templates.provider`. Nada de `meta-cloud`/`meta`.
2. **Duplicados Twilio**: `SELECT organization_id, twilio_content_sid, count(*) FROM whatsapp_templates GROUP BY 1,2 HAVING count(*)>1` retornou 0 linhas. Seguro criar o índice único parcial Twilio.
3. **Seletor**: default = Twilio (comportamento atual preservado). Meta só quando o caller passar explicitamente `provider='meta_cloud_api'`.

## Objetivo
Adicionar suporte a templates Meta WhatsApp Cloud (sync + envio fora da janela 24h) reutilizando `whatsapp_templates`, sem mexer em Twilio.

## 1. Migration mínima em `whatsapp_templates`
- `ALTER COLUMN twilio_content_sid DROP NOT NULL`.
- `ADD COLUMN provider text NOT NULL DEFAULT 'twilio' CHECK (provider IN ('twilio','meta_cloud_api'))`.
- `ADD COLUMN organization_integration_id uuid REFERENCES organization_integrations(id) ON DELETE CASCADE`.
- `ADD COLUMN meta_template_name text`.
- `ADD COLUMN meta_waba_id text`.
- `ADD COLUMN components jsonb`.
- Índice parcial Meta: `UNIQUE (organization_integration_id, meta_template_name, language) WHERE provider='meta_cloud_api'`.
- Índice parcial Twilio: `UNIQUE (organization_id, twilio_content_sid) WHERE provider='twilio' AND twilio_content_sid IS NOT NULL`.
- Backfill defensivo: `UPDATE whatsapp_templates SET provider='twilio' WHERE provider IS NULL`.

## 2. Edge function nova: `meta-whatsapp-templates-sync`
- Input: `{ organizationId }`. Resolve `organization_integrations` slug `meta-whatsapp-cloud` ativo.
- Descriptografa token + app_secret via `_shared/meta-whatsapp/credentials.ts`; lê `config_values.waba_id`.
- `GET /{waba_id}/message_templates?fields=name,language,status,category,components&limit=200` com `appsecret_proof` (`metaGraphGet`), paginando `paging.next`.
- Upsert em `whatsapp_templates` por `(organization_integration_id, meta_template_name, language)`:
  - `provider='meta_cloud_api'`, `twilio_content_sid=NULL`
  - `friendly_name = name`, `meta_template_name = name`, `language`, `category` (upper), `status` mapeado (`APPROVED→approved`, `PENDING→pending`, `REJECTED→rejected`, demais → `pending`)
  - `body` = texto do componente BODY (preview), `header`/`footer` extraídos
  - `variables` = `{{n}}` extraídos do BODY (compatível com selector atual)
  - `components` = JSON cru da Meta
  - `metadata.meta_cloud = { waba_id, raw }`, `source='meta'`, `last_synced_at=now()`, `meta_waba_id`, `organization_integration_id`
- Retorna `{ synced, approved, by_status }`. Fase 1 não desativa templates removidos da Meta.

## 3. `meta-whatsapp-send` — suporte a template
Novo branch quando `templateId` (preferido) ou `type === 'template'`:
- Com `templateId`: carrega row, valida `provider='meta_cloud_api'`, `status='approved'`, mesma org. Extrai `meta_template_name`, `language`, `components`.
- Renderiza variáveis: substitui `{{n}}` em BODY usando `templateVariables`. Monta `components` finais para Graph API (BODY com `parameters:[{type:'text', text:'...'}]`; HEADER/BUTTONS dinâmicos ficam para fase futura). Se template sem variáveis, envia `components: []`.
- Aceita também shape direto `{ type:'template', templateName, languageCode, components }` para chamadas server-to-server.
- `POST /{phone_number_id}/messages` com payload template padrão.
- Persiste em `messages`:
  - `content` = preview renderizado ou `[Template: nome]`
  - `whatsapp_message_sid` = `messages[0].id` (wamid)
  - `whatsapp_status='sent'`
  - `metadata.meta_cloud.template = { name, language, components, rendered_preview }`
- Atualiza thread (`last_message_*`) como fluxo de texto atual.

## 4. Dispatcher `src/lib/dispatchWhatsAppSend.ts`
Sem mudança de roteamento — `templateId`/`templateVariables` já passam por spread. Confirmar que rota Meta usa esses campos.

## 5. UI

### a) Card da integração (`MetaWhatsAppCloudDialog.tsx` + Admin)
- Botão "Sincronizar templates" → `metaWhatsAppService.syncTemplates(orgId)`.
- Lista resumida pós-sync: nome, idioma, categoria, badge de status. Lê `whatsapp_templates` filtrando `provider='meta_cloud_api'` + `organization_integration_id`. Mostra contagem de aprovados.

### b) `WhatsAppTemplateSelector.tsx`
- Prop **opcional** `provider?: 'twilio' | 'meta_cloud_api'`.
- **Default = Twilio** (filtra `provider='twilio'` OR `provider IS NULL` para cobrir rows legadas). Comportamento atual idêntico quando prop omitida.
- Quando `provider='meta_cloud_api'`, filtra só Meta.

### c) `InboxComposer.tsx` e `WhatsAppChat.tsx`
- Resolver provider do endpoint/thread (mesma lógica do dispatcher: `primary_endpoint_id` → `communication_endpoints.provider`).
- Passar prop `provider` para `WhatsAppTemplateSelector` **somente** quando o provider for Meta. Threads/contextos sem provider detectado continuam usando o default (Twilio).
- `handleSendTemplate` já dispara `dispatchWhatsAppSend({ templateId, templateVariables })` — roteia automático.

## 6. Service layer
`metaWhatsAppService.syncTemplates(organizationId)` → invoca `meta-whatsapp-templates-sync`.

## 7. Compatibilidade
Não tocar em: `twilio-whatsapp-send`, `twilio-whatsapp-templates`, webhooks, dispatcher inbound, mídia/texto Meta atual. Sync Twilio segue preenchendo `twilio_content_sid` e `provider` default = `twilio`.

## 8. Validação manual
1. Sincronizar templates da Central → rows com `provider='meta_cloud_api'`, `components` populado, status mapeado.
2. Conversa Meta fora da janela 24h → selector lista apenas Meta aprovados.
3. Conversa Twilio (qualquer estado) → selector idêntico ao atual (só Twilio).
4. Enviar template Meta com variáveis → 200 da Graph, wamid em `messages.whatsapp_message_sid`, `metadata.meta_cloud.template`, status `delivered/read` via webhook.
5. Texto Meta dentro da janela continua enviando; fora continua bloqueado.
6. Envio Twilio (template e texto) sem regressão.

## Arquivos previstos
- Migration nova.
- `supabase/functions/meta-whatsapp-templates-sync/index.ts` (nova).
- `supabase/functions/meta-whatsapp-send/index.ts` (estender).
- `src/services/metaWhatsAppService.ts` (+ syncTemplates).
- `src/components/integrations/meta-whatsapp-cloud/MetaWhatsAppCloudDialog.tsx` (botão + lista).
- `src/components/whatsapp/WhatsAppTemplateSelector.tsx` (prop provider, default Twilio).
- `src/components/inbox/InboxComposer.tsx`, `src/components/whatsapp/WhatsAppChat.tsx` (resolver provider; passar prop só para Meta).
