
CREATE TABLE IF NOT EXISTS public.message_threads_business_context_backfill_7027_to_cs_20260706 (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id uuid NOT NULL,
  old_business_context text,
  new_business_context text NOT NULL,
  primary_endpoint_id uuid NOT NULL,
  status text,
  last_message_at timestamptz,
  created_at timestamptz,
  applied_at timestamptz NOT NULL DEFAULT now(),
  reason text NOT NULL DEFAULT 'force_7027_to_customer_service_operational_simplification'
);

GRANT SELECT ON public.message_threads_business_context_backfill_7027_to_cs_20260706 TO authenticated;
GRANT ALL ON public.message_threads_business_context_backfill_7027_to_cs_20260706 TO service_role;

ALTER TABLE public.message_threads_business_context_backfill_7027_to_cs_20260706 ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "bfill_7027_cs_admin_read"
  ON public.message_threads_business_context_backfill_7027_to_cs_20260706;
CREATE POLICY "bfill_7027_cs_admin_read"
  ON public.message_threads_business_context_backfill_7027_to_cs_20260706
  FOR SELECT TO authenticated USING (public.is_admin_user());

CREATE INDEX IF NOT EXISTS idx_bfill_7027_cs_thread
  ON public.message_threads_business_context_backfill_7027_to_cs_20260706(thread_id);

DO $$
DECLARE
  v_expected integer := 4588;
  v_snapshot integer;
  v_updated integer;
BEGIN
  INSERT INTO public.message_threads_business_context_backfill_7027_to_cs_20260706
    (thread_id, old_business_context, new_business_context, primary_endpoint_id,
     status, last_message_at, created_at)
  SELECT mt.id, mt.business_context, 'customer_service', mt.primary_endpoint_id,
         mt.status, mt.last_message_at, mt.created_at
  FROM public.message_threads mt
  WHERE mt.primary_endpoint_id = 'c09bd713-0225-4533-afe8-20ac07bd3a7c'
    AND mt.business_context IS DISTINCT FROM 'customer_service'
    AND mt.merged_into_thread_id IS NULL;

  GET DIAGNOSTICS v_snapshot = ROW_COUNT;
  IF v_snapshot <> v_expected THEN
    RAISE EXCEPTION 'abort: snapshot count % differs from expected %', v_snapshot, v_expected;
  END IF;

  UPDATE public.message_threads mt
     SET business_context = 'customer_service'
    FROM public.message_threads_business_context_backfill_7027_to_cs_20260706 b
   WHERE b.thread_id = mt.id
     AND b.applied_at >= now() - INTERVAL '1 minute'
     AND mt.business_context IS DISTINCT FROM 'customer_service';

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  IF v_updated <> v_expected THEN
    RAISE EXCEPTION 'abort: update count % differs from expected %', v_updated, v_expected;
  END IF;

  RAISE NOTICE 'OK: % threads snapshotted, % reclassified as customer_service', v_snapshot, v_updated;
END $$;
