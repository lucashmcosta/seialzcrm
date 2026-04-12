-- ============================================================================
-- Migration: Mark read-only RPCs as STABLE
--
-- PostgreSQL defaults unmarked functions to VOLATILE, which forces
-- re-execution per row. STABLE tells the planner the function returns
-- the same result for the same inputs within a single query.
--
-- All functions below are read-only (no INSERT/UPDATE/DELETE side effects).
-- ============================================================================

-- 1. rpc_list_message_threads - read-only RPC with cursor pagination
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
STABLE
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
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

-- 2. get_opportunity_stage_counts - read-only aggregation
CREATE OR REPLACE FUNCTION get_opportunity_stage_counts(org_id UUID)
RETURNS TABLE (
  stage_id UUID,
  opportunity_count BIGINT,
  total_amount NUMERIC
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    ps.id as stage_id,
    COUNT(o.id)::BIGINT as opportunity_count,
    COALESCE(SUM(o.amount), 0) as total_amount
  FROM pipeline_stages ps
  LEFT JOIN opportunities o
    ON o.pipeline_stage_id = ps.id
    AND o.organization_id = org_id
    AND o.deleted_at IS NULL
    AND o.status::text = (
      CASE ps.type
        WHEN 'won' THEN 'won'
        WHEN 'lost' THEN 'lost'
        ELSE 'open'
      END
    )
  WHERE ps.organization_id = org_id
  GROUP BY ps.id;
$$;

-- 3. search_knowledge_chunks - read-only vector search
CREATE OR REPLACE FUNCTION search_knowledge_chunks(
  query_embedding vector(1024),
  org_id uuid,
  agent_id_filter uuid DEFAULT NULL,
  match_threshold double precision DEFAULT 0.65,
  match_count integer DEFAULT 10
)
RETURNS TABLE(
  id uuid,
  item_id uuid,
  content text,
  title text,
  content_type text,
  similarity double precision
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  RETURN QUERY
  SELECT
    kc.id,
    kc.item_id,
    kc.content,
    ki.title,
    ki.type as content_type,
    (1 - (kc.embedding <=> query_embedding))::FLOAT as similarity
  FROM knowledge_chunks kc
  JOIN knowledge_items ki ON ki.id = kc.item_id
  WHERE ki.organization_id = org_id
    AND ki.status = 'published'
    AND (agent_id_filter IS NULL OR ki.agent_id = agent_id_filter OR ki.agent_id IS NULL)
    AND (1 - (kc.embedding <=> query_embedding)) > match_threshold
  ORDER BY kc.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

-- 4. search_knowledge_all - read-only vector search
CREATE OR REPLACE FUNCTION search_knowledge_all(
  query_embedding vector(1024),
  org_id uuid,
  match_threshold double precision DEFAULT 0.65,
  match_count integer DEFAULT 10
)
RETURNS TABLE (
  id uuid,
  item_id uuid,
  content text,
  resolved_content text,
  title text,
  category text,
  scope text,
  similarity double precision
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  RETURN QUERY
  SELECT
    kc.id,
    kc.item_id,
    kc.content,
    ki.resolved_content,
    ki.title,
    ki.category,
    ki.scope,
    (1 - (kc.embedding <=> query_embedding))::FLOAT as similarity
  FROM knowledge_chunks kc
  JOIN knowledge_items ki ON kc.item_id = ki.id
  WHERE ki.organization_id = org_id
    AND ki.is_active = true
    AND ki.status = 'published'
    AND (1 - (kc.embedding <=> query_embedding)) > match_threshold
  ORDER BY kc.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

-- 5. search_knowledge_global - read-only vector search
CREATE OR REPLACE FUNCTION search_knowledge_global(
  query_embedding vector(1024),
  org_id uuid,
  p_categories TEXT[] DEFAULT NULL,
  match_threshold double precision DEFAULT 0.65,
  match_count integer DEFAULT 10
)
RETURNS TABLE(
  id uuid,
  item_id uuid,
  content text,
  resolved_content text,
  title text,
  category text,
  similarity float
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  RETURN QUERY
  SELECT
    kc.id,
    kc.item_id,
    kc.content,
    ki.resolved_content,
    ki.title,
    ki.category,
    (1 - (kc.embedding <=> query_embedding))::FLOAT as similarity
  FROM knowledge_chunks kc
  JOIN knowledge_items ki ON kc.item_id = ki.id
  WHERE ki.organization_id = org_id
    AND ki.scope = 'global'
    AND ki.is_active = true
    AND ki.status = 'published'
    AND (1 - (kc.embedding <=> query_embedding)) > match_threshold
    AND (p_categories IS NULL OR ki.category = ANY(p_categories))
  ORDER BY kc.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

-- 6. search_knowledge_product - read-only vector search
CREATE OR REPLACE FUNCTION search_knowledge_product(
  query_embedding vector(1024),
  org_id uuid,
  p_product_id uuid,
  p_categories TEXT[] DEFAULT NULL,
  match_threshold double precision DEFAULT 0.65,
  match_count integer DEFAULT 10
)
RETURNS TABLE(
  id uuid,
  item_id uuid,
  content text,
  resolved_content text,
  title text,
  category text,
  similarity float
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  RETURN QUERY
  SELECT
    kc.id,
    kc.item_id,
    kc.content,
    ki.resolved_content,
    ki.title,
    ki.category,
    (1 - (kc.embedding <=> query_embedding))::FLOAT as similarity
  FROM knowledge_chunks kc
  JOIN knowledge_items ki ON kc.item_id = ki.id
  WHERE ki.organization_id = org_id
    AND ki.scope = 'product'
    AND ki.product_id = p_product_id
    AND ki.is_active = true
    AND ki.status = 'published'
    AND (1 - (kc.embedding <=> query_embedding)) > match_threshold
    AND (p_categories IS NULL OR ki.category = ANY(p_categories))
  ORDER BY kc.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;
