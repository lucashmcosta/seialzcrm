CREATE INDEX IF NOT EXISTS idx_messages_thread_sent 
ON messages(thread_id, sent_at DESC) WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_threads_org_channel_updated 
ON message_threads(organization_id, channel, updated_at DESC, id);

CREATE INDEX IF NOT EXISTS idx_threads_unassigned 
ON message_threads(organization_id, updated_at DESC) WHERE assigned_user_id IS NULL;