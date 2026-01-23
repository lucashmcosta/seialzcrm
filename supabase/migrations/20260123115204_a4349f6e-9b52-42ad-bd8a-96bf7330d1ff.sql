-- ============================================
-- KNOWLEDGE ITEMS (cabeçalho dos documentos)
-- ============================================
CREATE TABLE IF NOT EXISTS public.knowledge_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  agent_id UUID REFERENCES public.ai_agents(id) ON DELETE SET NULL,
  
  -- Identificação
  title TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('faq', 'product', 'policy', 'process', 'objection', 'general')),
  
  -- Status do processamento
  status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'processing', 'published', 'archived', 'error')),
  
  -- Origem do conteúdo
  source TEXT DEFAULT 'wizard' CHECK (source IN ('wizard', 'manual', 'import_txt', 'import_pdf', 'import_docx', 'import_md', 'import_url')),
  source_file_path TEXT,
  source_url TEXT,
  
  -- Metadados e erros
  metadata JSONB DEFAULT '{}',
  error_message TEXT,
  
  -- Auditoria
  created_by UUID,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- KNOWLEDGE CHUNKS (conteúdo embedado)
-- ============================================
CREATE TABLE IF NOT EXISTS public.knowledge_chunks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  item_id UUID NOT NULL REFERENCES public.knowledge_items(id) ON DELETE CASCADE,
  
  -- Conteúdo
  chunk_index INT NOT NULL,
  content TEXT NOT NULL,
  embedding vector(1536) NOT NULL,
  
  -- Metadados do chunk
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- ÍNDICES
-- ============================================
CREATE INDEX IF NOT EXISTS idx_knowledge_items_org ON public.knowledge_items(organization_id);
CREATE INDEX IF NOT EXISTS idx_knowledge_items_status ON public.knowledge_items(status);
CREATE INDEX IF NOT EXISTS idx_knowledge_items_type ON public.knowledge_items(type);
CREATE INDEX IF NOT EXISTS idx_knowledge_items_agent ON public.knowledge_items(agent_id);

CREATE INDEX IF NOT EXISTS idx_knowledge_chunks_item ON public.knowledge_chunks(item_id);
CREATE INDEX IF NOT EXISTS idx_knowledge_chunks_org ON public.knowledge_chunks(organization_id);

-- Índice vetorial para busca semântica
CREATE INDEX IF NOT EXISTS idx_knowledge_chunks_embedding ON public.knowledge_chunks 
  USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

-- ============================================
-- ROW LEVEL SECURITY
-- ============================================
ALTER TABLE public.knowledge_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.knowledge_chunks ENABLE ROW LEVEL SECURITY;

-- Policies para knowledge_items (usando user_organizations que é a tabela correta)
CREATE POLICY "Users can view own org knowledge_items" ON public.knowledge_items
  FOR SELECT USING (
    organization_id IN (
      SELECT organization_id FROM public.user_organizations 
      WHERE user_id = public.current_user_id() AND is_active = true
    )
  );

CREATE POLICY "Users can insert own org knowledge_items" ON public.knowledge_items
  FOR INSERT WITH CHECK (
    organization_id IN (
      SELECT organization_id FROM public.user_organizations 
      WHERE user_id = public.current_user_id() AND is_active = true
    )
  );

CREATE POLICY "Users can update own org knowledge_items" ON public.knowledge_items
  FOR UPDATE USING (
    organization_id IN (
      SELECT organization_id FROM public.user_organizations 
      WHERE user_id = public.current_user_id() AND is_active = true
    )
  );

CREATE POLICY "Users can delete own org knowledge_items" ON public.knowledge_items
  FOR DELETE USING (
    organization_id IN (
      SELECT organization_id FROM public.user_organizations 
      WHERE user_id = public.current_user_id() AND is_active = true
    )
  );

-- Policies para knowledge_chunks
CREATE POLICY "Users can view own org knowledge_chunks" ON public.knowledge_chunks
  FOR SELECT USING (
    organization_id IN (
      SELECT organization_id FROM public.user_organizations 
      WHERE user_id = public.current_user_id() AND is_active = true
    )
  );

CREATE POLICY "Users can insert own org knowledge_chunks" ON public.knowledge_chunks
  FOR INSERT WITH CHECK (
    organization_id IN (
      SELECT organization_id FROM public.user_organizations 
      WHERE user_id = public.current_user_id() AND is_active = true
    )
  );

CREATE POLICY "Users can update own org knowledge_chunks" ON public.knowledge_chunks
  FOR UPDATE USING (
    organization_id IN (
      SELECT organization_id FROM public.user_organizations 
      WHERE user_id = public.current_user_id() AND is_active = true
    )
  );

CREATE POLICY "Users can delete own org knowledge_chunks" ON public.knowledge_chunks
  FOR DELETE USING (
    organization_id IN (
      SELECT organization_id FROM public.user_organizations 
      WHERE user_id = public.current_user_id() AND is_active = true
    )
  );

-- ============================================
-- FUNÇÃO RPC: BUSCA SEMÂNTICA
-- ============================================
CREATE OR REPLACE FUNCTION public.search_knowledge_chunks(
  query_embedding vector(1536),
  org_id UUID,
  agent_id_filter UUID DEFAULT NULL,
  match_threshold FLOAT DEFAULT 0.7,
  match_count INT DEFAULT 5
)
RETURNS TABLE (
  id UUID,
  item_id UUID,
  content TEXT,
  title TEXT,
  content_type TEXT,
  similarity FLOAT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
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

-- ============================================
-- TRIGGER PARA UPDATED_AT
-- ============================================
CREATE OR REPLACE FUNCTION public.update_knowledge_items_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_knowledge_items_updated_at ON public.knowledge_items;
CREATE TRIGGER trigger_update_knowledge_items_updated_at
  BEFORE UPDATE ON public.knowledge_items
  FOR EACH ROW
  EXECUTE FUNCTION public.update_knowledge_items_updated_at();

-- ============================================
-- STORAGE BUCKET PARA UPLOADS
-- ============================================
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'knowledge-uploads',
  'knowledge-uploads',
  false,
  20971520,
  ARRAY['text/plain', 'text/markdown', 'application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document']
)
ON CONFLICT (id) DO NOTHING;

-- Storage policies
CREATE POLICY "Users can upload knowledge files"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'knowledge-uploads' AND
  (storage.foldername(name))[1] IN (
    SELECT organization_id::text FROM public.user_organizations 
    WHERE user_id = public.current_user_id() AND is_active = true
  )
);

CREATE POLICY "Users can view own org knowledge files"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'knowledge-uploads' AND
  (storage.foldername(name))[1] IN (
    SELECT organization_id::text FROM public.user_organizations 
    WHERE user_id = public.current_user_id() AND is_active = true
  )
);

CREATE POLICY "Users can delete own org knowledge files"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'knowledge-uploads' AND
  (storage.foldername(name))[1] IN (
    SELECT organization_id::text FROM public.user_organizations 
    WHERE user_id = public.current_user_id() AND is_active = true
  )
);