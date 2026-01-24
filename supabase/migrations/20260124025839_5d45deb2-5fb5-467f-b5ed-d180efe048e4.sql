-- Corrigir search_path das novas funções de trigger
CREATE OR REPLACE FUNCTION materialize_resolved_content()
RETURNS TRIGGER 
LANGUAGE plpgsql
SET search_path = 'public'
AS $$
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
$$;

CREATE OR REPLACE FUNCTION propagate_global_changes()
RETURNS TRIGGER 
LANGUAGE plpgsql
SET search_path = 'public'
AS $$
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
$$;