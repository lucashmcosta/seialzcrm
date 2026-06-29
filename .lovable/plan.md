## Etapa D.2 — Recovery `mode=count` com janela completa + auditoria estendida

**1. Estender `meta-lead-ads-recovery-viagi/index.ts` (read-only, sem novos efeitos colaterais)**

Adicionar ao relatório por formulário:
- `graph_min_created_time` e `graph_max_created_time` (menor/maior `created_time` retornado pela Graph)
- `would_import_lead_ids`: array completo de `lead_id` (não só amostra)
- `would_import_full`: lista completa com `{lead_id, created_time, phone, full_name, ad_name, campaign_name}`
- `crm_cross_check.crm_contacts_meta_lead_ads_in_window`: contagem de `contacts` com `organization_id=Viagi`, `source='meta_lead_ads'`, `created_at` entre `since_iso_used` e `max(created_time, now)`
- `crm_cross_check.window_start` / `window_end` explícitos

Deploy da função.

**2. Executar:**

```bash
POST /meta-lead-ads-recovery-viagi
{ "mode": "count", "since_override_iso": "2026-06-12T13:25:04Z" }
```

**3. Validação cruzada adicional** (read-only, via `supabase--read_query`):
Confirmar a contagem de contatos no CRM no mesmo período (sanidade do número que a função reporta).

**4. Relatório final por formulário (`1310430187415392` e `1390086283162407`):**
- `provider_form_id`, `form_name`
- `since_iso_used` (+ `since_source = since_override_iso`)
- `graph_total_fetched`
- `graph_min_created_time` / `graph_max_created_time`
- `already_imported`
- `would_import` + **lista completa de `lead_id`**
- `duplicates_by_source_external_id`
- `duplicates_by_phone_normalized`
- `sample_would_import` (10 primeiros com nome/telefone/ad/campanha)
- **Comparação Graph × CRM × Faltando:**
  - Graph total no período
  - CRM contatos `meta_lead_ads` no período
  - Faltando (= `would_import`)
- **Veredito explícito sobre a divergência do Dashboard Viagi (12 recebidos × 23 esperados):**
  - Se `would_import == 11`: divergência 100% explicada
  - Caso contrário: apontar onde está a diferença residual (ex: leads já importados mas não exibidos no dashboard por filtro de data/ad, leads fora da janela, etc.)

**Stop point absoluto:** Sem `mode=apply`. Sem escritas. Aguardar aprovação após análise.

**Fora de escopo:** qualquer escrita, dispatch, alterações em outras integrações/funções.
