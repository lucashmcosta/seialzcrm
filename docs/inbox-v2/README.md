# Inbox v2 — Pré-Deploy + Fase 0 + Fase 1

SQLs versionados, **não aplicados**. Servem como spec revisável antes da janela de deploy.

## Diagnóstico capturado (snapshot do ambiente)

| Métrica | Valor |
|---|---|
| Postgres | 17.6 |
| Linhas em `integration_inbound_events` | 25.915 |
| Tamanho total | 66 MB (tabela 54 MB + índices 10 MB) |
| Long-running tx (>1min) | 0 |
| Unique já existente | `uniq_iie_slug_idempotency (integration_slug, idempotency_key)` |
| `expires_at` atual | default `now() + 90 days` (não 30d) |
| Coluna de provider | **`integration_slug`** (não `provider`) |

## Decisões aplicadas

1. **Mantemos `integration_slug`** — não renomear; é a coluna canônica.
2. **`expires_at` permanece 90d** por compatibilidade. TTL Inbox v2 = 30d será aplicado por `fn_inbound_expire(interval '30 days')` que marca `process_status='expired'` independente do `expires_at` atual; nada é deletado.
3. **CONCURRENTLY obrigatório** para todos os índices novos (regra >100k linhas OU >100MB não atingida, mas conservador: tabela é write-heavy).
4. **Migration `b` (índices)** roda fora de transação. Cada `CREATE INDEX` validado pós-execução.
5. **`fn_feature_flag_enabled`** com 2º argumento `uuid` nullable; resolução org-específica > global > `false`.

## Arquivos

- `01_phase0_a_schema.sql` — DDL transacional (colunas + tabelas + seed)
- `02_phase0_b_indexes.sql` — `CREATE INDEX CONCURRENTLY` (fora de transação)
- `03_phase0_c_functions.sql` — RPCs e funções (transacional)
- `99_phase0_ROLLBACK.sql` — rollback completo Fase 0
- `phase1_webhook_patch.md` — diff conceitual do `suvsign-webhook` (Fase 1)
- `validation_queries.sql` — queries de verificação pós-deploy

## Checklist pré-deploy

- [ ] Snapshot manual no painel Supabase < 15min antes da janela
- [ ] PITR habilitado confirmado
- [ ] Janela 22h–02h dia útil (não seg/sex)
- [ ] On-call designado
- [ ] Rollback `99_phase0_ROLLBACK.sql` revisado mentalmente
- [ ] Rodar `validation_queries.sql` seção "pre" imediatamente antes do deploy
- [ ] Confirmar zero tx > 1min no momento do deploy

## Ordem de execução na janela

1. Rodar pre-checks (validation_queries.sql §pre)
2. Aplicar `01_phase0_a_schema.sql` (espera < 5s)
3. Aplicar `02_phase0_b_indexes.sql` comando-a-comando (cada `CONCURRENTLY` espera < 30s para 26k linhas)
4. Validar índices: `select indexname, indisvalid from pg_index ...` (seção §indexes)
5. Aplicar `03_phase0_c_functions.sql` (espera < 2s)
6. Smoke test: `select fn_feature_flag_enabled('inbox_v2.ingest.suvsign', null)` deve retornar `false`
7. Deploy edge functions inertes
8. **PARAR** — Fase 1 só após 24h de observação sem regressão

## Rollback

Se qualquer passo falhar:
1. Em caso de índice `INVALID`: `REINDEX INDEX CONCURRENTLY <name>` ou `DROP INDEX CONCURRENTLY <name>` e re-tentar.
2. Em caso de falha em a/c: rodar `99_phase0_ROLLBACK.sql` (idempotente, com `IF EXISTS`).
3. Feature flags ficam `enabled=false` por padrão — nenhuma alteração de comportamento mesmo sem rollback.
