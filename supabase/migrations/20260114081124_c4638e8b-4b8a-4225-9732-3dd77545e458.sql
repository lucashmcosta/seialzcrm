-- Aumentar limite padrão de mensagens por conversa para 50
UPDATE ai_agents SET max_messages_per_conversation = 50 WHERE max_messages_per_conversation = 10;