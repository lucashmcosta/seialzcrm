# Operations

Runbooks operacionais. Cada runbook aqui responde a um incidente/procedimento real identificado na auditoria.

## Incidentes recorrentes conhecidos

### Cron parou de rodar
1. Consultar `cron.job_run_details` para o job em questão.
2. Verificar env do vault se o job usa `Bearer <service_role>` — se rotacionado, re-executar migration.
3. Anon key inline em `integration-worker` — se anon key foi rotacionada, o cron quebra. Migrar para `get_internal_function_auth_token()` (ver `docs/audit/07-divida-tecnica.md`).

### Token Meta expirado
1. `meta-lead-ads-token-health` dispara `admin_notifications` diariamente às 08:00 UTC.
2. Ir em `/settings/integrations` → Meta Lead Ads → reconectar página.
3. Poll normaliza no próximo tick (`*/3 min`).

### Rollback Kommo
1. `kommo-rollback` reverte usando `import_logs` (40 col).
2. Não apaga `contacts`/`opportunities` diretamente — verificar necessidade adicional.

### Impersonação encerrada mas sessão persiste
1. `admin-impersonate-end` não grava `admin_audit_logs` (dívida 🟢).
2. Sessão em `impersonation_sessions` — invalidar manualmente se necessário.

### WhatsApp Twilio: assinatura HMAC inválida
1. Verificar `Auth Token` em `organization_integrations`.
2. Twilio pode ter rotacionado — atualizar em Settings.

### Rate limit Meta atingido
1. Aguardar janela (200 req/h por padrão).
2. Se persistente, revisar `meta-lead-ads-poll` — reduzir frequência.

## Health checks
- `/health` — frontend público.
- `/dev/health` — detalhado.
- Edge function `health`.
- Edge function `outbox-health` — wrapper de `fn_outbox_health_summary_internal`.

## Referências
- Dívida técnica completa: `docs/audit/07-divida-tecnica.md`.
- Cron: `docs/audit/06-cron-automacoes.md`.
