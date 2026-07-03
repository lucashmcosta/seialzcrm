
# Fase 0 — Módulo Mensagens/Atendimento (Plano Revisado v2)

Incorpora os 4 ajustes solicitados: índice `CONCURRENTLY`, backfill conservador de `messages.endpoint_id`, triggers em shadow mode, enum sem default implícito.

---

## Sequência final de PRs

| PR | Escopo | Reversibilidade | Janela |
|----|--------|----------------|--------|
| **PR 1** | Segurança: Twilio sync signature, trigger `endpoint_org_mismatch`, índice `CONCURRENTLY` | Alta (flag + DROP INDEX/TRIGGER) | Qualquer |
| **PR 2A** | Backfill `message_threads.primary_endpoint_id` (só) + relatório | Alta (não destrutivo) | Qualquer |
| **PR 2B** | Backfill `messages.endpoint_id` **conservador** + relatório | Alta (rastreado por audit) | Qualquer |
| **PR 2C** | Enum `endpoint_purpose` (após reclassificar `other`) | Média (rollback = `TYPE text`) | Baixo tráfego |
| **PR 3A** | Realtime frontend (filtros `thread_id`, dedupe temp, canal notifs) | Alta (revert código) | Qualquer |
| **PR 3B** | Trigger orquestrador **shadow mode** (log-only, sem UPDATE real) | Alta (log-only) | Qualquer |
| **PR 3C** | Cutover: promover shadow para produção + drop dos antigos | Média (recriar antigos) | Baixo tráfego |

Total: 7 deploys revisáveis.

---

## PR 1 — Segurança e integridade

### 1.1 `twilio-whatsapp-webhook` — validação síncrona

**Mudanças:**
- Após insert em `integration_inbound_events` (permanece antes, é log seguro), executar HMAC-SHA1 síncrono contra 3 URLs candidates (canonical/forwarded/internal).
- Se **nenhum bater**:
  - Marcar `signature_valid=false`, `matched_candidate_label='none'`.
  - Se `TWILIO_SIGNATURE_ENFORCE='true'` (env): retornar **401** antes de qualquer escrita em `messages`/`message_threads`/`contacts`/`activities`/`notifications`.
  - Se flag `false`: log-only (shadow), continuar processando (comportamento atual).
- Se bater: marcar `signature_valid=true`, `matched_candidate_label=<label>`, continuar.

**Deploy:**
1. Ship com `TWILIO_SIGNATURE_ENFORCE=false` (shadow).
2. Observar `integration_inbound_events` por 24h: contar `signature_valid=false` legítimos (bug de canonical URL) vs suspeitos.
3. Se taxa de `false` < 0.1% e todos justificáveis → setar `TWILIO_SIGNATURE_ENFORCE=true`.

**Rollback:** setar `TWILIO_SIGNATURE_ENFORCE=false` (efeito imediato, sem redeploy).

**Riscos:**
- URL canonical divergindo (Cloudflare, custom domain) → falsos negativos. Mitigado pelos 3 candidates + shadow mode.

**Pré-checks:**
```sql
SELECT signature_valid, count(*) FROM integration_inbound_events
WHERE integration_slug='twilio-whatsapp' AND created_at > now()-'7 days'::interval
GROUP BY 1;
```

**Pós-checks:** mesma query após 24h shadow. Métrica alvo: >99.9% `true`.

---

### 1.2 Trigger `fn_validate_thread_endpoint_org`

```sql
CREATE OR REPLACE FUNCTION public.fn_validate_thread_endpoint_org()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE ep_org uuid;
BEGIN
  IF NEW.primary_endpoint_id IS NULL THEN RETURN NEW; END IF;
  SELECT organization_id INTO ep_org
    FROM communication_endpoints
   WHERE id = NEW.primary_endpoint_id;
  IF ep_org IS NULL THEN
    RAISE EXCEPTION 'endpoint_not_found: %', NEW.primary_endpoint_id
      USING ERRCODE='23514';
  END IF;
  IF ep_org <> NEW.organization_id THEN
    RAISE EXCEPTION 'endpoint_org_mismatch: endpoint % (org %) != thread org %',
      NEW.primary_endpoint_id, ep_org, NEW.organization_id
      USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER trg_validate_thread_endpoint_org
  BEFORE INSERT OR UPDATE OF primary_endpoint_id, organization_id
  ON public.message_threads
  FOR EACH ROW EXECUTE FUNCTION public.fn_validate_thread_endpoint_org();
```

**Pré-check (bloqueante):**
```sql
SELECT t.id, t.organization_id AS thread_org, e.organization_id AS ep_org
FROM message_threads t
JOIN communication_endpoints e ON e.id = t.primary_endpoint_id
WHERE t.organization_id <> e.organization_id;
```
Se retornar linhas: **abortar** e reportar; corrigir manualmente antes da migration.

**Rollback:** `DROP TRIGGER trg_validate_thread_endpoint_org ON message_threads; DROP FUNCTION fn_validate_thread_endpoint_org;`

**Riscos:** SECURITY DEFINER exige `search_path` explícito (incluído).

---

### 1.3 Índice composto — decisão sobre `CONCURRENTLY`

**Situação técnica:** Supabase migrations no Lovable rodam dentro de transação (`BEGIN;...COMMIT`). `CREATE INDEX CONCURRENTLY` **não pode** rodar em transação (`ERROR: CREATE INDEX CONCURRENTLY cannot run inside a transaction block`).

**Decisão:** rodar em **duas migrations separadas** para permitir CONCURRENTLY:

**Migration 1.3a** — apenas o statement CONCURRENTLY (isolado):
```sql
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_threads_org_status_lastmsg
  ON public.message_threads (organization_id, status, last_message_at DESC NULLS LAST)
  INCLUDE (contact_id, primary_endpoint_id, assigned_user_id);
```

**Fallback se runner rejeitar CONCURRENTLY:** usar `CREATE INDEX` normal. Tabela tem 12.667 linhas / 53 MB — bloqueio esperado < 2s. Aceitável em janela de baixo tráfego. Documentar no PR qual foi usado.

**Pré-check (baseline EXPLAIN):**
```sql
EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
SELECT id, contact_id, primary_endpoint_id, assigned_user_id, last_message_at
FROM message_threads
WHERE organization_id = '<org-real>' AND status IN ('open','awaiting_client','resolved')
ORDER BY last_message_at DESC NULLS LAST
LIMIT 50;
```
Salvar plano + buffers no PR.

**Pós-check:** mesma query, comparar `Execution Time`, `Buffers: shared hit/read`, e confirmar `Index Scan using idx_threads_org_status_lastmsg`.

**Rollback:** `DROP INDEX CONCURRENTLY idx_threads_org_status_lastmsg;`

**Riscos:** `CONCURRENTLY` pode falhar deixando índice `INVALID`; pós-check inclui `SELECT indisvalid FROM pg_index WHERE indexrelid='...'::regclass`.

---

## PR 2A — Backfill `message_threads.primary_endpoint_id`

**Pré-check:**
```sql
SELECT count(*) FILTER (WHERE primary_endpoint_id IS NULL) AS null_before,
       count(*) AS total FROM message_threads;
```

**Backfill (idempotente):**
```sql
WITH latest AS (
  SELECT DISTINCT ON (m.thread_id) m.thread_id, m.endpoint_id
    FROM messages m
   WHERE m.endpoint_id IS NOT NULL
   ORDER BY m.thread_id, m.sent_at DESC
)
UPDATE message_threads t
   SET primary_endpoint_id = l.endpoint_id
  FROM latest l
 WHERE t.id = l.thread_id AND t.primary_endpoint_id IS NULL;
```

**Pós-check:** relatório final = `{null_before, updated, null_after, examples: 10 threads still null}`.

**Rollback:** não aplicável (dado incremental; se catastrófico, snapshot backup do dia).

**Riscos:** trigger de PR1.2 bloqueia se última mensagem tem endpoint de outra org → capturar erros e reportar (não abortar batch inteiro; usar CTE por org).

---

## PR 2B — Backfill `messages.endpoint_id` (**conservador, revisado**)

**Nova regra:** só backfill se **exatamente 1 endpoint distinto** existe na thread.

**Método A — Threads unívocas (alta confiança):**
```sql
WITH thread_endpoints AS (
  SELECT thread_id, array_agg(DISTINCT endpoint_id) FILTER (WHERE endpoint_id IS NOT NULL) AS eps
    FROM messages
   GROUP BY thread_id
),
single_ep AS (
  SELECT thread_id, eps[1] AS endpoint_id
    FROM thread_endpoints
   WHERE array_length(eps, 1) = 1
)
UPDATE messages m
   SET endpoint_id = s.endpoint_id
  FROM single_ep s
 WHERE m.thread_id = s.thread_id AND m.endpoint_id IS NULL;
```

**Método B — provider_external_ids lookup (alta confiança):**
Só se tabela `communication_endpoints` tem `provider_external_ids` populado com padrão determinístico (auditar antes; se não, pular).

**Métodos rejeitados nesta fase:**
- Thread com >1 endpoint → **manter NULL**, listar em relatório.
- Thread sem nenhum endpoint conhecido → **manter NULL**, listar em relatório.
- **Nunca** usar `thread.primary_endpoint_id` cegamente (Meta Coexistence + migração Twilio→Meta + números pessoais podem ter múltiplos endpoints por thread historicamente).

**Relatório de confiança:**
```
Método A (thread com endpoint único): X mensagens atualizadas
Método B (provider lookup): Y mensagens atualizadas
Manteve NULL — thread multi-endpoint: Z mensagens (W threads)
Manteve NULL — sem evidência: K mensagens (J threads)
Exemplos multi-endpoint: [thread_id, endpoints, count por endpoint]
```

**Pré-check bloqueante:**
```sql
SELECT count(*) FROM messages WHERE endpoint_id IS NULL;
-- Distribuição por thread:
SELECT array_length(eps, 1) AS n_eps, count(*) AS n_threads
FROM (SELECT thread_id, array_agg(DISTINCT endpoint_id) FILTER (WHERE endpoint_id IS NOT NULL) AS eps
      FROM messages GROUP BY thread_id) x GROUP BY 1 ORDER BY 1;
```

**Rollback:** log de mudanças em tabela `backfill_endpoint_id_log_2026_XX` (thread_id, message_id, old_null=true, new_endpoint_id, method). Rollback = `UPDATE messages SET endpoint_id=NULL WHERE id IN (SELECT message_id FROM log)`.

---

## PR 2C — Enum `endpoint_purpose`

**Pré-check bloqueante:**
```sql
SELECT purpose, count(*), array_agg(DISTINCT integration_slug) AS slugs
FROM communication_endpoints GROUP BY purpose ORDER BY 2 DESC;
```

**Passo 1 — Reclassificação manual de `other` e NULL:**
Gerar CSV com `id, label, display_name, integration_slug, phone_number, purpose_current` e propor `purpose_novo`. **Aguardar aprovação humana** antes de aplicar UPDATEs. Nunca fallback silencioso para `sales`.

**Passo 2 — Migration enum:**
```sql
-- 1. Criar enum
CREATE TYPE public.endpoint_purpose AS ENUM (
  'sales','customer_service','support','legal','finance',
  'operations','marketing','collections',
  'sales_personal','vendor_personal','legal_personal'
);

-- 2. Validar zero 'other' e zero NULL (abortar se falhar)
DO $$
DECLARE bad int;
BEGIN
  SELECT count(*) INTO bad FROM communication_endpoints
   WHERE purpose IS NULL OR purpose='other' OR purpose NOT IN
     ('sales','customer_service','support','legal','finance','operations',
      'marketing','collections','sales_personal','vendor_personal','legal_personal');
  IF bad > 0 THEN
    RAISE EXCEPTION 'reclassify_first: % endpoints com purpose inválido', bad;
  END IF;
END $$;

-- 3. Cast
ALTER TABLE communication_endpoints
  ALTER COLUMN purpose DROP DEFAULT,  -- garantir zero default implícito
  ALTER COLUMN purpose TYPE public.endpoint_purpose USING purpose::public.endpoint_purpose,
  ALTER COLUMN purpose SET NOT NULL;
-- NÃO setar DEFAULT — todo INSERT precisa passar purpose explicitamente.
```

**Frontend:** validação Zod `z.enum([...])` obrigatória em formulários de criação de endpoint. Sem fallback.

**Rollback:**
```sql
ALTER TABLE communication_endpoints
  ALTER COLUMN purpose DROP NOT NULL,
  ALTER COLUMN purpose TYPE text USING purpose::text;
DROP TYPE public.endpoint_purpose;
```

**Riscos:**
- Formulários existentes de criação de endpoint podem enviar payload sem `purpose` → falharão com NOT NULL. Auditar `EndpointForm` / dialogs antes.

---

## PR 3A — Realtime frontend

**Escopo:**
- `MessagesList.tsx` / `MobileMessagesList.tsx` / `ContactMessages.tsx`: listeners de `messages` filtrar por `thread_id=eq.${selectedThreadId}` no chat aberto (não por org).
- Optimistic dedupe: usar `client_temp_id` (adicionar campo em `messages` como opcional se não existir; caso contrário matching por `content + sent_at ± 5s + direction`). Remover só o temp casado.
- Trocar `setMessages(next)` por `setMessages(prev => ...)` em enrich handlers.
- Canal `notifications` → `notifications-${userId}` com filter `user_id=eq.${userId}`.

**Pré-check:** DevTools Network > WS: contar frames por minuto no chat aberto.

**Pós-check:** mesma medição. Alvo: redução >80% em orgs com >10 threads ativas.

**Rollback:** revert commit.

**Riscos:** perda de eventos ao trocar thread — mitigado pelo refetch inicial de `useInboxThreadMessages`.

---

## PR 3B — Trigger orquestrador em **shadow mode**

**Novo trigger `fn_thread_sync_shadow`:**
- `AFTER INSERT ON messages`.
- **Não faz UPDATE em `message_threads`**.
- Escreve em tabela nova `thread_sync_shadow_log(message_id, thread_id, computed_status, computed_last_message_at, computed_assigned_user_id, actual_status_after, delta_json, created_at)`.
- Após alguns segundos, lê o estado real da thread (que foi atualizado pelos triggers antigos) e compara. Grava divergências.

**Métricas de validação (após 48h shadow):**
```sql
SELECT count(*) FILTER (WHERE delta_json='{}'::jsonb) AS matches,
       count(*) FILTER (WHERE delta_json<>'{}'::jsonb) AS mismatches,
       jsonb_agg(DISTINCT jsonb_object_keys(delta_json)) AS diverging_fields
FROM thread_sync_shadow_log WHERE created_at > now()-'48 hours'::interval;
```
Alvo: >99.5% match. Diferenças esperadas: apenas race conditions dos triggers antigos (que é o bug que estamos corrigindo).

**Rollback:** `DROP TRIGGER + DROP FUNCTION + DROP TABLE thread_sync_shadow_log`. Sem impacto de produção (shadow-only).

---

## PR 3C — Cutover triggers

**Pré-check bloqueante:** métricas do PR 3B >99.5% match nos últimos 48h.

**Passos (em uma única transação):**
1. `CREATE OR REPLACE FUNCTION fn_thread_sync_orchestrator` (versão ativa).
2. `CREATE TRIGGER trg_thread_sync_orchestrator AFTER INSERT ON messages ...`.
3. `DROP TRIGGER trg_inbound_message_status ON messages;`
4. `DROP TRIGGER trg_messages_smart_reopen ON messages;`
5. `DROP TRIGGER trg_update_thread_last_message ON messages;`
6. Manter functions antigas por 7 dias (não drop) para rollback rápido.

**Regras do orquestrador (único UPDATE por INSERT):**
- `last_message_id/at/content/direction`: sempre.
- Status:
  - `inbound` + status atual em (`resolved`,`awaiting_client`) → `open`.
  - `outbound` humano (sender_type='user', não agente IA) → `awaiting_client`.
  - `outbound` agente IA → sem mudança de status.
- `assigned_user_id`: **nunca** sobrescrever se `NEW.direction='inbound'` e thread já tem assignee (evita round-robin destruir atribuição manual). Reassign apenas se `assigned_user_id IS NULL` **e** houver regra explícita.
- `needs_human_attention`: **fora do escopo deste trigger** (permanece com trigger específico do agente IA).

**Rollback (dentro de 7 dias):**
```sql
BEGIN;
DROP TRIGGER trg_thread_sync_orchestrator ON messages;
CREATE TRIGGER trg_inbound_message_status ...; -- recriar dos backups
CREATE TRIGGER trg_messages_smart_reopen ...;
CREATE TRIGGER trg_update_thread_last_message ...;
COMMIT;
```

**Riscos:** inserts concorrentes durante cutover — mitigado por transação única.

---

## Critérios de aceite consolidados

| Item | Verificação |
|------|-------------|
| Twilio inválido → 401 antes de escrita | `curl` com signature errada + `SELECT count(*) FROM messages WHERE created_at > <t>` |
| Cross-org endpoint bloqueado | `UPDATE message_threads SET primary_endpoint_id=<outra_org>` → erro `endpoint_org_mismatch` |
| Índice usado | EXPLAIN mostra `Index Scan using idx_threads_org_status_lastmsg` |
| Zero `purpose='other'` ou NULL | `SELECT count(*) WHERE purpose='other' OR purpose IS NULL` = 0 |
| Threads sem `primary_endpoint_id` reduzidas | Relatório PR 2A |
| Mensagens sem `endpoint_id` reduzidas **conservadoramente** | Relatório PR 2B com quebra por método |
| Realtime chat aberto isolado por thread | DevTools WS: só frames com `thread_id=eq.<atual>` |
| Optimistic dedupe correto | Enviar 2 mensagens rápidas → 2 temps → 2 substituições corretas |
| Trigger orquestrador shadow >99.5% match | Query em `thread_sync_shadow_log` |
| Inbound em resolved reabre sem race | Log de UPDATE único por INSERT |
| Typecheck limpo | `tsgo` verde após cada PR |

---

## Aprovação

Confirma este plano revisado v2? Se sim, começo por **PR 1** (edge function Twilio com flag off + trigger endpoint + índice CONCURRENTLY em migrations separadas), rodando os pré-checks primeiro.
