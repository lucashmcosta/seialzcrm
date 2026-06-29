## Etapa C.3 — Executar `mode=repair` na probe

**Ação única (build mode):**

```bash
POST /meta-lead-ads-viagi-token-probe
{ "mode": "repair", "confirm_token": "VIAGI_PAT_REISSUE_2026_06_29" }
```

Isso vai:
1. Reemitir PAT da Página Viagi via Graph (`/713236591874041?fields=id,name,access_token`) usando o System User token salvo.
2. Re-encriptar o novo PAT e gravar em `meta_lead_pages.page_access_token_encrypted` (row `1c11568d-fd83-4d5a-8dfe-86aa4588ce00`), setar `last_health_check_status='ok'`, limpar `last_health_check_error`, atualizar `last_health_check_at`.
3. Atualizar `organization_integrations.connected_account` (row `e88cb37b-…`) com `status='connected'`, `last_token_check_at=now`, `last_token_check_error=null`.
4. Para cada form com smoke OK (`1390086283162407`, `1310430187415392`): zerar `consecutive_errors`, setar `last_sync_status='success'`, `last_sync_error=null`.
5. Rodar smoke test final dos 2 forms com o novo PAT.

**Reporte no fim:**
- ✅ PAT regravado (writes.meta_lead_pages_update_error = null)
- ✅ Página Viagi status ok (graph_page.ok=true)
- ✅ Erros limpos (organization_integrations_update_error = null, last_token_check_error=null)
- ✅ Forms com `consecutive_errors=0` (writes.forms_reset_count = 2)
- ✅ Smoke dos dois forms OK (graph_forms_smoketest.results ambos ok=true)

**NÃO executar nada além disso.** Recovery `mode=count` fica para a próxima rodada, após sua aprovação.

**Fora de escopo:** Meta WhatsApp Cloud, Twilio, CAPI, `_shared/meta-token.ts`, `meta-lead-ads-poll`, `meta-lead-ads-process-lead`, UI, recovery apply.
