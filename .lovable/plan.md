
## Volume real (últimos 30 dias)

| Item | Quantidade |
|---|---|
| Mensagens totais | 43.977 |
| Texto analisável (≥2 chars) | 32.823 |
| Áudios WhatsApp | 8.948 |
| Opportunities won | 360 |
| Opportunities lost | 3.271 |
| Orgs com BYOK OpenAI | 1 |
| Orgs total | 9 |

## 1. Backfill histórico

Fonte única de verdade: tabela `messages` com `created_at >= now() - 30 days` cruzada com `message_threads` (para `opportunity_id`/`contact_id` quando faltar) e `opportunities` (`status` ∈ won/lost/open).

Critérios de inclusão por mensagem:
- Texto: `content` com ≥2 chars não nulos, `direction` ∈ inbound/outbound, thread em canal `whatsapp` e org não opt-out.
- Áudio: `media_type ilike 'audio%'`, `media_urls[0]` resolvível, duração estimada ≤600s (de `intelligence_settings.transcription.max_audio_seconds`).
- Pular se já existir `message_analyses` na `analysis_version` corrente, ou `audio_transcriptions` na `version` corrente (idempotência).

Output esperado:
- `message_analyses`: ~32.823 linhas novas (texto direto + texto vindo de transcrição).
- `audio_transcriptions`: ~8.948 linhas novas → cada uma reenfileira `analyze_message`.
- `sales_events`: `objection_detected`, `buying_signal_detected`, `human_handoff_suggested`, `negative_sentiment_detected` derivados da análise + `ghosting` já em produção.
- `opportunity_behavior_snapshot`: refresh por (opportunity, thread) com contadores e timestamps.
- `seller_metrics_daily`: rollup diário a partir de `message_response_times`.

## 2. Processamento em batches

Pipeline já tem `intelligence_jobs` + trigger `trg_messages_intelligence_enqueue` + cron `intelligence-worker-30s`. O backfill é uma única função que enfileira jobs em fatias temporais.

Nova edge function `intelligence-backfill-runner` (admin-only via `x-worker-token`):

Parâmetros:
- `organization_id` (opcional — se ausente, varre todas as orgs não opt-out)
- `from`, `to` (default: now-30d .. now)
- `slice_hours` (default 6) — corta a janela em fatias para não estourar `intelligence_jobs.idempotency_key` em massa
- `dry_run` (default false) — só conta o que faria

Algoritmo por slice:
1. SELECT mensagens elegíveis (texto OU áudio) em batch de 500 por org.
2. Para cada uma, INSERT em `intelligence_jobs` com `idempotency_key = analyze:<id>` ou `transcribe:<id>` e `ON CONFLICT DO NOTHING` — protege contra reentrada.
3. Registra progresso em nova tabela `intelligence_backfill_runs (id, organization_id, from, to, slice_started_at, slice_finished_at, enqueued_count, status)`.

Worker existente (`intelligence-worker`, batch=3 sequencial, a cada 30s) drena. Não precisa de novo worker.

## 3. Controle de custo

Estimativa para 30 dias com defaults atuais:

| Função | Volume | Modelo default | Custo unitário | Total |
|---|---|---|---|---|
| analyze_message (managed) | ~32k | google/gemini-2.5-flash | ~$0.0001 | ~$3,30 |
| transcribe_audio (BYOK openai 1 org) | ~1k | whisper-1 | $0.006/min × 0,5min | ~$3 |
| transcribe_audio (managed 8 orgs) | ~7,9k | elevenlabs scribe_v1 | ~$0.40/h ≈ $0,003 | ~$24 |
| analyze pós-transcrição | ~8,9k | gemini-2.5-flash | $0.0001 | ~$0,90 |

**Total estimado: ~$30-35** para os 30 dias, dominado por transcrição de áudio.

Controles aplicados:
- `intelligence_settings.transcription.max_audio_seconds = 600` (hard cap).
- `privacy.org_opt_out = true` desliga tudo para a org.
- `behavior.only_open_deals = true` (já existe) limita análise a deals abertos quando ativado.
- `provider_pricing` (tabela existente) é a fonte usada por `estimateTextCostUsd` / `estimateAudioCostUsd` que escreve `estimated_cost_usd` em `ai_usage_logs`.
- `vw_org_monthly_cost_byok` (view existente) consolida custo por org.

Novo: budget cap interno por org no backfill (não em produção):
- Parâmetro `max_cost_usd` na função runner (default $5/org).
- Antes de enfileirar próximo slice, soma `estimated_cost_usd` de `ai_usage_logs` da org no run → se ≥ cap, pausa e marca run como `paused_budget`.

## 4. Proteção contra rate limit

Já implementado:
- `intelligence-worker`: sequencial, BATCH_SIZE=3, MAX_BATCHES=3 por invocação, cron 30s → ~18 jobs/min máx.
- BYOK: `fallbackToManaged` no `resolveProvider` evita pane quando key do cliente quebra.
- Retry com backoff exponencial: `60s * 2^attempts` até `max_attempts=5`, depois `permanent_failure`.

Adicional para backfill:
- Throttle de enqueue: runner pausa 1s entre fatias.
- Detecção de saturação: se >30% dos jobs últimas 5min estão `failed` com `rate_limit`, runner pausa próxima fatia por 2 min.
- Prioridade: jobs realtime do trigger têm `created_at` mais novo; o `rpc_claim_intelligence_jobs` já ordena por `next_run_at`. Backfill usa `next_run_at = now() + (i × 2s)` para escalonar e dar prioridade a tempo real.

## 5. Métricas iniciais won vs lost

Após backfill, view materializada `vw_intel_won_vs_lost_30d` agrupa por org:

Por opportunity (won ou lost nos 30d):
- `total_messages_inbound/outbound`, `audios_inbound/outbound` (de `opportunity_behavior_snapshot`).
- `avg_response_time_seconds`, `p50`, `p95` (de `message_response_times`).
- `objections_count`, `buying_signals_count`, `negative_sentiment_count`, `human_handoff_count` (de `sales_events`).
- `avg_urgency_score`, `dominant_sentiment` (de `message_analyses`).
- `cycle_hours` = `closed_at - created_at`.

Comparação:
```text
won vs lost (org X, 30d)
                       WON    LOST   delta
avg_msgs_outbound       18     11    +64%
avg_response_seconds    340   1820   -81%
buying_signals/deal     2.4    0.6   +300%
objections/deal         1.1    2.8   -61%
cycle_hours             36     192   -81%
```

Entregue como query SQL pronta + script Python (skill `ai-gateway`) que gera CSV em `/mnt/documents/intel_won_vs_lost_<org>.csv`.

## 6. Top sellers vs low performers

Base: `seller_metrics_daily` agregada nos 30d por `owner_user_id`:
- `deals_won`, `deals_lost`, `win_rate`.
- `avg_first_response_seconds`, `median_response_seconds`.
- `messages_sent_per_deal`, `audios_sent_per_deal`.
- `avg_urgency_handled`, `human_handoff_rate`, `negative_sentiment_rate`.

Ranking: top quartil vs bottom quartil por `win_rate` (mínimo 5 deals fechados no período). Output CSV `intel_sellers_30d_<org>.csv` mais um arquivo de "padrões diferenciadores" gerado por um prompt LLM que recebe os dois grupos e identifica práticas distintas.

## 7. Seleção interna de modelo/provider

Tabela existente `organization_api_keys` + view `vw_org_provider_keys` já guardam BYOK. Política interna (não exposta no UI ainda) ficará em `_shared/intelligence/policy.ts`:

| Função | Se BYOK | Sem BYOK (managed) | Fallback |
|---|---|---|---|
| analyze-message | openai `gpt-4o-mini` | gemini `google/gemini-2.5-flash` | managed em rate_limit/invalid_key |
| transcribe-audio | openai `whisper-1` | elevenlabs `scribe_v1` | managed em rate_limit/invalid_key |
| embeddings (futuro) | voyage `voyage-3` (per-org já existente) | voyage com `VOYAGE_API_KEY` global | sem fallback (embeddings são determinísticos) |

Defaults ficam em `provider_pricing` + constantes em `resolve-provider.ts` (já implementado). Não muda UI; só a tabela de pricing/policy é editada.

## 8. Estratégia de processamento incremental

- Backfill é idempotente: rodar 2× não duplica (idempotency_key + upsert em `message_analyses`/`audio_transcriptions`).
- Estado em `intelligence_backfill_runs` permite resume: ao falhar ou pausar, próxima execução continua da `slice_finished_at` salva.
- Cron diário (opcional, fase 2): `intelligence-backfill-incremental` roda 1×/dia processando `now() - 26h .. now() - 2h` para qualquer mensagem que o trigger realtime tenha perdido.

## 9. Estratégia de retry

Já no worker:
- `failed` → backoff `60s × 2^attempts`, máx 10 min, até `max_attempts=5`.
- `permanent_failure` para erros 4xx não recuperáveis (validação, invalid_key sem fallback).
- BYOK inválida: marca `byok_key_invalid` em `sales_events`, marca key como inativa, cai para managed se permitido.

Adicional para backfill:
- Reset manual via SQL: `UPDATE intelligence_jobs SET status='pending', attempts=0 WHERE ...` (operação admin documentada).

## 10. Pausar/resumir

Tabela `intelligence_backfill_runs.status` ∈ `running | paused_manual | paused_budget | paused_rate_limit | done | error`.

Comandos admin (via curl direto na edge function):
- `POST /intelligence-backfill-runner` `{action: "start", organization_id, from, to}`
- `POST /intelligence-backfill-runner` `{action: "pause", run_id}`
- `POST /intelligence-backfill-runner` `{action: "resume", run_id}`
- `POST /intelligence-backfill-runner` `{action: "status", run_id}`

Pausar não cancela jobs já enfileirados (eles drenam); apenas para de adicionar mais.

## Entrega em fases

**Fase A — Infra (1 migração + 1 função):**
- Tabela `intelligence_backfill_runs`.
- Edge function `intelligence-backfill-runner`.
- View `vw_intel_won_vs_lost_30d` + `vw_intel_sellers_30d`.

**Fase B — Execução piloto (1 org):**
- Rodar backfill na org com BYOK (custo controlado).
- Validar qualidade dos `message_analyses` (sentiment, intent, objection_type).
- Conferir transcrições por amostragem manual (~20 áudios).
- Medir custo real em `ai_usage_logs` vs estimativa.

**Fase C — Métricas:**
- Gerar 2 CSVs (`won_vs_lost`, `sellers_30d`) + 1 relatório LLM de "padrões diferenciadores".
- Critério go/no-go: precisão ≥80% em amostra anotada e custo real ≤120% do estimado.

**Fase D — Rollout interno:**
- Backfill nas demais 8 orgs em janelas separadas, respeitando budget cap.

Sem UI nesta fase. Resultados consumidos via SQL/CSV pelo time interno.
