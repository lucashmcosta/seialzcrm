-- Migration: Add name confirmation tracking to contact_memories
-- Contexto: Contatos do WhatsApp vêm com nomes de perfil que geralmente não são o nome real

-- 1. Campo para controlar se o nome já foi confirmado/perguntado
ALTER TABLE contact_memories 
ADD COLUMN IF NOT EXISTS name_confirmed BOOLEAN DEFAULT false;

-- 2. Campo para saber quando foi confirmado
ALTER TABLE contact_memories 
ADD COLUMN IF NOT EXISTS name_confirmed_at TIMESTAMPTZ;

-- 3. Campo para guardar o nome original do WhatsApp (para referência)
ALTER TABLE contact_memories 
ADD COLUMN IF NOT EXISTS original_whatsapp_name TEXT;

-- 4. Campo para marcar se já PERGUNTOU sobre o nome (evita perguntar 2x)
ALTER TABLE contact_memories 
ADD COLUMN IF NOT EXISTS name_asked BOOLEAN DEFAULT false;

-- 5. Índice para busca rápida
CREATE INDEX IF NOT EXISTS idx_contact_memories_name_status 
ON contact_memories(contact_id, name_confirmed, name_asked);

-- Comentários
COMMENT ON COLUMN contact_memories.name_confirmed IS 'True quando cliente confirmou explicitamente seu nome real';
COMMENT ON COLUMN contact_memories.name_asked IS 'True quando agente já perguntou o nome (evita repetição)';
COMMENT ON COLUMN contact_memories.original_whatsapp_name IS 'Nome original que veio do perfil do WhatsApp';