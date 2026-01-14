-- Habilitar Realtime para a tabela messages
ALTER PUBLICATION supabase_realtime ADD TABLE messages;

-- Habilitar Realtime para a tabela message_threads
ALTER PUBLICATION supabase_realtime ADD TABLE message_threads;