-- Create RPC to search knowledge across ALL scopes (product + global)
-- This is used when the agent doesn't have a specific productId context
CREATE OR REPLACE FUNCTION public.search_knowledge_all(
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