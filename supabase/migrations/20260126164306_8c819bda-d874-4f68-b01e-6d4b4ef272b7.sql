-- Adicionar coluna metadata para compatibilidade com Railway backend
ALTER TABLE messages 
ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT NULL;

-- Índice GIN para busca eficiente dentro do JSON
CREATE INDEX IF NOT EXISTS idx_messages_metadata 
ON messages USING GIN (metadata) 
WHERE metadata IS NOT NULL;

-- Comentário explicativo
COMMENT ON COLUMN messages.metadata IS 'Metadados adicionais da mensagem (ex: tool_calls, tokens_used, model)';