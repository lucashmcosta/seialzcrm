-- Ajuste fino da função de busca semântica
-- Muda threshold de 0.7 para 0.65 (maior recall)
-- Muda match_count de 5 para 10 (mais contexto)

CREATE OR REPLACE FUNCTION public.search_knowledge_chunks(
  query_embedding vector(1536),
  org_id UUID,
  agent_id_filter UUID DEFAULT NULL,
  match_threshold DOUBLE PRECISION DEFAULT 0.65,
  match_count INTEGER DEFAULT 10
)
RETURNS TABLE (
  id UUID,
  item_id UUID,
  content TEXT,
  title TEXT,
  content_type TEXT,
  similarity DOUBLE PRECISION
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
    ki.title,
    ki.type as content_type,
    (1 - (kc.embedding <=> query_embedding))::FLOAT as similarity
  FROM public.knowledge_chunks kc
  JOIN public.knowledge_items ki ON ki.id = kc.item_id
  WHERE ki.organization_id = org_id
    AND ki.status = 'published'
    AND (agent_id_filter IS NULL OR ki.agent_id = agent_id_filter OR ki.agent_id IS NULL)
    AND (1 - (kc.embedding <=> query_embedding)) > match_threshold
  ORDER BY kc.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;