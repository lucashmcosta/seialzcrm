-- =====================================================================
-- Etapa 1 — Herança das regras de entrada (inbound_settings) no
-- provisionamento de novos endpoints WhatsApp.
-- Provider-agnóstico + ordenação determinística.
-- Nenhuma tabela/coluna é alterada; nenhum endpoint existente é escrito.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.fn_default_inbound_settings(
  p_organization_id uuid, p_purpose text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_inbox text;
  v_route_active uuid;
  v_settings jsonb;
BEGIN
  IF p_organization_id IS NULL OR p_purpose IS NULL THEN
    RETURN NULL;
  END IF;

  v_inbox := CASE WHEN p_purpose = 'customer_service' THEN 'customer_service' ELSE 'sales' END;

  -- Endpoint padrão da Route correspondente (critério de determinismo nº 1).
  SELECT ml.active_endpoint_id INTO v_route_active
    FROM public.messaging_lines ml
   WHERE ml.organization_id = p_organization_id
     AND ml.channel = 'whatsapp'
     AND ml.inbox_key = v_inbox
   ORDER BY ml.created_at ASC, ml.id ASC
   LIMIT 1;

  -- Passo 1: inbound_settings já definido em um endpoint ativo da mesma
  -- organização e mesma finalidade (sem filtro por provider).
  SELECT ce.inbound_settings INTO v_settings
    FROM public.communication_endpoints ce
   WHERE ce.organization_id = p_organization_id
     AND ce.channel = 'whatsapp'
     AND ce.is_active
     AND ce.purpose = p_purpose
     AND ce.inbound_settings IS NOT NULL
   ORDER BY COALESCE(ce.id = v_route_active, false) DESC, ce.created_at ASC, ce.id ASC
   LIMIT 1;
  IF v_settings IS NOT NULL THEN
    RETURN v_settings;
  END IF;

  -- Passo 2: whatsapp_inbound_settings da integração de um endpoint ativo
  -- da mesma organização e mesma finalidade (caminho real hoje).
  SELECT oi.whatsapp_inbound_settings INTO v_settings
    FROM public.communication_endpoints ce
    JOIN public.organization_integrations oi ON oi.id = ce.organization_integration_id
   WHERE ce.organization_id = p_organization_id
     AND ce.channel = 'whatsapp'
     AND ce.is_active
     AND ce.purpose = p_purpose
     AND oi.whatsapp_inbound_settings IS NOT NULL
   ORDER BY COALESCE(ce.id = v_route_active, false) DESC, ce.created_at ASC, ce.id ASC
   LIMIT 1;
  IF v_settings IS NOT NULL THEN
    RETURN v_settings;
  END IF;

  -- Passo 3: fallback padrão.
  RETURN jsonb_build_object(
    'auto_create_contact', true,
    'default_lifecycle_stage', 'lead',
    'auto_create_opportunity', true,
    'default_stage_id', NULL);
END $fn$;

REVOKE ALL ON FUNCTION public.fn_default_inbound_settings(uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_default_inbound_settings(uuid,text) TO authenticated, service_role;

-- ---------------------------------------------------------------------
-- provision_line_endpoint: único ajuste = novos endpoints nascem com
-- inbound_settings herdado. Todo o restante é idêntico.
-- ---------------------------------------------------------------------
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
  v_inbound jsonb := NULL;
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
    -- Herança das regras de entrada efetivas da organização (mesma finalidade).
    v_inbound := public.fn_default_inbound_settings(p_organization_id, p_purpose);
    INSERT INTO public.communication_endpoints (
      organization_id, organization_integration_id, channel, external_address,
      display_name, provider, purpose, assigned_user_id, status, is_active,
      inbound_settings)
    VALUES (p_organization_id, v_integration, 'whatsapp', p_address,
      NULLIF(btrim(COALESCE(p_display_name,'')),''), v_canonical, p_purpose,
      CASE WHEN p_purpose = 'vendor_personal' THEN p_assigned_user_id ELSE NULL END,
      'unknown', true, v_inbound)
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
    'outcome', v_outcome, 'link', v_link_state, 'evolution_mapping', v_evo_state,
    'inbound_settings_inherited', (v_inbound IS NOT NULL));
END $fn$;

REVOKE ALL ON FUNCTION public.provision_line_endpoint(uuid,uuid,text,text,text,text,text,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.provision_line_endpoint(uuid,uuid,text,text,text,text,text,uuid)
  TO authenticated, service_role;