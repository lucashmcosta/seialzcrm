ALTER TABLE public.message_thread_merge_audit DROP CONSTRAINT IF EXISTS message_thread_merge_audit_loser_thread_id_key;
CREATE UNIQUE INDEX IF NOT EXISTS message_thread_merge_audit_active_loser_uidx
  ON public.message_thread_merge_audit (loser_thread_id)
  WHERE unmerged_at IS NULL;