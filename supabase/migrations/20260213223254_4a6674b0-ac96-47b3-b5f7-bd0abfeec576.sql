
CREATE TABLE message_thread_reads (
  thread_id uuid NOT NULL REFERENCES message_threads(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  last_read_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (thread_id, user_id)
);

ALTER TABLE message_thread_reads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own thread reads"
  ON message_thread_reads FOR SELECT
  USING (user_id IN (SELECT id FROM users WHERE auth_user_id = auth.uid()));

CREATE POLICY "Users can insert own thread reads"
  ON message_thread_reads FOR INSERT
  WITH CHECK (user_id IN (SELECT id FROM users WHERE auth_user_id = auth.uid()));

CREATE POLICY "Users can update own thread reads"
  ON message_thread_reads FOR UPDATE
  USING (user_id IN (SELECT id FROM users WHERE auth_user_id = auth.uid()));

ALTER TABLE message_threads
  ADD COLUMN last_inbound_at timestamptz DEFAULT NULL;

UPDATE message_threads
  SET last_inbound_at = whatsapp_last_inbound_at
  WHERE whatsapp_last_inbound_at IS NOT NULL;
