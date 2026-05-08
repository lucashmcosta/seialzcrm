## Phase 3 — Sync outbound Seialz → Kommo

Hoje a integração Kommo é unidirecional **Kommo → Seialz** (import inicial via wizard). Phase 3 fecha o ciclo: quando o usuário mexe num contato/oportunidade dentro do Seialz, o sistema empurra a mudança de volta pro Kommo via API, usando o pipeline de eventos/jobs já validado.

### Escopo (MVP)

Eventos cobertos nesta fase:

| Event type | Ação no Kommo |
|---|---|
| `contact.created` | POST `/api/v4/contacts` (cria) e grava `source_external_id` |
| `contact.updated` | PATCH `/api/v4/contacts/{id}` (nome, telefones, emails) |
| `opportunity.created` | POST `/api/v4/leads` (cria com pipeline/stage mapeados) |
| `opportunity.updated` | PATCH `/api/v4/leads/{id}` (título, valor, responsável) |
| `opportunity.stage_changed` | PATCH `/api/v4/leads/{id}` com novo `status_id` |

Fora do escopo agora (fica pra Phase 4): mensagens (`message.outbound_sent`), tarefas, notas, custom fields, deletes.

### Como funciona

```text
UPDATE no Seialz
   ↓ (trigger já existente)
integration_events (event_type=opportunity.updated)
   ↓ (rpc_enqueue_jobs já existente)
integration_jobs (status=pending, integration_slug=kommo, target_action=upsert)
   ↓ (worker cron a cada 30s)
integration-worker chama handler kommo:upsert
   ↓
Lê organization_integrations.config_values (subdomain, access_token)
Lê source_external_id da entidade pra decidir POST vs PATCH
Chama API Kommo, classifica resposta (Success/Retryable/Permanent/Conflict)
Persiste external_id de volta na entidade local (em INSERT)
```

### Implementação

**1. Subscriptions automáticas por org**
- Migration que insere, pra toda org com Kommo ativo, 5 linhas em `integration_subscriptions`:
  - `(integration_slug='kommo', event_type=<5 acima>, target_action='upsert', is_active=true)`
- Trigger em `organization_integrations` que cria/remove essas subscriptions quando a org ativa/desativa Kommo.

**2. Handler `kommo:upsert`** em `supabase/functions/_shared/integration-handlers/kommo.ts`
- Lê credenciais via `ctx.supabase.from('organization_integrations')` filtrando por `integration.slug='kommo'`.
- Sanitiza subdomain (regra existente em memória).
- Switch por `event.event_type` montando o body Kommo correto.
- Usa `fetchWithClassification` (já existe) pra HTTP + classificação automática (429/5xx → Retryable, 4xx → Permanent).
- Em criação bem-sucedida: UPDATE da entidade local setando `source='kommo'` e `source_external_id=<kommo_id>`.
- Registra em `registry.ts`: `register("kommo", "upsert", kommoUpsertHandler)`.

**3. Loop-guard**
- Já temos `source='kommo'` nos registros importados. O producer de eventos vai precisar de um filtro: **se o UPDATE foi originado pelo próprio handler do Kommo (mirror import) não dispara evento outbound**.
- Solução: o handler grava com `SET LOCAL app.skip_event_emit = 'true'`, e os triggers de evento checam essa flag. Alternativa mais simples: comparar `updated_by` — se for o user de sistema da integração, pula.
- Decisão recomendada: flag GUC (`app.skip_event_emit`) — mais explícita e evita falso-positivo.

**4. Mapeamento de pipeline/stage**
- Reusa `config_values.stage_mapping` (Seialz stage_id → Kommo status_id) que já existe do wizard de import.
- Se um stage não estiver mapeado: classification=Permanent com erro descritivo (aparece em `integration_audit_logs`).

**5. UI mínima (admin)**
- Em `Admin → Integrações → Kommo`, adicionar toggle "Sincronizar mudanças de volta pro Kommo (outbound)" que ativa/desativa as 5 subscriptions de uma vez.
- Listar últimos 20 jobs Kommo da org (status, event_type, http_status, last_error) reusando `integration_jobs` + `integration_audit_logs`.

### Detalhes técnicos

- **Idempotência**: `idempotency_key` já é gerado por evento+entidade no producer. POST de criação precisa dedupe extra: antes de criar no Kommo, verificar se `source_external_id` já existe localmente (corrida entre 2 jobs do mesmo evento).
- **Retry**: usa o backoff exponencial já implementado no worker (max_attempts=5).
- **Auth Kommo**: long-lived token guardado em `config_values.access_token`. Se receber 401 → Permanent + log claro pro admin reconectar.
- **Rate limit Kommo**: 7 req/s por subdomain. O worker processa BATCH_SIZE=10 em paralelo — ok pra essa fase, monitorar via audit logs.

### Validação (igual ao Phase 1+2)

1. Org de teste com Kommo ativo.
2. Editar título de uma oportunidade no Seialz.
3. Esperar ≤30s e conferir:
   - `integration_jobs` virou `success`
   - `integration_audit_logs` mostra HTTP 200 da Kommo API
   - Lead na Kommo (visualmente) tem o título novo

### O que NÃO muda

- Producer de eventos (já cobre os 5 event_types)
- Worker (handler novo se registra automático)
- Webhook handler genérico (continua funcionando em paralelo)
- Import inicial Kommo → Seialz (intocado)

### Próximos passos sugeridos (Phase 4+)

- `message.outbound_sent` → criar nota no lead Kommo
- Sync de tasks
- Sync bidirecional de custom fields
- Webhook reverso da Kommo pra near-realtime (hoje só temos polling no import)
