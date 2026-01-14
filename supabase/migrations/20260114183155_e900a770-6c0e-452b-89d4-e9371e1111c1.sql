-- Remover constraint que impede múltiplos agentes do mesmo tipo
ALTER TABLE public.ai_agents 
DROP CONSTRAINT IF EXISTS ai_agents_organization_id_agent_type_key;

-- Adicionar constraint que permita múltiplos agentes mas com nomes únicos por organização
ALTER TABLE public.ai_agents 
ADD CONSTRAINT ai_agents_organization_name_key 
UNIQUE (organization_id, name);