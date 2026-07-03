
CREATE TABLE IF NOT EXISTS public.message_threads_business_context_backfill_20260703 (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  thread_id UUID NOT NULL,
  organization_id UUID NOT NULL,
  primary_endpoint_id UUID,
  primary_endpoint_purpose TEXT,
  old_business_context TEXT,
  new_business_context TEXT NOT NULL,
  reason TEXT NOT NULL,
  msgs_post_cutoff_count INTEGER NOT NULL DEFAULT 0,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT ON public.message_threads_business_context_backfill_20260703 TO authenticated;
GRANT ALL ON public.message_threads_business_context_backfill_20260703 TO service_role;

ALTER TABLE public.message_threads_business_context_backfill_20260703 ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "backfill_20260703_admin_read"
  ON public.message_threads_business_context_backfill_20260703;

CREATE POLICY "backfill_20260703_admin_read"
  ON public.message_threads_business_context_backfill_20260703
  FOR SELECT TO authenticated
  USING (public.is_admin_user());

CREATE INDEX IF NOT EXISTS idx_bfill_20260703_thread
  ON public.message_threads_business_context_backfill_20260703(thread_id);

DO $$
DECLARE
  v_expected INTEGER := 308;
  v_snapshot INTEGER;
  v_updated INTEGER;
BEGIN
  WITH cs_eps AS (
    SELECT id FROM public.communication_endpoints WHERE purpose = 'customer_service'
  ),
  targets AS (
    SELECT mt.id AS thread_id,
           mt.organization_id,
           mt.primary_endpoint_id,
           ce.purpose AS primary_endpoint_purpose,
           mt.business_context AS old_business_context,
           (SELECT COUNT(*) FROM public.messages m
             WHERE m.thread_id = mt.id
               AND m.endpoint_id = mt.primary_endpoint_id
               AND m.sent_at >= '2026-06-16 22:29:40+00'::timestamptz
               AND m.direction IN ('inbound','outbound')) AS msgs_post_cutoff_count
    FROM public.message_threads mt
    JOIN public.communication_endpoints ce ON ce.id = mt.primary_endpoint_id
    WHERE mt.business_context = 'sales'
      AND mt.primary_endpoint_id IN (SELECT id FROM cs_eps)
      AND EXISTS (
        SELECT 1 FROM public.messages m
        WHERE m.thread_id = mt.id
          AND m.endpoint_id = mt.primary_endpoint_id
          AND m.direction IN ('inbound','outbound')
          AND m.sent_at >= '2026-06-16 22:29:40+00'::timestamptz
      )
  )
  INSERT INTO public.message_threads_business_context_backfill_20260703
    (thread_id, organization_id, primary_endpoint_id, primary_endpoint_purpose,
     old_business_context, new_business_context, reason, msgs_post_cutoff_count)
  SELECT thread_id, organization_id, primary_endpoint_id, primary_endpoint_purpose,
         old_business_context, 'customer_service',
         'post_cutoff_activity_on_cs_endpoint', msgs_post_cutoff_count
  FROM targets;

  GET DIAGNOSTICS v_snapshot = ROW_COUNT;

  IF v_snapshot <> v_expected THEN
    RAISE EXCEPTION 'PR2.6 abort: snapshot count % differs from expected %',
                     v_snapshot, v_expected;
  END IF;

  UPDATE public.message_threads mt
     SET business_context = 'customer_service'
    FROM public.message_threads_business_context_backfill_20260703 b
   WHERE b.thread_id = mt.id
     AND b.applied_at >= now() - INTERVAL '1 minute'
     AND mt.business_context = 'sales';

  GET DIAGNOSTICS v_updated = ROW_COUNT;

  IF v_updated <> v_expected THEN
    RAISE EXCEPTION 'PR2.6 abort: update count % differs from expected %',
                     v_updated, v_expected;
  END IF;

  RAISE NOTICE 'PR2.6 OK: % threads snapshotted, % reclassified as customer_service',
               v_snapshot, v_updated;
END $$;
