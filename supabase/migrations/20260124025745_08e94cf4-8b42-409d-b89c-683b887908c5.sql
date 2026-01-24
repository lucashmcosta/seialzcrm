-- =====================================================
-- KNOWLEDGE BASE V2: Multi-Product + Herança + Edição Conversacional
-- =====================================================

-- 1. CRIAR TABELA PRODUCTS
-- =====================================================
CREATE TABLE IF NOT EXISTS products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  description TEXT,
  product_group TEXT,
  is_active BOOLEAN DEFAULT true,
  display_order INT DEFAULT 0,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(organization_id, slug)
);

-- Índices para products
CREATE INDEX IF NOT EXISTS idx_products_org ON products(organization_id);
CREATE INDEX IF NOT EXISTS idx_products_group ON products(product_group) WHERE product_group IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_products_active ON products(organization_id, is_active);

-- RLS para products
ALTER TABLE products ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view products from their org" ON products;
CREATE POLICY "Users can view products from their org" ON products
  FOR SELECT USING (
    organization_id IN (
      SELECT organization_id FROM user_organizations 
      WHERE user_id = (SELECT id FROM users WHERE auth_user_id = auth.uid())
      AND is_active = true
    )
  );

DROP POLICY IF EXISTS "Users can insert products in their org" ON products;
CREATE POLICY "Users can insert products in their org" ON products
  FOR INSERT WITH CHECK (
    organization_id IN (
      SELECT organization_id FROM user_organizations 
      WHERE user_id = (SELECT id FROM users WHERE auth_user_id = auth.uid())
      AND is_active = true
    )
  );

DROP POLICY IF EXISTS "Users can update products in their org" ON products;
CREATE POLICY "Users can update products in their org" ON products
  FOR UPDATE USING (
    organization_id IN (
      SELECT organization_id FROM user_organizations 
      WHERE user_id = (SELECT id FROM users WHERE auth_user_id = auth.uid())
      AND is_active = true
    )
  );

DROP POLICY IF EXISTS "Users can delete products in their org" ON products;
CREATE POLICY "Users can delete products in their org" ON products
  FOR DELETE USING (
    organization_id IN (
      SELECT organization_id FROM user_organizations 
      WHERE user_id = (SELECT id FROM users WHERE auth_user_id = auth.uid())
      AND is_active = true
    )
  );

-- Trigger para updated_at em products
DROP TRIGGER IF EXISTS update_products_updated_at ON products;
CREATE TRIGGER update_products_updated_at
  BEFORE UPDATE ON products
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- 2. EVOLUIR TABELA KNOWLEDGE_ITEMS
-- =====================================================
-- Adicionar novos campos (incluindo content que não existia)
ALTER TABLE knowledge_items
  ADD COLUMN IF NOT EXISTS content TEXT,
  ADD COLUMN IF NOT EXISTS category TEXT DEFAULT 'geral',
  ADD COLUMN IF NOT EXISTS scope TEXT DEFAULT 'global',
  ADD COLUMN IF NOT EXISTS product_id UUID REFERENCES products(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS inherits_global BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS global_item_id UUID REFERENCES knowledge_items(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS resolved_content TEXT,
  ADD COLUMN IF NOT EXISTS content_hash TEXT,
  ADD COLUMN IF NOT EXISTS needs_reindex BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS last_indexed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS version INT DEFAULT 1,
  ADD COLUMN IF NOT EXISTS updated_by UUID;

-- Constraint de scope
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ki_scope_check'
  ) THEN
    ALTER TABLE knowledge_items
      ADD CONSTRAINT ki_scope_check CHECK (scope IN ('global', 'product'));
  END IF;
END $$;

-- Constraint de categoria (16 categorias)
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ki_category_check'
  ) THEN
    ALTER TABLE knowledge_items
      ADD CONSTRAINT ki_category_check CHECK (category IN (
        'geral', 'produto_servico', 'preco_planos', 'pagamento', 'processo',
        'requisitos', 'politicas', 'faq', 'objecoes', 'qualificacao',
        'horario_contato', 'glossario', 'escopo', 'compliance', 'linguagem', 'prova_social'
      ));
  END IF;
END $$;

-- Índices otimizados para RAG
CREATE INDEX IF NOT EXISTS idx_ki_org_scope_product ON knowledge_items(organization_id, scope, product_id);
CREATE INDEX IF NOT EXISTS idx_ki_global_parent ON knowledge_items(global_item_id) WHERE global_item_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_ki_needs_reindex ON knowledge_items(needs_reindex) WHERE needs_reindex = true;
CREATE INDEX IF NOT EXISTS idx_ki_category ON knowledge_items(organization_id, category);
CREATE INDEX IF NOT EXISTS idx_ki_active_published ON knowledge_items(organization_id, is_active, status);

-- 3. CRIAR TABELA KNOWLEDGE_ITEM_HISTORY
-- =====================================================
CREATE TABLE IF NOT EXISTS knowledge_item_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  item_id UUID REFERENCES knowledge_items(id) ON DELETE SET NULL,
  previous_title TEXT,
  previous_content TEXT,
  previous_resolved_content TEXT,
  new_title TEXT,
  new_content TEXT,
  new_resolved_content TEXT,
  change_type TEXT CHECK (change_type IN ('create', 'update', 'delete', 'restore')),
  change_source TEXT CHECK (change_source IN ('wizard', 'manual', 'conversation', 'api', 'bulk')),
  change_description TEXT,
  changed_by UUID,
  changed_at TIMESTAMPTZ DEFAULT now(),
  conversation_context JSONB
);

-- Índices para history
CREATE INDEX IF NOT EXISTS idx_kih_org ON knowledge_item_history(organization_id);
CREATE INDEX IF NOT EXISTS idx_kih_item ON knowledge_item_history(item_id);
CREATE INDEX IF NOT EXISTS idx_kih_changed_at ON knowledge_item_history(changed_at);

-- RLS para history
ALTER TABLE knowledge_item_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view history from their org" ON knowledge_item_history;
CREATE POLICY "Users can view history from their org" ON knowledge_item_history
  FOR SELECT USING (
    organization_id IN (
      SELECT organization_id FROM user_organizations 
      WHERE user_id = (SELECT id FROM users WHERE auth_user_id = auth.uid())
      AND is_active = true
    )
  );

DROP POLICY IF EXISTS "Users can insert history in their org" ON knowledge_item_history;
CREATE POLICY "Users can insert history in their org" ON knowledge_item_history
  FOR INSERT WITH CHECK (
    organization_id IN (
      SELECT organization_id FROM user_organizations 
      WHERE user_id = (SELECT id FROM users WHERE auth_user_id = auth.uid())
      AND is_active = true
    )
  );

-- 4. CRIAR TABELA KNOWLEDGE_EDIT_REQUESTS
-- =====================================================
CREATE TABLE IF NOT EXISTS knowledge_edit_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_request TEXT NOT NULL,
  proposed_changes JSONB NOT NULL DEFAULT '[]',
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'applied', 'rejected', 'expired')),
  expires_at TIMESTAMPTZ DEFAULT (now() + interval '24 hours'),
  created_by UUID,
  created_at TIMESTAMPTZ DEFAULT now(),
  confirmed_at TIMESTAMPTZ,
  applied_at TIMESTAMPTZ,
  conversation_id UUID
);

-- Índices para edit_requests
CREATE INDEX IF NOT EXISTS idx_ker_org ON knowledge_edit_requests(organization_id);
CREATE INDEX IF NOT EXISTS idx_ker_pending ON knowledge_edit_requests(status) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_ker_expires ON knowledge_edit_requests(expires_at) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_ker_created_by ON knowledge_edit_requests(created_by);

-- RLS para edit_requests
ALTER TABLE knowledge_edit_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view edit requests from their org" ON knowledge_edit_requests;
CREATE POLICY "Users can view edit requests from their org" ON knowledge_edit_requests
  FOR SELECT USING (
    organization_id IN (
      SELECT organization_id FROM user_organizations 
      WHERE user_id = (SELECT id FROM users WHERE auth_user_id = auth.uid())
      AND is_active = true
    )
  );

DROP POLICY IF EXISTS "Users can insert edit requests in their org" ON knowledge_edit_requests;
CREATE POLICY "Users can insert edit requests in their org" ON knowledge_edit_requests
  FOR INSERT WITH CHECK (
    organization_id IN (
      SELECT organization_id FROM user_organizations 
      WHERE user_id = (SELECT id FROM users WHERE auth_user_id = auth.uid())
      AND is_active = true
    )
  );

DROP POLICY IF EXISTS "Users can update edit requests in their org" ON knowledge_edit_requests;
CREATE POLICY "Users can update edit requests in their org" ON knowledge_edit_requests
  FOR UPDATE USING (
    organization_id IN (
      SELECT organization_id FROM user_organizations 
      WHERE user_id = (SELECT id FROM users WHERE auth_user_id = auth.uid())
      AND is_active = true
    )
  );

-- 5. TRIGGERS PARA MATERIALIZAÇÃO E DIRTY FLAG
-- =====================================================

-- Função que materializa resolved_content e marca needs_reindex
CREATE OR REPLACE FUNCTION materialize_resolved_content()
RETURNS TRIGGER AS $$
DECLARE
  global_content TEXT;
  old_hash TEXT;
  new_hash TEXT;
BEGIN
  -- Calcular resolved_content
  IF NEW.scope = 'product' AND NEW.inherits_global = true AND NEW.global_item_id IS NOT NULL THEN
    SELECT content INTO global_content
    FROM knowledge_items
    WHERE id = NEW.global_item_id;
    
    NEW.resolved_content := COALESCE(global_content, '') || E'\n\n' || COALESCE(NEW.content, '');
  ELSE
    NEW.resolved_content := NEW.content;
  END IF;
  
  -- Calcular hash do conteúdo
  new_hash := md5(COALESCE(NEW.resolved_content, ''));
  old_hash := COALESCE(OLD.content_hash, '');
  
  -- Marcar needs_reindex se conteúdo mudou
  IF TG_OP = 'INSERT' OR new_hash != old_hash THEN
    NEW.needs_reindex := true;
    NEW.content_hash := new_hash;
  END IF;
  
  -- Incrementar versão em updates
  IF TG_OP = 'UPDATE' AND new_hash != old_hash THEN
    NEW.version := COALESCE(OLD.version, 1) + 1;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Dropar trigger se existir e recriar
DROP TRIGGER IF EXISTS trg_materialize_resolved_content ON knowledge_items;
CREATE TRIGGER trg_materialize_resolved_content
  BEFORE INSERT OR UPDATE ON knowledge_items
  FOR EACH ROW
  EXECUTE FUNCTION materialize_resolved_content();

-- Função que propaga mudanças do global para filhos
CREATE OR REPLACE FUNCTION propagate_global_changes()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.scope = 'global' AND OLD.content IS DISTINCT FROM NEW.content THEN
    UPDATE knowledge_items
    SET 
      resolved_content = NEW.content || E'\n\n' || content,
      needs_reindex = true,
      content_hash = md5(NEW.content || E'\n\n' || content),
      updated_at = now()
    WHERE global_item_id = NEW.id
      AND inherits_global = true;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Dropar trigger se existir e recriar
DROP TRIGGER IF EXISTS trg_propagate_global_changes ON knowledge_items;
CREATE TRIGGER trg_propagate_global_changes
  AFTER UPDATE ON knowledge_items
  FOR EACH ROW
  WHEN (OLD.scope = 'global')
  EXECUTE FUNCTION propagate_global_changes();

-- 6. RPCs PARA RAG EM 2 PASSOS
-- =====================================================

-- Busca APENAS em chunks de produto específico
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
LANGUAGE plpgsql SECURITY DEFINER
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

-- Busca APENAS em chunks globais
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
LANGUAGE plpgsql SECURITY DEFINER
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

-- 7. MIGRAR DADOS EXISTENTES
-- =====================================================
-- Popular content a partir do metadata e defaults para novos campos
UPDATE knowledge_items
SET 
  content = COALESCE(content, metadata->>'original_content', title),
  category = COALESCE(category, 'geral'),
  scope = COALESCE(scope, 'global'),
  is_active = COALESCE(is_active, true),
  version = COALESCE(version, 1),
  resolved_content = COALESCE(resolved_content, metadata->>'original_content', title),
  needs_reindex = CASE 
    WHEN status = 'published' THEN false 
    ELSE true 
  END
WHERE content IS NULL OR category IS NULL OR scope IS NULL OR is_active IS NULL;