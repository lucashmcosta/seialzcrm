-- ==============================================
-- Migração: Voyage AI Embeddings (1024 dimensões)
-- ==============================================

-- 1. LIMPAR chunks existentes (têm embeddings com dimensão incorreta)
DELETE FROM knowledge_chunks;

-- 2. Marcar knowledge_items para reprocessamento (usar 'processing' que é valor válido do check constraint)
UPDATE knowledge_items SET status = 'processing' WHERE status = 'published';

-- 3. Alterar dimensão da coluna para 1024 (Voyage AI voyage-3-lite)
ALTER TABLE knowledge_chunks 
  ALTER COLUMN embedding TYPE vector(1024);

-- 4. Recriar índice IVFFlat com nova dimensão
DROP INDEX IF EXISTS idx_knowledge_chunks_embedding;
CREATE INDEX idx_knowledge_chunks_embedding ON knowledge_chunks 
  USING ivfflat (embedding vector_cosine_ops) 
  WITH (lists = 100);

-- 5. Atualizar RPC search_knowledge_chunks para vector(1024)
CREATE OR REPLACE FUNCTION public.search_knowledge_chunks(
  query_embedding vector(1024),
  org_id uuid,
  agent_id_filter uuid DEFAULT NULL::uuid,
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

-- 6. Atualizar RPC search_knowledge (tabela knowledge_embeddings) para vector(1024)
CREATE OR REPLACE FUNCTION public.search_knowledge(
  query_embedding vector(1024),
  org_id uuid,
  agent_id_filter uuid DEFAULT NULL::uuid,
  match_threshold double precision DEFAULT 0.65,
  match_count integer DEFAULT 10
)
RETURNS TABLE(
  id uuid,
  content text,
  content_type text,
  title text,
  metadata jsonb,
  similarity double precision
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  RETURN QUERY
  SELECT
    ke.id,
    ke.content,
    ke.content_type,
    ke.title,
    ke.metadata,
    (1 - (ke.embedding <=> query_embedding))::FLOAT as similarity
  FROM knowledge_embeddings ke
  WHERE ke.organization_id = org_id
    AND (agent_id_filter IS NULL OR ke.agent_id = agent_id_filter OR ke.agent_id IS NULL)
    AND (1 - (ke.embedding <=> query_embedding)) > match_threshold
  ORDER BY ke.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;