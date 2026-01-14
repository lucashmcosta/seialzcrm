-- Adicionar colunas para identificar quem enviou a mensagem
ALTER TABLE public.messages 
ADD COLUMN IF NOT EXISTS sender_type TEXT DEFAULT 'user',
ADD COLUMN IF NOT EXISTS sender_name TEXT,
ADD COLUMN IF NOT EXISTS sender_agent_id UUID REFERENCES public.ai_agents(id);

-- Índice para buscar mensagens do agente
CREATE INDEX IF NOT EXISTS idx_messages_sender_type 
ON public.messages(sender_type) 
WHERE sender_type = 'agent';

-- Comentários
COMMENT ON COLUMN public.messages.sender_type IS 'user, agent, or system';
COMMENT ON COLUMN public.messages.sender_name IS 'Display name of sender (user name or agent name)';
COMMENT ON COLUMN public.messages.sender_agent_id IS 'Reference to ai_agent if sent by agent';