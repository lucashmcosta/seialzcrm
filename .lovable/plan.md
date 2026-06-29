## Etapa — Recovery Viagi: count dos últimos 10 dias (read-only)

**Janela:** `since_override_iso = now() - 10 dias` (UTC). Calculado no momento da execução (ex.: hoje `2026-06-29T...Z` → `2026-06-19T...Z`).

**Org:** Viagi (`b246ef6f-6242-4011-a112-6d8783d2896a`)
**Forms:** todos os `provider_form_id` monitorados da Viagi (atualmente `1310430187415392` e `1390086283162407`, conforme execuções anteriores — a função já itera sobre todos os forms ativos da org).

### Execução (somente count)

```json
POST /meta-lead-ads-recovery-viagi
{
  "mode": "count",
  "since_override_iso": "<now-10d em UTC>"
}
```

### Relatório por formulário

Para cada `provider_form_id`:
- `provider_form_id`
- `form_name`
- `since_iso_used` (+ `since_source = since_override_iso`)
- `graph_total_fetched`
- `graph_min_created_time` / `graph_max_created_time`
- `already_imported` (dedup por `source_external_id` em chunks)
- `would_import`
- `duplicates_by_source_external_id`
- `duplicates_by_phone_normalized`
- **Lista completa** de `would_import_lead_ids`
- Amostra (`would_import_full`, 10 primeiros): `lead_id`, `created_time`, `full_name`, `phone`, `ad_name`, `campaign_name`
- Conservação: `already_imported + would_import == graph_total_fetched` ✓

### Validação cruzada (read-only via `supabase--read_query`)

Contagem independente no CRM:
```sql
SELECT count(*) FROM contacts
WHERE organization_id = 'b246ef6f-6242-4011-a112-6d8783d2896a'
  AND source = 'meta_lead_ads'
  AND deleted_at IS NULL
  AND created_at >= '<since>'
```

### Stop point absoluto

- ❌ Sem `mode=apply`
- ❌ Sem escritas, sem dispatches, sem CAPI
- ✅ Aguardar aprovação após review do `would_import`

### Fora de escopo

Qualquer alteração de código na função (já estendida na etapa anterior com todos os campos necessários). Esta etapa é apenas execução + relatório.
