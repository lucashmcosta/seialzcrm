-- Adicionar campo de regras de formatação aos agentes de IA
ALTER TABLE ai_agents 
ADD COLUMN IF NOT EXISTS formatting_rules JSONB DEFAULT '{
  "max_consecutive_newlines": 2,
  "strip_empty_lines": false
}'::jsonb;

-- Comentário para documentação
COMMENT ON COLUMN ai_agents.formatting_rules IS 'Regras de formatação de saída: max_consecutive_newlines (1=sem linhas em branco), strip_empty_lines (true/false)';