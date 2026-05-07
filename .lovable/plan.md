## Integração Meta Lead Ads (Facebook + Instagram) — v2

Polling de leads via System User Token (sem App Review) com mapeamento por pergunta. Schema já existe (`meta_lead_pages`, `lead_forms`, `lead_form_questions`).

### Mudanças desta revisão
1. Cron jobs lêem o `service_role_key` direto do **Supabase Vault** (`vault.decrypted_secrets`), não via `current_setting`.
2. `meta-lead-ads-process-lead` permanece `verify_jwt=false` mas valida manualmente o header `Authorization` contra `SUPABASE_SERVICE_ROLE_KEY`. O `poll` envia esse header explicitamente ao invocar.
3. Card `meta-lead-ads` em `IntegrationsSettings` redireciona **sempre** para `/integrations/meta-lead-ads` (sem `IntegrationDetailDialog`).

---

### 1. Secrets a configurar

| Secret | Valor |
|---|---|
| `META_TOKEN_ENCRYPTION_KEY` | 64 hex chars (AES-256-GCM) |
| `META_GRAPH_API_VERSION` | `v23.0` |

`SUPABASE_SERVICE_ROLE_KEY` e `SUPABASE_URL` já existem.
**Vault**: garantir que `service_role_key` esteja em `vault.secrets` (necessário para os crons).

---

### 2. Helpers compartilhados

`supabase/functions/_shared/crypto.ts` — `encryptSecret` / `decryptSecret` AES-256-GCM, formato `v1:{iv_b64}:{ct_b64}`.

`supabase/functions/_shared/meta-graph.ts` — `metaGraphGet(path, params, { accessToken, appSecret })` com `appsecret_proof` HMAC-SHA256. `isTokenError(err)` para códigos 190/460/463/467/102.

---

### 3. Edge Functions

CORS padrão do `lead-webhook`. Try/catch global. `import { createClient } from "jsr:@supabase/supabase-js@2"`.

**A. `meta-lead-ads-connect`** (`verify_jwt=true`) — POST `{ organization_id, app_id, app_secret, system_user_token, business_id? }`
1. Valida via `GET /me?fields=id,name`.
2. Criptografa secrets, upsert `organization_integrations` (slug `meta-lead-ads`) com `connected_account` jsonb.
3. Inicializa `config_values.meta_lead_ads_settings` com defaults.
4. Dispara `meta-lead-ads-discover` em background.

**B. `meta-lead-ads-discover`** (`verify_jwt=true`) — POST `{ organization_integration_id, organization_id }`
1. `GET /me/accounts` → upsert `meta_lead_pages` (com `page_access_token_encrypted`).
2. Para cada página: `GET /{page_id}/leadgen_forms` → upsert `lead_forms` (`is_monitored=false`).
3. Para forms novos: `GET /{form_id}?fields=questions` → upsert `lead_form_questions` (`mapping_strategy='note'`). Auto-mapeia chaves óbvias (`email`, `phone_number`, `full_name`, etc) para `standard_field` + `is_configured=true`.

**C. `meta-lead-ads-poll`** (`verify_jwt=false`, chamado pelo cron) — body vazio
1. Busca `lead_forms` com `is_monitored=true`, `consecutive_errors<5`, página/integração ativas.
2. Para cada form: `try_lead_form_polling_lock($id)`. Se false, pula.
3. `since_unix = last_synced_lead_created_time ?? now()-1h`. `GET /{form_id}/leads` filtrando por `time_created`, paginando até 5 × 50.
4. Para cada lead, invoca `meta-lead-ads-process-lead` **sem await**, passando explicitamente:
   ```ts
   fetch(`${SUPABASE_URL}/functions/v1/meta-lead-ads-process-lead`, {
     method: 'POST',
     headers: {
       'Content-Type': 'application/json',
       'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
     },
     body: JSON.stringify({ lead, organization_id, lead_form_id, lead_form_name, settings }),
   });
   ```
5. Atualiza `last_synced_at`, `last_sync_status='success'`, zera `consecutive_errors`, atualiza `last_synced_lead_created_time`, soma `total_synced_leads`.
6. Erro: `consecutive_errors++`; se `isTokenError`, marca página `expired` + cria notification.

**D. `meta-lead-ads-process-lead`** (`verify_jwt=false`) — POST `{ lead, organization_id, lead_form_id, lead_form_name, settings }`

**Validação manual no início (NOVO):**
```ts
const authHeader = req.headers.get('authorization');
const expected = `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`;
if (authHeader !== expected) {
  return new Response(JSON.stringify({ error: 'Unauthorized' }), {
    status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  });
}
```

Pipeline:
1. **Idempotência**: skip se já existe contact com `source='meta_lead_ads' AND source_external_id=lead.id`.
2. Carrega `lead_form_questions`, monta `Map<field_key, value>` do `lead.field_data`.
3. Aplica mapeamento por pergunta:
   - `standard_field` → `standardUpdates[mapped_to_contact_field]`
   - `custom_field` → upsert `custom_field_values` (`module='contacts'`, `value={text:value}`)
   - `tag` → conforme `tag_strategy`: `value_as_tag` / `value_with_prefix` / `option_as_tag` / `fixed_tag`
   - `note` (default) → só anota; `ignore` → descarta
   - field_key não mapeado → `[⚠ pergunta nova]` na nota + push em `unmapped_fields`
4. Normaliza nome/email/phone (E.164 via `normalizePhoneToE164`).
5. Dedup conforme `organizations.duplicate_check_mode`.
6. Owner: `default_owner_user_id` → `assign_round_robin($org)` → null.
7. Insert/update `contacts` com `source`, `source_external_id`, `utm_*`, `ad_referral_*`, `lifecycle_stage`.
8. Upsert custom field values + tags (criando `tags` por nome quando não existe + insert `tag_assignments` `entity_type='contact'`). Aplicar `fixed_tag_id` direto.
9. Insert `activities` `activity_type='system'` com blocos "Atribuição" e "Respostas".
10. Se `set_name_confirmed`: upsert `contact_memories` `{name_confirmed:true, name_asked:true}`.
11. Se `unmapped_fields`: marca `lead_forms.is_mapping_configured=false` + notifications.
12. Se `auto_create_opportunity && default_pipeline_stage_id`: cria `opportunities`.

**E. `meta-lead-ads-token-health`** (`verify_jwt=false`, cron diário 8h) — body vazio
- Itera integrações habilitadas, descriptografa token, `GET /me?fields=id`. Atualiza `last_token_check_at`/`status`. Erro → notification.

---

### 4. Cron jobs (migration SQL)

```sql
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

SELECT cron.schedule('meta-lead-ads-poll', '*/3 * * * *', $$
  SELECT net.http_post(
    url := 'https://qvmtzfvkhkhkhdpclzua.supabase.co/functions/v1/meta-lead-ads-poll',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (
        SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'service_role_key'
      )
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 120000
  );
$$);

SELECT cron.schedule('meta-lead-ads-token-health', '0 8 * * *', $$
  SELECT net.http_post(
    url := 'https://qvmtzfvkhkhkhdpclzua.supabase.co/functions/v1/meta-lead-ads-token-health',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (
        SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'service_role_key'
      )
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
$$);
```

**Pré-requisito**: `service_role_key` no Vault. Se não existir, criar via:
```sql
SELECT vault.create_secret('<service_role_key_value>', 'service_role_key');
```

---

### 5. `supabase/config.toml` — adicionar

```toml
[functions.meta-lead-ads-connect]
verify_jwt = true
[functions.meta-lead-ads-discover]
verify_jwt = true
[functions.meta-lead-ads-poll]
verify_jwt = false
[functions.meta-lead-ads-process-lead]
verify_jwt = false
[functions.meta-lead-ads-token-health]
verify_jwt = false
```

`process-lead` valida o header manualmente (passo 3.D acima).

---

### 6. Frontend

Rota: `/integrations/meta-lead-ads` (CRM, `<Layout>`). Estado: `not_connected | connected_no_forms | connected_active | connection_error`.

```text
src/pages/integrations/MetaLeadAdsPage.tsx
src/components/integrations/meta-lead-ads/
  ConnectionForm.tsx          # Etapa 1
  PagesAndFormsList.tsx       # Etapa 2 (árvore Páginas → Forms, Switch is_monitored)
  MappingDrawer.tsx           # Sheet 600px
  QuestionMappingCard.tsx     # Card por pergunta (sub-form condicional)
  SettingsCard.tsx            # Etapa 3
  StatusDashboard.tsx         # 4 stats no topo
src/hooks/
  useMetaLeadAdsIntegration.ts
  useLeadFormQuestions.ts
  useCustomFieldsAutocomplete.ts
src/lib/
  meta-lead-ads-api.ts
  meta-lead-ads-types.ts
```

**MappingDrawer**: 5 destinos (`standard_field|custom_field|tag|note|ignore`). `custom_field` Combobox + opção "+ Criar novo campo" criando `custom_field_definition` com `source_external_id='meta_form:{form_id}:{field_key}'` e mapping de tipo (`EMAIL→email`, `PHONE_NUMBER→phone`, `NUMBER→number`, `MULTIPLE_CHOICE→select`, `DATE_TIME→datetime`, default `text`). Warning para 100+ custom fields. `tag`: 4 estratégias com prefixo/cor/preview, warning para `MULTIPLE_CHOICE` 10+. Footer "Salvar ({configured} de {total})".

**SettingsCard**: edita `config_values.meta_lead_ads_settings` (auto criar oportunidade + pipeline_stage, lifecycle, round-robin/owner padrão, set_name_confirmed, auto WhatsApp inicial, processar forms incompletos).

**StatusDashboard**: token status, total leads, X/Y forms ativos, última sincronização.

**Entrada (`IntegrationsSettings`)**: quando o card slug=`meta-lead-ads` é clicado → `navigate('/integrations/meta-lead-ads')` **sempre**, independente do estado de conexão. **NÃO** abrir `IntegrationDetailDialog` nesse caso (early-return antes da chamada do dialog).

---

### 7. Padrões

- Edge functions: `jsr:@supabase/supabase-js@2`, service role para bypass RLS quando necessário.
- Frontend: shadcn (Card, Sheet, Combobox, Switch, Badge, Alert), TanStack Query, RHF + Zod, sonner, semantic tokens.
- Multi-tenant: filtrar por `organization_id`; RLS protege via `user_has_org_access`.

---

### 8. Ordem de implementação

1. Secrets (`META_TOKEN_ENCRYPTION_KEY`, `META_GRAPH_API_VERSION`) + Vault `service_role_key`.
2. `_shared/crypto.ts` + `_shared/meta-graph.ts`.
3. Edge `connect` + `discover` + `config.toml`.
4. Frontend `MetaLeadAdsPage` + `ConnectionForm` + `PagesAndFormsList` (testar com app Meta).
5. `MappingDrawer` + `QuestionMappingCard` + criar custom field inline.
6. Edge `process-lead` (com validação manual de header).
7. Edge `poll` (passando Authorization explícito) + cron migration.
8. Edge `token-health` + cron + `SettingsCard` + `StatusDashboard`.
9. Redirect em `IntegrationsSettings` para `meta-lead-ads`.

---

### 9. Fora de escopo

- Schema (já existe).
- Webhook do Meta (polling resolve sem App Review).
- Backfill retroativo de leads antigos (`now()-1h` na primeira execução).
- Disparo de WhatsApp via agente IA (apenas o switch fica pronto).
