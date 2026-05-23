# Outbox Stabilization v2 — ajustes confirmados

## Ajustes do usuário aplicados
1. `fn_reap_stuck_jobs` SEM grant a authenticated. Apenas `cron`/`service_role`.
2. `admin_users` verificada: existe com 2 admins MFA. `is_admin_user()` checa essa tabela (mesma fonte do `AdminProtectedRoute`). `has_role` não existe no projeto.
3. `integration_audit_logs.organization_id` é NOT NULL → criada tabela `outbox_system_heartbeats(component pk, last_run_at, last_detail)` para heartbeat do reaper sem precisar de org.

## Migration (já aplicada com os ajustes)
- Tabela `outbox_system_heartbeats` + RLS leitura só admin.
- `is_admin_user()`, `fn_reap_stuck_jobs(int)`, `fn_outbox_health_summary()`, `fn_outbox_health_summary_internal()`, `fn_outbox_retry_job`, `fn_outbox_dismiss_job`, `fn_outbox_pause_subscription`, `fn_outbox_resume_subscription`.
- Saneamento: webhook.site subs `is_active=false`; jobs webhook.site travados → `dead_letter` + audit `dismissed`; outros jobs travados → `failed` escalonado (0 linhas).

## Próximos passos (implementação)
- Cron `outbox-reaper` a cada 1 min via insert tool, chamando `public.fn_reap_stuck_jobs(5)`.
- Corrigir `integration-worker/index.ts`: parâmetros `p_job_id`/`p_error`, try/catch em `persistResult`, fallback estrito (sem `finally` lendo banco).
- Criar `supabase/functions/outbox-health/index.ts` (autenticado por `x-health-token`).
- Criar `src/pages/admin/AdminIntegrationHealth.tsx` em `<AdminLayout>` + rota `/admin/integration-health` em `App.tsx` (lazy + `AdminProtectedRoute`) + item no `AdminSidebar`.
- Polling 10s, StatusBanner Verde/Amarelo/Vermelho, 6 MetricCards, tabs (falhas/execuções/subs ativas/pausadas), ações retry/dismiss/pausar/retomar.
- Rodar as 6 queries de validação, invocar worker, esperar 2min, reconfirmar 0 running.

## Entrega
Diff de arquivos, SQL aplicada (resumo), confirmação do cron, resultados das 6 queries, descrição da tela, checklist final SIM/NÃO para Nammux.
