
-- Loop-guard RPCs for kommo-migrate: wrap contact/opportunity upserts in a
-- transaction with app.skip_event_emit='true' so trg_publish_event_* trigger
-- skips emitting outbound events during a bulk import.

CREATE OR REPLACE FUNCTION public.rpc_kommo_upsert_contact(
  p_existing_id uuid,
  p_data jsonb
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_id uuid;
BEGIN
  PERFORM set_config('app.skip_event_emit', 'true', true);
  IF p_existing_id IS NOT NULL THEN
    UPDATE public.contacts SET
      full_name          = COALESCE(p_data->>'full_name', full_name),
      email              = p_data->>'email',
      phone              = p_data->>'phone',
      source_external_id = COALESCE(p_data->>'source_external_id', source_external_id),
      company_id         = NULLIF(p_data->>'company_id','')::uuid,
      owner_user_id      = NULLIF(p_data->>'owner_user_id','')::uuid,
      updated_at         = COALESCE((p_data->>'updated_at')::timestamptz, now())
    WHERE id = p_existing_id;
    RETURN p_existing_id;
  ELSE
    INSERT INTO public.contacts (
      organization_id, full_name, email, phone, source, source_external_id,
      company_id, owner_user_id, created_at, updated_at
    ) VALUES (
      (p_data->>'organization_id')::uuid,
      COALESCE(p_data->>'full_name','Sem nome'),
      p_data->>'email',
      p_data->>'phone',
      'kommo',
      p_data->>'source_external_id',
      NULLIF(p_data->>'company_id','')::uuid,
      NULLIF(p_data->>'owner_user_id','')::uuid,
      COALESCE((p_data->>'created_at')::timestamptz, now()),
      COALESCE((p_data->>'updated_at')::timestamptz, now())
    ) RETURNING id INTO v_id;
    RETURN v_id;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.rpc_kommo_upsert_opportunity(
  p_existing_id uuid,
  p_data jsonb
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_id uuid;
BEGIN
  PERFORM set_config('app.skip_event_emit', 'true', true);
  IF p_existing_id IS NOT NULL THEN
    UPDATE public.opportunities SET
      title             = COALESCE(p_data->>'title', title),
      amount            = COALESCE((p_data->>'amount')::numeric, amount),
      pipeline_stage_id = NULLIF(p_data->>'pipeline_stage_id','')::uuid,
      contact_id        = COALESCE(NULLIF(p_data->>'contact_id','')::uuid, contact_id),
      owner_user_id     = NULLIF(p_data->>'owner_user_id','')::uuid,
      updated_at        = COALESCE((p_data->>'updated_at')::timestamptz, now())
    WHERE id = p_existing_id;
    RETURN p_existing_id;
  ELSE
    INSERT INTO public.opportunities (
      organization_id, contact_id, title, amount, pipeline_stage_id, source,
      source_external_id, owner_user_id, created_at, updated_at
    ) VALUES (
      (p_data->>'organization_id')::uuid,
      NULLIF(p_data->>'contact_id','')::uuid,
      COALESCE(p_data->>'title','Lead sem título'),
      COALESCE((p_data->>'amount')::numeric, 0),
      NULLIF(p_data->>'pipeline_stage_id','')::uuid,
      'kommo',
      p_data->>'source_external_id',
      NULLIF(p_data->>'owner_user_id','')::uuid,
      COALESCE((p_data->>'created_at')::timestamptz, now()),
      COALESCE((p_data->>'updated_at')::timestamptz, now())
    ) RETURNING id INTO v_id;
    RETURN v_id;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.rpc_kommo_upsert_contact(uuid, jsonb) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.rpc_kommo_upsert_opportunity(uuid, jsonb) TO authenticated, service_role;

-- Index for the admin Outbound jobs panel (org+slug, recent first)
CREATE INDEX IF NOT EXISTS idx_integration_jobs_org_slug_created
  ON public.integration_jobs (organization_id, integration_slug, created_at DESC);
