# Modelo de dados — Intelligence

| Tabela | Papel |
|---|---|
| `intelligence_jobs` | 18 col — fila de jobs |
| `intelligence_settings` | 9 col — config por org (provider, feature toggles) |
| `intelligence_settings_audit` | 6 col |
| `intelligence_backfill_runs` | 15 col |
| `message_analyses` | 21 col — análise por mensagem |
| `message_response_times` | 12 col |
| `seller_metrics_daily` | 17 col — rollup diário por vendedor |
| `organization_usage_metrics` | 10 col |
| `subscription_usage` | 4 col |

RPCs: `rpc_claim_intelligence_jobs`, `intelligence_reap_stale_jobs`, `trigger_intelligence_backfill`.
