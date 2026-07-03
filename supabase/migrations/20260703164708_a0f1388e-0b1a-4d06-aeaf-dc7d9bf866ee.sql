
DO $$
DECLARE
  v_org_central uuid := '40ae935c-a7f7-4ad7-8ea4-91be6404a95f';
  v_ep_7027     uuid := 'c09bd713-0225-4533-afe8-20ac07bd3a7c';
  v_cutoff      timestamptz := '2026-06-16 22:29:40+00';
  v_ep_7020     uuid;
BEGIN
  SELECT id INTO v_ep_7020
    FROM public.communication_endpoints
   WHERE organization_id = v_org_central
     AND regexp_replace(coalesce(external_address,''), '\D', '', 'g') LIKE '%551150287020%'
   ORDER BY created_at
   LIMIT 1;

  -- Regra 1
  WITH targets AS (
    SELECT t.id, t.organization_id, t.primary_endpoint_id, t.created_at, t.business_context AS old_ctx
      FROM public.message_threads t
     WHERE t.organization_id = v_org_central
       AND t.primary_endpoint_id = v_ep_7027
       AND t.created_at < v_cutoff
       AND (t.business_context IS NULL OR t.business_context <> 'sales')
  ),
  logged AS (
    INSERT INTO public.message_threads_business_context_backfill
      (thread_id, organization_id, old_business_context, new_business_context, method,
       confidence_score, endpoint_id, endpoint_purpose_at_backfill, thread_created_at, migration_version)
    SELECT t.id, t.organization_id, t.old_ctx, 'sales',
           'pr1_v1_central_7027_precutoff', 1.00, t.primary_endpoint_id,
           (SELECT purpose FROM public.communication_endpoints WHERE id = t.primary_endpoint_id),
           t.created_at, 'pr1_v1_business_context_shadow'
      FROM targets t
    RETURNING thread_id
  )
  UPDATE public.message_threads mt SET business_context = 'sales'
    FROM logged l WHERE mt.id = l.thread_id;

  -- Regra 2
  WITH targets AS (
    SELECT t.id, t.organization_id, t.primary_endpoint_id, t.created_at, t.business_context AS old_ctx
      FROM public.message_threads t
     WHERE t.organization_id = v_org_central
       AND t.primary_endpoint_id = v_ep_7027
       AND t.created_at >= v_cutoff
       AND (t.business_context IS NULL OR t.business_context <> 'customer_service')
  ),
  logged AS (
    INSERT INTO public.message_threads_business_context_backfill
      (thread_id, organization_id, old_business_context, new_business_context, method,
       confidence_score, endpoint_id, endpoint_purpose_at_backfill, thread_created_at, migration_version)
    SELECT t.id, t.organization_id, t.old_ctx, 'customer_service',
           'pr1_v1_central_7027_postcutoff', 1.00, t.primary_endpoint_id,
           (SELECT purpose FROM public.communication_endpoints WHERE id = t.primary_endpoint_id),
           t.created_at, 'pr1_v1_business_context_shadow'
      FROM targets t
    RETURNING thread_id
  )
  UPDATE public.message_threads mt SET business_context = 'customer_service'
    FROM logged l WHERE mt.id = l.thread_id;

  -- Regra 3
  IF v_ep_7020 IS NOT NULL THEN
    WITH targets AS (
      SELECT t.id, t.organization_id, t.primary_endpoint_id, t.created_at, t.business_context AS old_ctx
        FROM public.message_threads t
       WHERE t.organization_id = v_org_central
         AND t.primary_endpoint_id = v_ep_7020
         AND (t.business_context IS NULL OR t.business_context <> 'sales')
    ),
    logged AS (
      INSERT INTO public.message_threads_business_context_backfill
        (thread_id, organization_id, old_business_context, new_business_context, method,
         confidence_score, endpoint_id, endpoint_purpose_at_backfill, thread_created_at, migration_version)
      SELECT t.id, t.organization_id, t.old_ctx, 'sales',
             'pr1_v1_central_7020', 1.00, t.primary_endpoint_id,
             (SELECT purpose FROM public.communication_endpoints WHERE id = t.primary_endpoint_id),
             t.created_at, 'pr1_v1_business_context_shadow'
        FROM targets t
      RETURNING thread_id
    )
    UPDATE public.message_threads mt SET business_context = 'sales'
      FROM logged l WHERE mt.id = l.thread_id;
  END IF;

  -- Regra 4: fallback por endpoint.purpose (0.80)
  WITH targets AS (
    SELECT t.id, t.organization_id, t.primary_endpoint_id, t.created_at,
           e.purpose AS ep_purpose,
           CASE
             WHEN lower(e.purpose) IN ('sales','commercial') THEN 'sales'
             WHEN lower(e.purpose) IN ('customer_service','support') THEN 'customer_service'
             ELSE 'other'
           END AS new_ctx
      FROM public.message_threads t
      JOIN public.communication_endpoints e ON e.id = t.primary_endpoint_id
     WHERE t.business_context IS NULL
       AND t.primary_endpoint_id IS NOT NULL
  ),
  logged AS (
    INSERT INTO public.message_threads_business_context_backfill
      (thread_id, organization_id, old_business_context, new_business_context, method,
       confidence_score, endpoint_id, endpoint_purpose_at_backfill, thread_created_at, migration_version)
    SELECT t.id, t.organization_id, NULL, t.new_ctx,
           'pr1_v1_fallback_endpoint_purpose', 0.80, t.primary_endpoint_id,
           t.ep_purpose, t.created_at, 'pr1_v1_business_context_shadow'
      FROM targets t
    RETURNING thread_id, new_business_context
  )
  UPDATE public.message_threads mt SET business_context = l.new_business_context
    FROM logged l WHERE mt.id = l.thread_id;
END $$;
