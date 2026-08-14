DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.communication_endpoints
     WHERE channel = 'whatsapp' AND external_address IS NOT NULL
     GROUP BY organization_id,
              regexp_replace(COALESCE(external_address,''),'\D','','g'), provider
    HAVING count(*) > 1) THEN
    RAISE EXCEPTION 'PRECHECK_DUP_PROVIDER_AWARE';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.communication_endpoints
     WHERE channel = 'whatsapp' AND external_address IS NOT NULL AND is_active
     GROUP BY organization_id,
              regexp_replace(COALESCE(external_address,''),'\D','','g')
    HAVING count(*) > 1) THEN
    RAISE EXCEPTION 'PRECHECK_DUP_ACTIVE_SAME_NUMBER';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.communication_endpoints
     WHERE channel = 'whatsapp' AND provider IS NULL) THEN
    RAISE EXCEPTION 'PRECHECK_PROVIDER_NULL';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.communication_endpoints
     WHERE channel = 'whatsapp' AND external_address IS NOT NULL
       AND regexp_replace(COALESCE(external_address,''),'\D','','g') = '') THEN
    RAISE EXCEPTION 'PRECHECK_EMPTY_NORMALIZED_ADDRESS';
  END IF;
END $$;

CREATE UNIQUE INDEX uq_comm_endpoints_wa_digits_provider
  ON public.communication_endpoints (
    organization_id,
    regexp_replace(COALESCE(external_address,''),'\D','','g'),
    provider)
  WHERE channel = 'whatsapp' AND external_address IS NOT NULL;

CREATE UNIQUE INDEX uq_comm_endpoints_wa_digits_active
  ON public.communication_endpoints (
    organization_id,
    regexp_replace(COALESCE(external_address,''),'\D','','g'))
  WHERE channel = 'whatsapp' AND external_address IS NOT NULL AND is_active;

CREATE UNIQUE INDEX uq_comm_endpoints_nonwa_org_channel_address
  ON public.communication_endpoints (organization_id, channel, external_address)
  WHERE external_address IS NOT NULL AND channel <> 'whatsapp';

DO $$
BEGIN
  IF (SELECT count(*) FROM pg_indexes
       WHERE schemaname = 'public' AND tablename = 'communication_endpoints'
         AND indexname IN ('uq_comm_endpoints_wa_digits_provider',
                           'uq_comm_endpoints_wa_digits_active',
                           'uq_comm_endpoints_nonwa_org_channel_address')) <> 3 THEN
    RAISE EXCEPTION 'INDEX_VALIDATION_FAILED';
  END IF;
END $$;

DROP INDEX IF EXISTS public.uq_comm_endpoints_org_channel_address;