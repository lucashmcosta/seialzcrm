# Modelo de dados — Intelligence

| Tabela | Papel |
|---|---|
| `intelligence_jobs` | 18 col — fila de jobs |
| `intelligence_settings` | 9 col — config por org (provider, feature toggles) |
| `intelligence_settings_audit` | 6 col |
| `intelligence_backfill_runs` | 15 col |
| `message_analyses` | 21 col — análise por mensagem |
| `conversation_analysis_runs` | rodada de análise da conversa inteira (lote na Anthropic): amostra, teto e custo real, relatório ganhas x perdidas em `result` |
| `conversation_analyses` | análise de uma conversa inteira por oportunidade fechada, ligada à rodada |
| `message_response_times` | 12 col |
| `seller_metrics_daily` | 17 col — rollup diário por vendedor |
| `organization_usage_metrics` | 10 col |
| `subscription_usage` | 4 col |

RPCs: `rpc_claim_intelligence_jobs`, `intelligence_reap_stale_jobs`, `trigger_intelligence_backfill`, `conversation_analysis_candidates` e `conversation_analysis_messages` (só service_role).

As duas tabelas de análise da conversa têm RLS de leitura por org (`current_user_org_ids()`); só a função `conversation-analysis` escreve.
