# Modelo de dados — Marketing

| Tabela | Linhas (2026-07-04) | Papel |
|---|---|---|
| `marketing_campaigns` | 70 | Campanha (33 col) |
| `marketing_campaign_insights_daily` | 1.025 | Insights diários (19 col) |
| `marketing_campaign_spend_history` | 0 | Histórico de gasto (12 col) |
| `marketing_attribution_ambiguities` | 293 | Ambiguidades de atribuição (17 col) |
| `meta_lead_pages` | 2 | Páginas com forms Meta (15 col) |
| `lead_forms` | 3 | Cache de forms |
| `lead_form_questions` | 11 | Perguntas dos forms |
| `capi_event_log` | 10.212 | Log CAPI (18 col, retry) |
| `sales_events` | 19.045 | Eventos comerciais compartilhados |

## Triggers
- `contacts`: `trg_populate_contact_marketing_campaign_fk` (BEFORE INS/UPD), `trg_capi_lead_on_contact_insert/update` (AFTER).
- `marketing_campaigns`: `trg_marketing_campaign_enrich_async` (AFTER INS/UPD) → chama `marketing-campaign-enrich` ⚠️ fora do repo.
- `opportunities`: `trg_capi_purchase_on_opp_won` (AFTER UPD).
- `lead_forms` / `lead_form_questions`: `trg_lead_forms_updated_at`, `trg_lead_form_questions_recheck_form`.

## Sync
- Cron diário 06:00 UTC: `marketing-insights-sync-daily-cron`.
- Cron diário 05:30 UTC: `meta-discover-ads-cron`.
- Cron a cada 6h: `marketing-campaign-enrich-cron` ⚠️ drift.

## RPCs
- `fn_resolve_marketing_campaign_id(...)`, `fn_log_marketing_attribution_attempt`, `fn_marketing_attribution_dryrun`, `fn_marketing_attribution_top_conflicts`.
- `get_marketing_ad_performance(...)` — funil com 31 col.
- `fn_capi_dispatch_event(...)`.
- `try_lead_form_polling_lock(...)`.
- `get_meta_credentials(p_org_id)` ⚠️ retorna token criptografado.
