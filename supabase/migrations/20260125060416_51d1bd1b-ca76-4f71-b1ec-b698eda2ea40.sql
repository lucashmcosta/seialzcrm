-- Função para sanitizar mensagens do agente e garantir nome correto
CREATE OR REPLACE FUNCTION public.sanitize_agent_message()
RETURNS TRIGGER AS $$
DECLARE
  agent_record RECORD;
  max_newlines INT;
  sanitized_content TEXT;
BEGIN
  -- Só processar mensagens de agentes (outbound com sender_type = 'agent')
  IF NEW.direction = 'outbound' AND NEW.sender_type = 'agent' THEN
    
    -- Buscar agente se sender_agent_id existe, ou buscar agente ativo da org
    IF NEW.sender_agent_id IS NOT NULL THEN
      SELECT id, name, formatting_rules 
      INTO agent_record 
      FROM ai_agents 
      WHERE id = NEW.sender_agent_id;
    ELSE
      -- Tentar encontrar o agente ativo da organização via thread
      SELECT a.id, a.name, a.formatting_rules 
      INTO agent_record 
      FROM ai_agents a
      JOIN message_threads t ON t.organization_id = a.organization_id
      WHERE t.id = NEW.thread_id 
        AND a.is_enabled = true
      ORDER BY a.updated_at DESC
      LIMIT 1;
    END IF;
    
    -- Corrigir sender_name se estiver NULL e encontramos o agente
    IF agent_record.id IS NOT NULL THEN
      IF NEW.sender_name IS NULL OR NEW.sender_name = '' THEN
        NEW.sender_name := agent_record.name;
      END IF;
      
      IF NEW.sender_agent_id IS NULL THEN
        NEW.sender_agent_id := agent_record.id;
      END IF;
      
      -- Aplicar regras de formatação ao conteúdo
      IF NEW.content IS NOT NULL AND agent_record.formatting_rules IS NOT NULL THEN
        max_newlines := COALESCE((agent_record.formatting_rules->>'max_consecutive_newlines')::INT, 2);
        sanitized_content := NEW.content;
        
        -- Remover múltiplas quebras de linha consecutivas
        IF max_newlines = 1 THEN
          -- Substituir 2+ newlines por apenas 1
          sanitized_content := regexp_replace(sanitized_content, E'\n{2,}', E'\n', 'g');
        ELSIF max_newlines = 2 THEN
          -- Substituir 3+ newlines por apenas 2
          sanitized_content := regexp_replace(sanitized_content, E'\n{3,}', E'\n\n', 'g');
        END IF;
        
        -- Remover espaços em branco no início e fim
        sanitized_content := TRIM(sanitized_content);
        
        NEW.content := sanitized_content;
      END IF;
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Criar trigger para aplicar antes do INSERT
DROP TRIGGER IF EXISTS trigger_sanitize_agent_message ON messages;
CREATE TRIGGER trigger_sanitize_agent_message
  BEFORE INSERT ON messages
  FOR EACH ROW
  EXECUTE FUNCTION public.sanitize_agent_message();

-- Também criar trigger para UPDATE (caso mensagens sejam atualizadas)
DROP TRIGGER IF EXISTS trigger_sanitize_agent_message_update ON messages;
CREATE TRIGGER trigger_sanitize_agent_message_update
  BEFORE UPDATE ON messages
  FOR EACH ROW
  WHEN (NEW.sender_type = 'agent')
  EXECUTE FUNCTION public.sanitize_agent_message();