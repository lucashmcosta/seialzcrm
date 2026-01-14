-- Add reply_to_message_id column for quoted messages
ALTER TABLE messages ADD COLUMN reply_to_message_id UUID REFERENCES messages(id);

-- Index for efficient lookups
CREATE INDEX idx_messages_reply_to ON messages(reply_to_message_id);