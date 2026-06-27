
# Hotfix Meta Cloud — paridade funcional com Twilio (inbound)

Escopo restrito ao fluxo Meta Cloud. Twilio fica intocado. Sem extração de módulo compartilhado. Sem migrations. Mídia, outbound, templates e `handleStatus` não são alterados.

## 1. `supabase/functions/meta-whatsapp-webhook/index.ts`

Helpers locais novos (copiados do twilio-whatsapp-webhook):

- `normalizePhoneForSearch(e164)` — variações BR com/sem 9º dígito.
- `resolveInboundSettings(supabase, endpoint)` — hierarquia `communication_endpoints.inbound_settings` → `organization_integrations.whatsapp_inbound_settings` → fallback `{auto_create_contact:true, default_lifecycle_stage:'lead', auto_create_opportunity:false}`.
- `findOrCreateContact(...)` — busca via `normalizePhoneForSearch` + `.or('phone.eq...')`, respeita `auto_create_contact`, aplica `default_lifecycle_stage` e `source='whatsapp'`.
- `autoCreateOpportunityIfEnabled(...)` — guard de oportunidade aberta, resolve `default_stage_id` validado por org → fallback primeira stage por `order_index`, herda `owner_user_id`.
- `saveReferralFields(...)` — UPDATE em `contacts` com `ad_referral_*`, `ad_referral_captured_at`, `source='ctwa'`, `utm_source='meta_ads'`, `utm_medium='ctwa'`.
- `resolveReplyToMessageId(contextWamid)` — lookup em `messages.whatsapp_message_sid`.
- `notifyContactOwner(...)` — insert em `notifications` (mesmo shape do Twilio).
- `insertActivity(...)` — insert em `activities` (mesmo shape do Twilio).
- `triggerAiAgentOrFlagHuman(...)` — busca `ai_agents` (sdr, enabled), fetch async para `/functions/v1/ai-agent-respond`, ou marca `needs_human_attention=true`.

Mudanças no `handleInbound` (mesma ordem do Twilio):

1. Resolver `inboundSettings`.
2. Parser de `msg.referral` (Cloud API):
   - `source_url`, `source_id`, `source_type`, `headline`, `body`, `ctwa_clid`.
   - `media_url = ref.image_url ?? ref.video_url ?? ref.thumbnail_url`.
   - `hasReferral` se qualquer um existir.
3. `findOrCreateContact(...)`. Se retornar `null`, sair (sem thread/mensagem).
4. Se `created === true` → `autoCreateOpportunityIfEnabled(...)`.
5. Se `hasReferral` → `saveReferralFields(...)`.
6. Mídia: **inalterado** (download Graph → Storage).
7. Thread: **inalterado**.
8. `resolveReplyToMessageId(msg.context?.id)`.
9. Insert da mensagem com `reply_to_message_id`, `sent_at`, `metadata.meta_cloud.raw` (preservando `referral`).
10. `notifyContactOwner(...)`.
11. `insertActivity(...)`.
12. `triggerAiAgentOrFlagHuman(...)`.

`handleStatus`, verificação de assinatura, GET handshake e mídia: nenhuma mudança.

## 2. UI — Regras de Entrada no dialog Meta

Arquivo: `src/components/integrations/meta-whatsapp-cloud/MetaWhatsAppCloudDialog.tsx`.

- Importar `WhatsAppInboundSettings` (componente genérico já existente em `src/components/settings/WhatsAppInboundSettings.tsx`, lê/grava `organization_integrations.whatsapp_inbound_settings`).
- Renderizar `<WhatsAppInboundSettings integrationId={orgIntegration.id} />` dentro do dialog quando `isConnected`, logo após o Card de Templates.

`EndpointInboundSettings` (por número, em `AdditionalEndpointsSection`) já é provider-agnóstico e continuará funcionando para endpoints Meta sem alteração.

## 3. Não-alterações

- `twilio-whatsapp-webhook/index.ts`: zero mudanças.
- `meta-whatsapp-send`, templates Meta/Twilio, mídia, `handleStatus`: zero mudanças.
- Schema: nenhuma migration. Colunas já existem (`ad_referral_*`, `inbound_settings`, `whatsapp_inbound_settings`, `needs_human_attention`, `reply_to_message_id`, `endpoint_id`).

## 4. Validação pós-deploy

### Campanha Meta (CTWA) no número 7020
- Contato criado/reutilizado (testar com/sem 9º dígito).
- `contacts.ad_referral_source_id`, `ad_referral_headline`, `ad_referral_ctwa_clid` preenchidos.
- `contacts.source='ctwa'`, `utm_source='meta_ads'`, `utm_medium='ctwa'`.
- 1 row em `opportunities` com stage e owner corretos.
- `messages.metadata.meta_cloud.raw.referral` preservado.
- `notifications` + `activities` criados.
- `ai-agent-respond` invocado ou `needs_human_attention=true`.

### Conversa comum no número 7020
- `auto_create_contact=false` → mensagem de número desconhecido é descartada.
- `auto_create_opportunity=false` → contato criado, oportunidade não.

### Smoke test Twilio
- 1 mensagem inbound no número Twilio existente — comportamento inalterado, sem erros novos nos logs.

## 5. Notas técnicas

- Helpers ficam dentro do próprio `meta-whatsapp-webhook/index.ts` (cópia pragmática). Diff esperado: +300 linhas, 0 no Twilio.
- Logs com prefixo `[meta-wa-webhook]` (distintos do `[wa-inbound]` Twilio).
- Refator para `_shared/whatsapp-inbound/*` fica fora deste hotfix.
