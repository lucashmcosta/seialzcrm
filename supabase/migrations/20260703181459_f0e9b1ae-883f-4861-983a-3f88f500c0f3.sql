
-- 1) Snapshot table
CREATE TABLE IF NOT EXISTS public.message_threads_business_context_backfill_null_20260703 (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id uuid NOT NULL,
  organization_id uuid NOT NULL,
  primary_endpoint_id uuid,
  primary_endpoint_purpose text,
  inferred_from text NOT NULL,
  msg_endpoint_purpose text,
  old_business_context text,
  new_business_context text NOT NULL,
  applied_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.message_threads_business_context_backfill_null_20260703 TO authenticated;
GRANT ALL ON public.message_threads_business_context_backfill_null_20260703 TO service_role;

ALTER TABLE public.message_threads_business_context_backfill_null_20260703 ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS backfill_null_20260703_admin_read ON public.message_threads_business_context_backfill_null_20260703;
CREATE POLICY backfill_null_20260703_admin_read ON public.message_threads_business_context_backfill_null_20260703
  FOR SELECT TO authenticated USING (public.is_admin_user());

CREATE INDEX IF NOT EXISTS idx_bfnull_20260703_thread ON public.message_threads_business_context_backfill_null_20260703(thread_id);

-- 2) Snapshot + UPDATE (transacional)
DO $$
DECLARE
  v_snapshot_count integer;
  v_update_count integer;
BEGIN
  WITH nulls AS (
    SELECT mt.id AS thread_id, mt.organization_id, mt.primary_endpoint_id,
           e.purpose AS primary_purpose
    FROM public.message_threads mt
    LEFT JOIN public.communication_endpoints e ON e.id = mt.primary_endpoint_id
    WHERE mt.business_context IS NULL
  ),
  msg_endpoint AS (
    SELECT n.thread_id,
           MODE() WITHIN GROUP (ORDER BY e2.purpose) AS mode_purpose
    FROM nulls n
    JOIN public.messages m ON m.thread_id = n.thread_id
    LEFT JOIN public.communication_endpoints e2 ON e2.id = m.endpoint_id
    WHERE n.primary_endpoint_id IS NULL
      AND m.endpoint_id IS NOT NULL
    GROUP BY n.thread_id
  ),
  classified AS (
    SELECT
      n.thread_id, n.organization_id, n.primary_endpoint_id, n.primary_purpose,
      me.mode_purpose,
      CASE
        WHEN n.primary_purpose IS NOT NULL THEN 'primary_endpoint'
        WHEN me.mode_purpose IS NOT NULL THEN 'message_endpoint'
        ELSE 'no_evidence'
      END AS inferred_from,
      CASE lower(coalesce(n.primary_purpose, me.mode_purpose, ''))
        WHEN 'sales' THEN 'sales'
        WHEN 'commercial' THEN 'sales'
        WHEN 'vendor_personal' THEN 'sales'
        WHEN 'customer_service' THEN 'customer_service'
        WHEN 'support' THEN 'customer_service'
        ELSE 'other'
      END AS new_bc
    FROM nulls n
    LEFT JOIN msg_endpoint me ON me.thread_id = n.thread_id
  )
  INSERT INTO public.message_threads_business_context_backfill_null_20260703
    (thread_id, organization_id, primary_endpoint_id, primary_endpoint_purpose,
     inferred_from, msg_endpoint_purpose, old_business_context, new_business_context)
  SELECT c.thread_id, c.organization_id, c.primary_endpoint_id, c.primary_purpose,
         c.inferred_from, c.mode_purpose, NULL, c.new_bc
  FROM classified c
  ON CONFLICT DO NOTHING;

  GET DIAGNOSTICS v_snapshot_count = ROW_COUNT;

  IF v_snapshot_count NOT BETWEEN 30 AND 60 THEN
    RAISE EXCEPTION 'PR5.1 snapshot inesperado: % linhas (esperado ~38)', v_snapshot_count;
  END IF;

  UPDATE public.message_threads mt
     SET business_context = b.new_business_context
    FROM public.message_threads_business_context_backfill_null_20260703 b
   WHERE mt.id = b.thread_id
     AND mt.business_context IS NULL
     AND b.applied_at >= now() - INTERVAL '1 minute';

  GET DIAGNOSTICS v_update_count = ROW_COUNT;

  IF v_update_count <> v_snapshot_count THEN
    RAISE EXCEPTION 'PR5.1 divergência: snapshot=% updates=%', v_snapshot_count, v_update_count;
  END IF;

  RAISE NOTICE 'PR5.1 OK — snapshot=% updates=%', v_snapshot_count, v_update_count;
END $$;
