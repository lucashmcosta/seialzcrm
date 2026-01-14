-- Adicionar campo para tools habilitadas no agente
ALTER TABLE ai_agents 
ADD COLUMN IF NOT EXISTS enabled_tools jsonb DEFAULT '["update_contact", "transfer_to_human"]'::jsonb;

-- Adicionar campo para configurações específicas de cada tool
ALTER TABLE ai_agents 
ADD COLUMN IF NOT EXISTS tool_settings jsonb DEFAULT '{}'::jsonb;

-- Adicionar campo needs_human_attention na tabela message_threads
ALTER TABLE message_threads 
ADD COLUMN IF NOT EXISTS needs_human_attention boolean DEFAULT false;

-- Criar índice para filtrar threads que precisam atenção
CREATE INDEX IF NOT EXISTS idx_message_threads_needs_human_attention 
ON message_threads(organization_id, needs_human_attention) 
WHERE needs_human_attention = true;