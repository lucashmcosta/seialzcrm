
WITH targets AS (
  SELECT t.id AS thread_id, t.organization_id, t.primary_endpoint_id, t.created_at,
         CASE
           WHEN lower(e.purpose) IN ('sales','commercial') THEN 'sales'
           WHEN lower(e.purpose) IN ('customer_service','support') THEN 'customer_service'
           ELSE 'other'
         END AS new_ctx,
         e.purpose AS ep_purpose
    FROM public.message_threads t
    JOIN public.communication_endpoints e ON e.id = t.primary_endpoint_id
   WHERE t.business_context = 'other'
     AND lower(e.purpose) IN ('sales','commercial','customer_service','support')
),
logged AS (
  INSERT INTO public.message_threads_business_context_backfill
    (thread_id, organization_id, old_business_context, new_business_context, method,
     confidence_score, endpoint_id, endpoint_purpose_at_backfill, thread_created_at, migration_version)
  SELECT thread_id, organization_id, 'other', new_ctx,
         'pr1_5_v1_sweep_current_purpose', 0.95, primary_endpoint_id,
         ep_purpose, created_at, 'pr1_5_v1_reclassify_other'
    FROM targets
  RETURNING thread_id, new_business_context
)
UPDATE public.message_threads mt SET business_context = l.new_business_context
  FROM logged l WHERE mt.id = l.thread_id;
