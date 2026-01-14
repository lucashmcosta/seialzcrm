-- Enable pgvector extension for embeddings
CREATE EXTENSION IF NOT EXISTS vector;

-- Create knowledge_embeddings table for RAG
CREATE TABLE public.knowledge_embeddings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  agent_id UUID REFERENCES ai_agents(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  content_type TEXT NOT NULL CHECK (content_type IN ('faq', 'product', 'instruction', 'policy', 'general')),
  title TEXT,
  metadata JSONB DEFAULT '{}',
  embedding vector(1536),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create index for vector similarity search
CREATE INDEX knowledge_embeddings_embedding_idx ON public.knowledge_embeddings 
USING ivfflat (embedding vector_cosine_ops)
WITH (lists = 100);

-- Create indexes for filtering
CREATE INDEX knowledge_embeddings_org_idx ON public.knowledge_embeddings(organization_id);
CREATE INDEX knowledge_embeddings_agent_idx ON public.knowledge_embeddings(agent_id);
CREATE INDEX knowledge_embeddings_type_idx ON public.knowledge_embeddings(content_type);

-- Enable RLS
ALTER TABLE public.knowledge_embeddings ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view their org knowledge" ON public.knowledge_embeddings
  FOR SELECT USING (public.user_has_org_access(organization_id));

CREATE POLICY "Users can insert their org knowledge" ON public.knowledge_embeddings
  FOR INSERT WITH CHECK (public.user_has_org_access(organization_id));

CREATE POLICY "Users can update their org knowledge" ON public.knowledge_embeddings
  FOR UPDATE USING (public.user_has_org_access(organization_id));

CREATE POLICY "Users can delete their org knowledge" ON public.knowledge_embeddings
  FOR DELETE USING (public.user_has_org_access(organization_id));

-- Service role can access all for edge functions
CREATE POLICY "Service role full access" ON public.knowledge_embeddings
  FOR ALL USING (auth.role() = 'service_role');

-- Create function for semantic search
CREATE OR REPLACE FUNCTION public.search_knowledge(
  query_embedding vector(1536),
  org_id UUID,
  agent_id_filter UUID DEFAULT NULL,
  match_threshold FLOAT DEFAULT 0.7,
  match_count INT DEFAULT 5
)
RETURNS TABLE (
  id UUID,
  content TEXT,
  content_type TEXT,
  title TEXT,
  metadata JSONB,
  similarity FLOAT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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

-- Trigger for updated_at
CREATE TRIGGER update_knowledge_embeddings_updated_at
  BEFORE UPDATE ON public.knowledge_embeddings
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();