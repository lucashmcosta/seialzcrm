## Escopo aprovado: criar + deployar `meta-lead-ads-viagi-token-probe` e rodar `mode=probe`

Nada de `repair`. Nada de escrita. Sem pedir token manual.

## Dados confirmados via leitura (read-only)

- `organization_integrations` (`e88cb37b-...`): `system_user_token_encrypted` ✅, `app_secret_encrypted` ✅, `status=connected`, `last_token_check_error=null`. `app_id` e `business_id` estão **nulos** em `connected_account` (não vamos depender de `debug_token`).
- `meta_lead_pages` (`1c11568d-...`): `meta_page_id=713236591874041`, `meta_page_name=Viagi`, `is_active=true`, `last_health_check_status=expired`, `last_health_check_error` = falta de `pages_read_engagement / pages_manage_metadata / pages_read_user_content / pages_manage_ads / pages_show_list / pages_messaging`. PAT atual existe.
- `lead_forms` (Viagi, meta_lead_ads): forms `1390086283162407` e `1310430187415392`, ambos com `consecutive_errors=1242`, `last_sync_status=error`, mesma mensagem de permissão.

## Arquivo a criar

`supabase/functions/meta-lead-ads-viagi-token-probe/index.ts` — descartável, hardcoded para Viagi, auth via `validateServiceRoleAuth`.

### Fluxo (mode=probe, somente leitura)

1. Carrega `organization_integrations` row e reporta presença de campos (sem expor valores).
2. `decryptSecret(system_user_token_encrypted)`. Se falhar → para e marca `ask_for_reconnect`.
3. `decryptSecret(app_secret_encrypted)` (se existir) para usar `appsecret_proof`.
4. `GET /me?fields=id,name` com o SU token. Se 401/190 → para, marca `system_user_invalid`.
5. `GET /me/permissions` → lista `granted` e calcula `missing_required` contra: `pages_show_list, pages_read_engagement, pages_manage_metadata, leads_retrieval, ads_management, business_management`.
6. `GET /{713236591874041}?fields=id,name,tasks,access_token` com o SU token.
   - Se 200 e `access_token` presente → roda smoketest **somente leitura** `GET /{form_id}?fields=id,name,status,leads_count` em cada um dos 2 forms com o PAT recém-emitido. Retorna preview mascarado do PAT novo (sem persistir).
   - Se erro → reporta exatamente o `code`/`subcode`/`message`/`fbtrace_id` e indica qual ação corrigir no Business Manager (atribuir Página Viagi ao System User com "Gerenciar Página" full, ou re-consent dos scopes faltando). **Não pede token.**

### Saída

JSON cru com:
- `steps.load_integration`, `steps.decrypt_system_user`, `steps.decrypt_app_secret`
- `steps.graph_me`, `steps.graph_me_permissions` (com `granted` + `missing_required`)
- `steps.graph_page` (com `tasks`, `page_access_token_returned`, preview mascarado)
- `steps.graph_forms_smoketest` (resultado por form)
- `writes.performed: false`
- `next_step`: uma das opções: `approve repair to persist new PAT` | `fix Business Manager: ...` | `ask_for_reconnect: ...`

### Não-fluxo (mode=repair)

Implementado no mesmo arquivo, **gated** por `confirm_token="VIAGI_PAT_REISSUE_2026_06_29"`. **Não será executado nesta rodada.**

## Execução

1. Switch para build mode → criar arquivo.
2. `supabase--deploy_edge_functions(["meta-lead-ads-viagi-token-probe"])`.
3. `supabase--curl_edge_functions` POST `{ "mode": "probe" }` com header `Authorization: Bearer <SUPABASE_SERVICE_ROLE_KEY>`.
4. Devolvo o JSON cru. Você decide se libera `repair`.

## Garantias

- Zero escrita no banco nesta rodada.
- Não toca: `meta-whatsapp-cloud`, `twilio-*`, `meta-capi-*`, `_shared/meta-token.ts`, `meta-lead-ads-poll`, `meta-lead-ads-process-lead`, UI.
- Nenhum pedido de token manual antes de provar que o SU token salvo não serve.
