CREATE TABLE IF NOT EXISTS public.messages_endpoint_backfill_2b (
  id bigserial PRIMARY KEY,
  message_id uuid NOT NULL,
  thread_id uuid,
  old_endpoint_id uuid,
  new_endpoint_id uuid NOT NULL,
  method text NOT NULL,
  backfilled_at timestamptz NOT NULL DEFAULT now(),
  migration_version text NOT NULL DEFAULT 'pr2b_v1'
);
GRANT ALL ON public.messages_endpoint_backfill_2b TO service_role;
GRANT SELECT ON public.messages_endpoint_backfill_2b TO authenticated;
ALTER TABLE public.messages_endpoint_backfill_2b ENABLE ROW LEVEL SECURITY;
CREATE POLICY "audit_no_access" ON public.messages_endpoint_backfill_2b FOR SELECT USING (false);
CREATE INDEX IF NOT EXISTS idx_backfill_2b_message ON public.messages_endpoint_backfill_2b(message_id);
CREATE INDEX IF NOT EXISTS idx_backfill_2b_method ON public.messages_endpoint_backfill_2b(method);