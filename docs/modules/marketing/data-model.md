# Modelo de dados — Marketing

| Tabela | Papel |
|---|---|
| `marketing_campaigns` | 33 col — campanha |
| `marketing_campaign_insights_daily` | Insights diários (19 col) |
| `marketing_campaign_spend_history` | Histórico de gasto (12 col) |
| `marketing_attribution_ambiguities` | Ambiguidades de atribuição (17 col) |
| `meta_lead_pages` | Páginas com forms Meta (15 col) |
| `lead_forms` / `lead_form_questions` | Cache de forms |
| `capi_event_log` | Log de eventos CAPI (18 col, retry) |
| `meta_lead_pages` | Páginas conectadas |

Sync: cron `marketing-insights-sync-daily-cron` (06:00 UTC).
