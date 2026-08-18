CREATE OR REPLACE FUNCTION public.provision_line_endpoint(
  p_organization_id uuid, p_line_id uuid, p_provider text, p_address text,
  p_purpose text, p_display_name text DEFAULT NULL, p_instance_name text DEFAULT NULL,
  p_assigned_user_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $fn$
DECLARE
  v_actor uuid := public.current_user_id();
  v_line public.messaging_lines; v_inst public.evolution_instances;
  v_family text[]; v_canonical text; v_digits text;
  v_endpoint_id uuid; v_ep_provider text; v_ep_purpose text; v_ep_owner uuid;
  v_ep_count int; v_link_id uuid; v_link_active boolean;
  v_outcome text; v_link_state text; v_evo_state text := NULL;
  v_integration uuid := NULL; v_owned boolean := false; v_expected_inbox text;
BEGIN
  IF v_actor IS NULL OR p_organization_id IS NULL
     OR NOT (p_organization_id = ANY (public.current_user_org_ids()))
     OR NOT public.can_manage_integrations_in_org(p_organization_id) THEN
    RAISE EXCEPTION 'PROVISION_FORBIDDEN';
  END IF;

  IF p_purpose IN ('commercial','vendor_personal') THEN v_expected_inbox := 'sales';
  ELSIF p_purpose = 'customer_service' THEN v_expected_inbox := 'customer_service';
  ELSE RAISE EXCEPTION 'PROVISION_PURPOSE_UNSUPPORTED'; END IF;

  IF p_provider = 'meta' THEN
    v_family := ARRAY['meta_cloud_api','meta_cloud_api_coexistence','meta-cloud'];
    v_canonical := 'meta_cloud_api';
  ELSIF p_provider = 'twilio' THEN v_family := ARRAY['twilio']; v_canonical := 'twilio';
  ELSIF p_provider = 'evolution' THEN v_family := ARRAY['evolution_api']; v_canonical := 'evolution_api';
  ELSE RAISE EXCEPTION 'PROVISION_PROVIDER_UNSUPPORTED'; END IF;

  IF p_address IS NULL OR btrim(p_address) = '' THEN RAISE EXCEPTION 'PROVISION_ADDRESS_REQUIRED'; END IF;
  v_digits := regexp_replace(p_address, '\D', '', 'g');
  IF length(v_digits) < 8 THEN RAISE EXCEPTION 'PROVISION_ADDRESS_INVALID'; END IF;

  IF p_purpose = 'vendor_personal' THEN
    IF p_assigned_user_id IS NULL THEN RAISE EXCEPTION 'PROVISION_ASSIGNED_USER_REQUIRED'; END IF;
    IF NOT EXISTS (
      SELECT 1 FROM public.user_organizations uo JOIN public.users u ON u.id = uo.user_id
       WHERE uo.user_id = p_assigned_user_id AND uo.organization_id = p_organization_id
         AND COALESCE(uo.is_active, true) AND COALESCE(u.is_active, true)
    ) THEN RAISE EXCEPTION 'PROVISION_ASSIGNED_USER_INVALID'; END IF;
  ELSIF p_assigned_user_id IS NOT NULL THEN
    RAISE EXCEPTION 'PROVISION_ASSIGNED_USER_NOT_ALLOWED';
  END IF;

  SELECT * INTO v_line FROM public.messaging_lines WHERE id = p_line_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'PROVISION_LINE_NOT_FOUND'; END IF;
  IF v_line.organization_id <> p_organization_id THEN RAISE EXCEPTION 'PROVISION_LINE_ORG_MISMATCH'; END IF;
  IF v_line.channel IS DISTINCT FROM 'whatsapp' THEN RAISE EXCEPTION 'PROVISION_CHANNEL_MISMATCH'; END IF;
  IF COALESCE(v_line.inbox_key,'') NOT IN ('sales','customer_service') THEN
    RAISE EXCEPTION 'PROVISION_LINE_INBOX_UNSUPPORTED'; END IF;
  IF v_line.inbox_key IS DISTINCT FROM v_expected_inbox THEN
    RAISE EXCEPTION 'PROVISION_PURPOSE_LINE_MISMATCH'; END IF;

  PERFORM pg_advisory_xact_lock(
    hashtextextended('ce:' || p_organization_id::text || ':whatsapp:' || v_digits, 0));

  SELECT count(*) INTO v_ep_count FROM public.communication_endpoints
   WHERE organization_id = p_organization_id AND channel = 'whatsapp'
     AND regexp_replace(COALESCE(external_address,''), '\D','','g') = v_digits
     AND provider = ANY (v_family);
  IF v_ep_count > 1 THEN RAISE EXCEPTION 'PROVISION_ENDPOINT_AMBIGUOUS'; END IF;

  IF v_ep_count = 1 THEN
    SELECT id, provider, purpose, assigned_user_id
      INTO v_endpoint_id, v_ep_provider, v_ep_purpose, v_ep_owner
      FROM public.communication_endpoints
     WHERE organization_id = p_organization_id AND channel = 'whatsapp'
       AND regexp_replace(COALESCE(external_address,''), '\D','','g') = v_digits
       AND provider = ANY (v_family) FOR UPDATE;
  ELSE
    IF EXISTS (SELECT 1 FROM public.communication_endpoints
       WHERE organization_id = p_organization_id AND channel = 'whatsapp'
         AND regexp_replace(COALESCE(external_address,''), '\D','','g') = v_digits
         AND NOT (provider = ANY (v_family)) AND is_active) THEN
      RAISE EXCEPTION 'PROVISION_ADDRESS_ACTIVE_ON_OTHER_PROVIDER'; END IF;
  END IF;

  IF p_provider = 'evolution' THEN
    IF p_instance_name IS NULL OR btrim(p_instance_name) = '' THEN
      RAISE EXCEPTION 'PROVISION_INSTANCE_REQUIRED'; END IF;
    SELECT * INTO v_inst FROM public.evolution_instances
      WHERE instance_name = p_instance_name FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'PROVISION_INSTANCE_NOT_FOUND'; END IF;
    IF v_inst.organization_id <> p_organization_id THEN RAISE EXCEPTION 'PROVISION_INSTANCE_FOREIGN_ORG'; END IF;
    IF v_inst.endpoint_id IS NOT NULL AND v_endpoint_id IS NOT NULL
       AND v_inst.endpoint_id <> v_endpoint_id THEN RAISE EXCEPTION 'PROVISION_INSTANCE_CONFLICT'; END IF;
    IF COALESCE(v_inst.last_known_state,'unknown') <> 'open' THEN
      RAISE EXCEPTION 'PROVISION_EVOLUTION_NOT_CONNECTED'; END IF;
    IF v_inst.owner_number_digits IS NULL OR btrim(v_inst.owner_number_digits) = '' THEN
      RAISE EXCEPTION 'PROVISION_EVOLUTION_ADDRESS_UNKNOWN'; END IF;
    IF regexp_replace(v_inst.owner_number_digits, '\D','','g') <> v_digits THEN
      RAISE EXCEPTION 'PROVISION_EVOLUTION_ADDRESS_MISMATCH'; END IF;
  ELSE
    SELECT organization_integration_id INTO v_integration FROM public.organization_phone_numbers
     WHERE organization_id = p_organization_id
       AND provider = ANY (v_family || ARRAY[p_provider])
       AND regexp_replace(COALESCE(phone_number,''), '\D','','g') = v_digits LIMIT 1;
    IF v_integration IS NOT NULL THEN v_owned := true;
    ELSIF v_endpoint_id IS NOT NULL AND v_ep_provider = ANY (v_family) THEN v_owned := true; END IF;
    IF NOT v_owned THEN RAISE EXCEPTION 'PROVISION_ADDRESS_NOT_OWNED'; END IF;
  END IF;

  IF v_endpoint_id IS NOT NULL THEN
    v_outcome := 'reused';

    -- GUARDA 1: nunca reclassificar finalidade existente.
    IF v_ep_purpose IS NOT NULL AND v_ep_purpose <> p_purpose THEN
      RAISE EXCEPTION 'PROVISION_ENDPOINT_PURPOSE_CONFLICT';
    END IF;

    -- GUARDA 1b: nunca reatribuir dono de numero pessoal.
    IF p_purpose = 'vendor_personal' AND v_ep_owner IS NOT NULL
       AND v_ep_owner <> p_assigned_user_id THEN
      RAISE EXCEPTION 'PROVISION_ASSIGNED_USER_CONFLICT';
    END IF;

    UPDATE public.communication_endpoints
       SET is_active = true,
           provider = COALESCE(provider, v_canonical),
           purpose = COALESCE(purpose, p_purpose),
           assigned_user_id = CASE WHEN p_purpose = 'vendor_personal'
                                   THEN p_assigned_user_id ELSE NULL END,
           display_name = COALESCE(NULLIF(btrim(COALESCE(p_display_name,'')),''), display_name),
           updated_at = now()
     WHERE id = v_endpoint_id;
  ELSE
    v_outcome := 'created';
    INSERT INTO public.communication_endpoints (
      organization_id, organization_integration_id, channel, external_address,
      display_name, provider, purpose, assigned_user_id, status, is_active)
    VALUES (p_organization_id, v_integration, 'whatsapp', p_address,
      NULLIF(btrim(COALESCE(p_display_name,'')),''), v_canonical, p_purpose,
      CASE WHEN p_purpose = 'vendor_personal' THEN p_assigned_user_id ELSE NULL END,
      'unknown', true)
    RETURNING id INTO v_endpoint_id;
  END IF;

  SELECT id, is_active INTO v_link_id, v_link_active
    FROM public.messaging_line_endpoints
   WHERE line_id = p_line_id AND endpoint_id = v_endpoint_id;
  IF v_link_id IS NULL THEN
    INSERT INTO public.messaging_line_endpoints (organization_id, line_id, endpoint_id)
    VALUES (p_organization_id, p_line_id, v_endpoint_id);
    v_link_state := 'created';
  ELSIF v_link_active IS NOT TRUE THEN
    UPDATE public.messaging_line_endpoints
       SET is_active = true, unlinked_at = NULL,
           linked_at = COALESCE(linked_at, now()), updated_at = now()
     WHERE id = v_link_id;
    v_link_state := 'reactivated';
  ELSE v_link_state := 'unchanged'; END IF;

  IF p_provider = 'evolution' THEN
    IF v_inst.endpoint_id IS DISTINCT FROM v_endpoint_id THEN
      UPDATE public.evolution_instances
         SET endpoint_id = v_endpoint_id, provisioning_status = 'linked', updated_at = now()
       WHERE id = v_inst.id;
      v_evo_state := 'linked';
    ELSE
      UPDATE public.evolution_instances
         SET provisioning_status = 'linked', updated_at = now()
       WHERE id = v_inst.id AND provisioning_status <> 'linked';
      v_evo_state := 'unchanged';
    END IF;
  END IF;

  -- NUNCA toca messaging_lines.active_endpoint_id.
  RETURN jsonb_build_object(
    'endpoint_id', v_endpoint_id, 'line_id', p_line_id, 'inbox_key', v_line.inbox_key,
    'purpose', p_purpose,
    'assigned_user_id', CASE WHEN p_purpose = 'vendor_personal' THEN p_assigned_user_id ELSE NULL END,
    'provider', p_provider, 'address_masked', '****' || right(v_digits, 4),
    'outcome', v_outcome, 'link', v_link_state, 'evolution_mapping', v_evo_state);
END $fn$;

REVOKE ALL ON FUNCTION public.provision_line_endpoint(uuid,uuid,text,text,text,text,text,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.provision_line_endpoint(uuid,uuid,text,text,text,text,text,uuid)
  TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.rotate_messaging_line_endpoint(
  p_line_id uuid, p_endpoint_id uuid, p_reason text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $fn$
DECLARE
  v_line public.messaging_lines; v_ep public.communication_endpoints;
  v_actor uuid := public.current_user_id(); v_from uuid;
BEGIN
  SELECT * INTO v_line FROM public.messaging_lines WHERE id = p_line_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'ROTATION_LINE_NOT_FOUND'; END IF;
  IF COALESCE(v_line.inbox_key,'') NOT IN ('sales','customer_service') THEN
    RAISE EXCEPTION 'ROTATION_NOT_SALES_ROUTE'; END IF;

  IF v_actor IS NULL OR NOT (v_line.organization_id = ANY (public.current_user_org_ids()))
     OR NOT public.is_org_admin(v_line.organization_id) THEN
    RAISE EXCEPTION 'ROTATION_FORBIDDEN'; END IF;

  SELECT * INTO v_ep FROM public.communication_endpoints WHERE id = p_endpoint_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'ROTATION_ENDPOINT_NOT_FOUND'; END IF;
  IF v_ep.organization_id <> v_line.organization_id THEN RAISE EXCEPTION 'ROTATION_ENDPOINT_FOREIGN_ORG'; END IF;
  IF v_ep.channel <> v_line.channel THEN RAISE EXCEPTION 'ROTATION_CHANNEL_MISMATCH'; END IF;
  IF v_ep.is_active IS NOT TRUE THEN RAISE EXCEPTION 'ROTATION_ENDPOINT_INACTIVE'; END IF;

  -- GUARDA 2: compatibilidade endpoint x Route.
  IF v_ep.purpose = 'vendor_personal' THEN
    RAISE EXCEPTION 'ROTATION_PERSONAL_NOT_ALLOWED';
  END IF;
  IF v_line.inbox_key = 'sales' AND COALESCE(v_ep.purpose,'') <> 'commercial' THEN
    RAISE EXCEPTION 'ROTATION_PURPOSE_LINE_MISMATCH';
  END IF;
  IF v_line.inbox_key = 'customer_service' AND COALESCE(v_ep.purpose,'') <> 'customer_service' THEN
    RAISE EXCEPTION 'ROTATION_PURPOSE_LINE_MISMATCH';
  END IF;

  -- GUARDA 2b: exige vinculo ativo pre-existente; rotacao nao cria vinculo.
  IF NOT EXISTS (SELECT 1 FROM public.messaging_line_endpoints
                  WHERE line_id = p_line_id AND endpoint_id = p_endpoint_id AND is_active) THEN
    RAISE EXCEPTION 'ROTATION_ENDPOINT_NOT_LINKED';
  END IF;

  IF EXISTS (SELECT 1 FROM public.messaging_line_endpoints
              WHERE endpoint_id = p_endpoint_id AND is_active AND line_id <> p_line_id) THEN
    RAISE EXCEPTION 'ROTATION_ENDPOINT_IN_USE';
  END IF;

  v_from := v_line.active_endpoint_id;
  UPDATE public.messaging_lines
     SET active_endpoint_id = p_endpoint_id, updated_at = now() WHERE id = p_line_id;

  INSERT INTO public.messaging_line_rotations
    (organization_id, line_id, from_endpoint_id, to_endpoint_id, reason, rotated_by_user_id)
  VALUES (v_line.organization_id, p_line_id, v_from, p_endpoint_id, p_reason, v_actor);

  RETURN jsonb_build_object('line_id', p_line_id, 'from_endpoint_id', v_from,
                            'to_endpoint_id', p_endpoint_id, 'rotated_by_user_id', v_actor);
END $fn$;