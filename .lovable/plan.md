

## Migration 4 — SQL Final

Uma única migration com:

1. **DROP** das 2 policies existentes (nomes exatos confirmados via `pg_policies`)
2. **CREATE** de 4 policies granulares (SELECT/INSERT/UPDATE/DELETE) para `messages` e `message_threads` usando `organization_id = ANY(current_user_org_ids())`
3. **CREATE FUNCTION** `rpc_list_message_threads` em `LANGUAGE plpgsql`, `SECURITY DEFINER`, sem `SET row_security = 'off'`, com `RAISE EXCEPTION 'ACCESS_DENIED'` e `is_unread` usando COALESCE conforme aprovado
4. **GRANT/REVOKE** com assinatura completa

### SQL exato a ser aplicado

```sql
-- ==========================================
-- 1. DROP existing ALL policies
-- ==========================================
DROP POLICY IF EXISTS "Users can manage messages in their org" ON messages;
DROP POLICY IF EXISTS "Users can manage message threads in their org" ON message_threads;

-- ==========================================
-- 2. CREATE granular RLS policies - messages
-- ==========================================
CREATE POLICY "messages_select" ON messages FOR SELECT TO authenticated
  USING (organization_id = ANY(current_user_org_ids()));

CREATE POLICY "messages_insert" ON messages FOR INSERT TO authenticated
  WITH CHECK (organization_id = ANY(current_user_org_ids()));

CREATE POLICY "messages_update" ON messages FOR UPDATE TO authenticated
  USING (organization_id = ANY(current_user_org_ids()))
  WITH CHECK (organization_id = ANY(current_user_org_ids()));

CREATE POLICY "messages_delete" ON messages FOR DELETE TO authenticated
  USING (organization_id = ANY(current_user_org_ids()));

-- ==========================================
-- 3. CREATE granular RLS policies - message_threads
-- ==========================================
CREATE POLICY "message_threads_select" ON message_threads FOR SELECT TO authenticated
  USING (organization_id = ANY(current_user_org_ids()));

CREATE POLICY "message_threads_insert" ON message_threads FOR INSERT TO authenticated
  WITH CHECK (organization_id = ANY(current_user_org_ids()));

CREATE POLICY "message_threads_update" ON message_threads FOR UPDATE TO authenticated
  USING (organization_id = ANY(current_user_org_ids()))
  WITH CHECK (organization_id = ANY(current_user_org_ids()));

CREATE POLICY "message_threads_delete" ON message_threads FOR DELETE TO authenticated
  USING (organization_id = ANY(current_user_org_ids()));

-- ==========================================
-- 4. CREATE RPC function
-- ==========================================
CREATE OR REPLACE FUNCTION rpc_list_message_threads(
  p_organization_id uuid,
  p_status text DEFAULT NULL,
  p_channels text[] DEFAULT NULL,
  p_assigned_user_id uuid DEFAULT NULL,
  p_unassigned_only boolean DEFAULT false,
  p_cursor_updated_at timestamptz DEFAULT NULL,
  p_cursor_id uuid DEFAULT NULL,
  p_limit integer DEFAULT 50
)
RETURNS TABLE (
  id uuid,
  contact_id uuid,
  contact_name text,
  contact_phone text,
  channel text,
  subject text,
  status text,
  last_message_id uuid,
  last_message_content text,
  last_message_direction text,
  last_message_at timestamptz,
  last_inbound_at timestamptz,
  whatsapp_last_inbound_at timestamptz,
  needs_human_attention boolean,
  agent_typing boolean,
  awaiting_button_response boolean,
  assigned_user_id uuid,
  assigned_user_name text,
  updated_at timestamptz,
  created_at timestamptz,
  is_unread boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  -- Explicit access check
  IF NOT EXISTS (
    SELECT 1 FROM user_organizations uo
    WHERE uo.organization_id = p_organization_id
      AND uo.user_id = current_user_id()
      AND uo.is_active = true
  ) THEN
    RAISE EXCEPTION 'ACCESS_DENIED' USING ERRCODE = 'P0002';
  END IF;

  RETURN QUERY
  SELECT
    mt.id,
    mt.contact_id,
    c.full_name AS contact_name,
    c.phone AS contact_phone,
    mt.channel,
    mt.subject,
    mt.status,
    mt.last_message_id,
    mt.last_message_content,
    mt.last_message_direction,
    mt.last_message_at,
    mt.last_inbound_at,
    mt.whatsapp_last_inbound_at,
    mt.needs_human_attention,
    mt.agent_typing,
    mt.awaiting_button_response,
    mt.assigned_user_id,
    u.full_name AS assigned_user_name,
    mt.updated_at,
    mt.created_at,
    CASE
      WHEN mt.last_message_direction = 'inbound'
        AND COALESCE(mt.last_inbound_at, mt.whatsapp_last_inbound_at) IS NOT NULL
        AND (
          mtr.last_read_at IS NULL
          OR COALESCE(mt.last_inbound_at, mt.whatsapp_last_inbound_at) > mtr.last_read_at
        )
      THEN true
      ELSE false
    END AS is_unread
  FROM message_threads mt
  INNER JOIN contacts c
    ON c.id = mt.contact_id
    AND c.organization_id = mt.organization_id
    AND c.deleted_at IS NULL
  LEFT JOIN users u ON u.id = mt.assigned_user_id
  LEFT JOIN message_thread_reads mtr
    ON mtr.thread_id = mt.id
    AND mtr.user_id = current_user_id()
  WHERE mt.organization_id = p_organization_id
    AND (p_status IS NULL OR mt.status = p_status)
    AND (p_channels IS NULL OR mt.channel = ANY(p_channels))
    AND (NOT p_unassigned_only OR mt.assigned_user_id IS NULL)
    AND (p_assigned_user_id IS NULL OR mt.assigned_user_id = p_assigned_user_id)
    AND (p_cursor_updated_at IS NULL
         OR (mt.updated_at, mt.id) < (p_cursor_updated_at, p_cursor_id))
  ORDER BY mt.updated_at DESC, mt.id DESC
  LIMIT p_limit;
END;
$$;

-- ==========================================
-- 5. GRANT/REVOKE with full signature
-- ==========================================
GRANT EXECUTE ON FUNCTION rpc_list_message_threads(
  uuid, text, text[], uuid, boolean, timestamptz, uuid, integer
) TO authenticated;

REVOKE EXECUTE ON FUNCTION rpc_list_message_threads(
  uuid, text, text[], uuid, boolean, timestamptz, uuid, integer
) FROM anon, public;
```

### Migration 3 — Backfill (SQL manual, entregue no chat)

Será entregue como texto logo após aplicação da Migration 4.

### Arquivo afetado

| Arquivo | Mudança |
|---------|--------|
| Nova migration SQL | RLS rewrite + RPC + GRANT/REVOKE |

