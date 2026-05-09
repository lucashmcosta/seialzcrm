## Phase 4 — Loop-guard + UI admin (pulando re-teste no Kommo)

Status: backend E2E já validado internamente (event → job → handler → PATCH Kommo). Falha foi 400 "Not enough rights" do lado da Kommo, fora do nosso escopo. Seguimos.

### 1. Loop-guard no `kommo-migrate`

Problema: importer faz INSERT/UPDATE em massa de contatos/oportunidades. Cada linha dispara o trigger `fn_publish_integration_event` → cria evento outbound → worker tenta empurrar de volta pra Kommo → loop infinito de milhares de jobs.

Solução: criar 2 RPCs `SECURITY DEFINER` que rodam dentro de uma transação com `SET LOCAL app.skip_event_emit = 'true'` e fazem o upsert em lote:
- `rpc_kommo_bulk_upsert_contacts(p_org uuid, p_rows jsonb)`
- `rpc_kommo_bulk_upsert_opportunities(p_org uuid, p_rows jsonb)`

O trigger `fn_publish_integration_event` já checa `current_setting('app.skip_event_emit', true)` — só precisamos garantir que o flag esteja setado durante o import.

Refatorar `kommo-migrate/index.ts` pra chamar essas RPCs em vez do `.upsert()` direto do supabase-js.

### 2. UI admin: aba "Outbound" no detalhe da integração Kommo

Em `src/pages/admin/AdminIntegrationDetail.tsx`, adicionar aba "Outbound" (visível só pro slug `kommo`) com:

- **Toggle "Sincronizar alterações pra Kommo"** — persiste em `organization_integrations.config_values.outbound_enabled`. Worker já checa essa flag antes de processar.
- **Lista dos últimos 20 jobs** (`integration_jobs` filtrado por org + slug=`kommo`), com colunas: timestamp, evento, entidade, status (success/transient/permanent), HTTP status, duração, botão "Ver payload" (abre dialog com `request_payload` + `response_payload`).
- **Botão "Reprocessar"** em jobs com status `permanent` ou `transient` esgotado — reseta `attempts=0` e `next_attempt_at=now()`.

Sem mudar layout global — usa `AdminLayout` que já está lá, sem `p-8` extra, header só com título.

### 3. O que NÃO faço nesta fase
- Não re-testo PATCH na Kommo (token Blueviza sem permissão de escrita — bloqueio externo)
- Não configuro `stage_mapping` (próxima fase, junto com wizard)
- Não mexo na Campoar ainda

### Detalhes técnicos
- RPCs ficam em `public` schema, `SECURITY DEFINER`, `SET search_path = public`, com check `has_role(auth.uid(), 'admin')` ou validação de service_role
- Aba Outbound só renderiza se `integration.slug === 'kommo'`
- Query dos jobs com `react-query`, refetch a cada 10s
- Reprocessar usa um RPC simples `rpc_retry_integration_job(p_job_id uuid)` que valida org via RLS

### Próxima fase (5)
Wizard pra configurar `stage_mapping` + replicar setup pra Campoar + validar `opportunity.stage_changed`.