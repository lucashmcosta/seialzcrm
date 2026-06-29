## Auditoria final read-only — Viagi (últimos 10 dias)

**Janela:** `since_override_iso=2026-06-19T17:18:03Z`
**Org:** `b246ef6f-6242-4011-a112-6d8783d2896a`
**Page:** `1c11568d-fd83-4d5a-8dfe-86aa4588ce00`

Apenas leituras. Nenhuma escrita, dispatch, deploy, recovery ou alteração de schema.

### Execução

1. **Graph × CRM** — `supabase--curl_edge_functions` POST `/meta-lead-ads-recovery-viagi` com `{"mode":"count","since_override_iso":"2026-06-19T17:18:03Z"}`. Por formulário: `graph_total_fetched`, `already_imported`, `would_import`, `duplicates_by_source_external_id`, `duplicates_by_phone_normalized`. Validar `already_imported + would_import == graph_total_fetched` e `would_import == 0`. Reconciliação por `source_external_id` (não por `created_at`).

2. **Leads sem contato** — derivado do passo 1; se `would_import == 0`, garantido. Caso contrário, listar `would_import_lead_ids`.

3. **Contatos sem Opportunity** — `supabase--read_query`:
   ```sql
   SELECT c.id, c.name, c.source_external_id
   FROM contacts c
   WHERE c.organization_id='b246ef6f-6242-4011-a112-6d8783d2896a'
     AND c.source='meta_lead_ads'
     AND c.deleted_at IS NULL
     AND NOT EXISTS (
       SELECT 1 FROM opportunities o
       WHERE o.contact_id=c.id AND o.deleted_at IS NULL
     );
   ```
   Reportar quantidade e IDs. Esperado: 0.

4. **Logs do recovery** — `supabase--edge_function_logs` para `meta-lead-ads-recovery-viagi`. Classificar:
   - Erros internos (exceptions, `dispatch.failed`, Graph errors).
   - 504 do gateway — não contam como falha se `would_import=0` e nada interno falhou.

5. **Estado dos forms** — `supabase--read_query`:
   ```sql
   SELECT provider_form_id, provider_form_name, consecutive_errors,
          last_sync_status, last_synced_lead_created_time
   FROM lead_forms
   WHERE organization_id='b246ef6f-6242-4011-a112-6d8783d2896a'
     AND provider='meta_lead_ads'
     AND meta_lead_page_id='1c11568d-fd83-4d5a-8dfe-86aa4588ce00';
   ```
   Esperado: `consecutive_errors=0`, `last_sync_status='success'`.

6. **Health da página** — descobrir colunas `%health%` em `meta_lead_pages` via `information_schema`, depois `SELECT * FROM meta_lead_pages WHERE id='1c11568d-...'`. Confirmar `last_health_check_status='ok'`, `last_health_check_error IS NULL`, `last_health_check_at` recente.

7. **Veredito final** — tabela única com 7 checks (✅/❌):

   | Check | Resultado |
   |---|---|
   | Graph × CRM reconciliado | ✅/❌ |
   | would_import = 0 | ✅/❌ |
   | Nenhum lead sem Contact | ✅/❌ |
   | Nenhum Contact sem Opportunity | ✅/❌ |
   | Sem erros internos | ✅/❌ |
   | Forms saudáveis | ✅/❌ |
   | Health da página OK | ✅/❌ |

   Se todos ✅: declarar **"Incidente Viagi encerrado. Recuperação dos leads concluída com sucesso, reconciliação Graph × CRM validada e ambiente operacional saudável."**
   Se algum ❌: listar check, valor atual, esperado e provável causa. **Nenhuma correção** — qualquer fix exige nova aprovação.

### Fora de escopo
Escritas, UPDATE, dispatches, deploys, recovery, alterações de schema. Somente Viagi.
