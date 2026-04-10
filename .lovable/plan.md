

## Plano de Execução — Otimização de Mensagens

### Entregas

**Via Lovable (execução imediata):**
- **Migration 1** — 3 índices com `CREATE INDEX CONCURRENTLY`
- **Migration 2** — 4 colunas denormalizadas + trigger (fast path INSERT / slow path UPDATE/DELETE)
- **Migration 4** — Reescrita RLS (`ANY((SELECT current_user_org_ids()))`) + RPC `rpc_list_message_threads` com SECURITY DEFINER + GRANT/REVOKE

**Via chat (SQL para copiar):**
- **Migration 3** — Backfill batched com LOOP + FOR UPDATE SKIP LOCKED + GET DIAGNOSTICS

**Após confirmação do backfill:**
- **Frontend** — Refactor de `MessagesList.tsx` (linhas 506-596, 620-735) e `MobileMessagesList.tsx` (linhas 210-277, 354-395) para usar RPC, eliminar N+1, realtime local sem refetch

---

### Migration 1 — Índices

```sql
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_messages_thread_sent 
ON messages(thread_id, sent_at DESC) WHERE deleted_at IS NULL;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_threads_org_channel_updated 
ON message_threads(organization_id, channel, updated_at DESC, id);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_threads_unassigned 
ON message_threads(organization_id, updated_at DESC) WHERE assigned_user_id IS NULL;
```

### Migration 2 — Colunas + Trigger

- ADD COLUMN: `last_message_id uuid`, `last_message_at timestamptz`, `last_message_content text`, `last_message_direction text`
- Trigger `trg_update_thread_last_message` com:
  - **Fast path (INSERT)**: UPDATE direto comparando `NEW.sent_at >= last_message_at`, sem SELECT
  - **Slow path (UPDATE/DELETE)**: Recalcula via SELECT no messages, respeita `deleted_at IS NULL`

### Migration 3 — Backfill (SQL manual, entregue no chat)

```sql
DO $$
DECLARE
  v_rows_affected integer;
BEGIN
  LOOP
    UPDATE message_threads mt SET
      last_message_id = sub.id,
      last_message_at = sub.sent_at,
      last_message_content = LEFT(sub.content, 200),
      last_message_direction = sub.direction
    FROM (
      SELECT DISTINCT ON (m.thread_id) m.thread_id, m.id, m.sent_at, m.content, m.direction
      FROM messages m
      INNER JOIN (
        SELECT id FROM message_threads
        WHERE last_message_at IS NULL
        LIMIT 500
        FOR UPDATE SKIP LOCKED
      ) batch ON batch.id = m.thread_id
      WHERE m.deleted_at IS NULL
      ORDER BY m.thread_id, m.sent_at DESC
    ) sub
    WHERE mt.id = sub.thread_id;

    GET DIAGNOSTICS v_rows_affected = ROW_COUNT;
    RAISE NOTICE 'Batch updated: % rows', v_rows_affected;
    EXIT WHEN v_rows_affected = 0;
  END LOOP;
  RAISE NOTICE 'Backfill complete';
END;
$$;
```

Query de validação:
```sql
SELECT count(*) AS missing FROM message_threads 
WHERE last_message_at IS NULL 
AND EXISTS (SELECT 1 FROM messages WHERE thread_id = message_threads.id AND deleted_at IS NULL);
```

### Migration 4 — RLS + RPC + GRANT

- DROP + CREATE policies em `messages` e `message_threads` usando `organization_id = ANY((SELECT current_user_org_ids()))`
- CREATE FUNCTION `rpc_list_message_threads` com SECURITY DEFINER, cursor pagination `(updated_at, id)`, multi-tenant hardening nos JOINs
- GRANT EXECUTE TO authenticated / REVOKE FROM anon, public

### Frontend (após backfill confirmado)

**`MessagesList.tsx`**:
- Linhas 506-596: Substituir query + N+1 Promise.all por `supabase.rpc('rpc_list_message_threads', {...})`
- Linhas 620-735: Realtime — remover `refetchThreads()` dos listeners, substituir por setState local que atualiza thread in-place e move para topo
- Adicionar cursor state `{ updated_at, id }` para "carregar mais"

**`MobileMessagesList.tsx`**:
- Linhas 210-277: Mesma substituição por RPC
- Linhas 354-395: Mesma otimização de realtime

### Arquivos afetados

| Arquivo | Mudança |
|---------|---------|
| Migration SQL #1 | 3 índices CONCURRENTLY |
| Migration SQL #2 | 4 colunas + trigger |
| Migration SQL #3 | Backfill (manual) |
| Migration SQL #4 | RLS + RPC + GRANT |
| `src/pages/messages/MessagesList.tsx` | RPC + cursor + realtime local |
| `src/components/mobile/MobileMessagesList.tsx` | Mesmas mudanças |

