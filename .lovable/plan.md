## Etapa C.2 — Re-rodar probe com novo SU token

**Ações (sem escrita):**

1. `supabase--deploy_edge_functions(["meta-lead-ads-viagi-token-probe"])` — garantir que está deployada com o código atual.
2. `supabase--curl_edge_functions` POST `/meta-lead-ads-viagi-token-probe` body `{"mode":"probe"}` com service-role.
3. Retornar o JSON cru completo + resumo dos pontos pedidos:
   - `decrypt_system_user_token`
   - `graph_me`
   - `graph_me_permissions` (granted + missing_required)
   - `graph_page` (status, PAT emitido?)
   - `graph_forms_smoketest` (resultado por form)
   - `next_step`

**Critérios de PASS:**
- decrypt ok
- graph_me ok
- missing_required vazio (ou só não-bloqueantes)
- graph_page.ok = true e `page_access_token_returned: true`
- ambos forms no smoke test com `ok: true`

**Se PASS:** paro antes de qualquer escrita, te aviso, e proponho execução imediata de `mode="repair"` com `confirm_token="VIAGI_PAT_REISSUE_2026_06_29"` para:
- re-encriptar e persistir o novo PAT em `meta_lead_pages`
- limpar `last_token_check_error` e marcar `status='connected'` em `organization_integrations`
- zerar `consecutive_errors` / `last_sync_status='success'` dos forms que passaram

**Se FAIL:** reporto exatamente qual etapa falhou e o que ajustar — não peço token novo se SU token continuar utilizável.

**Fora de escopo:** Meta WhatsApp Cloud, Twilio, CAPI, `_shared/meta-token.ts`, `meta-lead-ads-poll`, `meta-lead-ads-process-lead`, UI.
