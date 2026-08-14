CREATE OR REPLACE FUNCTION public.provision_sales_endpoint(p_organization_id uuid, p_line_id uuid, p_provider text, p_address text, p_display_name text DEFAULT NULL::text, p_instance_name text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_actor uuid := public.current_user_id();
  v_line public.messaging_lines;
  v_inst public.evolution_instances;
  v_family text[];
  v_canonical text;
  v_digits text;
  v_endpoint_id uuid;
  v_ep_provider text;
  v_ep_count int;
  v_link_id uuid;
  v_link_active boolean;
  v_outcome text;
  v_link_state text;
  v_evo_state text := NULL;
  v_integration uuid := NULL;
  v_owned boolean := false;
BEGIN
  -- 1. autorizacao
  IF v_actor IS NULL OR p_organization_id IS NULL
     OR NOT (p_organization_id = ANY (public.current_user_org_ids()))
     OR NOT public.can_manage_integrations_in_org(p_organization_id) THEN
    RAISE EXCEPTION 'PROVISION_FORBIDDEN';
  END IF;

  -- 2. whitelist rigida
  IF p_provider = 'meta' THEN
    v_family := ARRAY['meta_cloud_api','meta_cloud_api_coexistence','meta-cloud'];
    v_canonical := 'meta_cloud_api';
  ELSIF p_provider = 'twilio' THEN
    v_family := ARRAY['twilio'];
    v_canonical := 'twilio';
  ELSIF p_provider = 'evolution' THEN
    v_family := ARRAY['evolution_api'];
    v_canonical := 'evolution_api';
  ELSE
    RAISE EXCEPTION 'PROVISION_PROVIDER_UNSUPPORTED';
  END IF;

  IF p_address IS NULL OR btrim(p_address) = '' THEN
    RAISE EXCEPTION 'PROVISION_ADDRESS_REQUIRED';
  END IF;
  v_digits := regexp_replace(p_address, '\D', '', 'g');
  IF length(v_digits) < 8 THEN
    RAISE EXCEPTION 'PROVISION_ADDRESS_INVALID';
  END IF;

  -- 3. Route sales/whatsapp com lock
  SELECT * INTO v_line FROM public.messaging_lines WHERE id = p_line_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'PROVISION_LINE_NOT_FOUND'; END IF;
  IF v_line.organization_id <> p_organization_id THEN RAISE EXCEPTION 'PROVISION_LINE_ORG_MISMATCH'; END IF;
  IF v_line.inbox_key IS DISTINCT FROM 'sales' THEN RAISE EXCEPTION 'PROVISION_NOT_SALES_ROUTE'; END IF;
  IF v_line.channel IS DISTINCT FROM 'whatsapp' THEN RAISE EXCEPTION 'PROVISION_CHANNEL_MISMATCH'; END IF;

  -- 4. lock deterministico por org + numero normalizado
  PERFORM pg_advisory_xact_lock(
    hashtextextended('ce:' || p_organization_id::text || ':whatsapp:' || v_digits, 0));

  -- 5. identidade do endpoint: numero normalizado + familia de provider
  SELECT count(*) INTO v_ep_count FROM public.communication_endpoints
   WHERE organization_id = p_organization_id AND channel = 'whatsapp'
     AND regexp_replace(COALESCE(external_address,''), '\D','','g') = v_digits
     AND provider = ANY (v_family);
  IF v_ep_count > 1 THEN RAISE EXCEPTION 'PROVISION_ENDPOINT_AMBIGUOUS'; END IF;

  IF v_ep_count = 1 THEN
    SELECT id, provider INTO v_endpoint_id, v_ep_provider FROM public.communication_endpoints
     WHERE organization_id = p_organization_id AND channel = 'whatsapp'
       AND regexp_replace(COALESCE(external_address,''), '\D','','g') = v_digits
       AND provider = ANY (v_family)
     FOR UPDATE;
  ELSE
    -- nenhum candidato da propria familia: outro provider com o mesmo numero
    -- so e aceitavel se estiver INATIVO (historico preservado, nunca alterado)
    IF EXISTS (
      SELECT 1 FROM public.communication_endpoints
       WHERE organization_id = p_organization_id AND channel = 'whatsapp'
         AND regexp_replace(COALESCE(external_address,''), '\D','','g') = v_digits
         AND NOT (provider = ANY (v_family))
         AND is_active) THEN
      RAISE EXCEPTION 'PROVISION_ADDRESS_ACTIVE_ON_OTHER_PROVIDER';
    END IF;
  END IF;

  -- 6. posse do endereco na integracao do tenant (antes de qualquer write)
  IF p_provider = 'evolution' THEN
    IF p_instance_name IS NULL OR btrim(p_instance_name) = '' THEN
      RAISE EXCEPTION 'PROVISION_INSTANCE_REQUIRED';
    END IF;
    SELECT * INTO v_inst FROM public.evolution_instances
      WHERE instance_name = p_instance_name FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'PROVISION_INSTANCE_NOT_FOUND'; END IF;
    IF v_inst.organization_id <> p_organization_id THEN RAISE EXCEPTION 'PROVISION_INSTANCE_FOREIGN_ORG'; END IF;
    IF v_inst.endpoint_id IS NOT NULL AND v_endpoint_id IS NOT NULL
       AND v_inst.endpoint_id <> v_endpoint_id THEN
      RAISE EXCEPTION 'PROVISION_INSTANCE_CONFLICT';
    END IF;
    IF COALESCE(v_inst.last_known_state,'unknown') <> 'open' THEN
      RAISE EXCEPTION 'PROVISION_EVOLUTION_NOT_CONNECTED';
    END IF;
    IF v_inst.owner_number_digits IS NULL OR btrim(v_inst.owner_number_digits) = '' THEN
      RAISE EXCEPTION 'PROVISION_EVOLUTION_ADDRESS_UNKNOWN';
    END IF;
    IF regexp_replace(v_inst.owner_number_digits, '\D','','g') <> v_digits THEN
      RAISE EXCEPTION 'PROVISION_EVOLUTION_ADDRESS_MISMATCH';
    END IF;
  ELSE
    SELECT organization_integration_id INTO v_integration FROM public.organization_phone_numbers
     WHERE organization_id = p_organization_id
       AND provider = ANY (v_family || ARRAY[p_provider])
       AND regexp_replace(COALESCE(phone_number,''), '\D','','g') = v_digits
     LIMIT 1;
    IF v_integration IS NOT NULL THEN
      v_owned := true;
    ELSIF v_endpoint_id IS NOT NULL AND v_ep_provider = ANY (v_family) THEN
      v_owned := true;
    END IF;
    IF NOT v_owned THEN RAISE EXCEPTION 'PROVISION_ADDRESS_NOT_OWNED'; END IF;
  END IF;

  -- 7. endpoint: reuso preservando id/credenciais/status, ou criacao neutra
  IF v_endpoint_id IS NOT NULL THEN
    v_outcome := 'reused';
    UPDATE public.communication_endpoints
       SET is_active = true,
           provider = COALESCE(provider, v_canonical),
           display_name = COALESCE(NULLIF(btrim(COALESCE(p_display_name,'')),''), display_name),
           updated_at = now()
     WHERE id = v_endpoint_id;
  ELSE
    v_outcome := 'created';
    INSERT INTO public.communication_endpoints (
      organization_id, organization_integration_id, channel, external_address,
      display_name, provider, purpose, status, is_active)
    VALUES (p_organization_id, v_integration, 'whatsapp', p_address,
      NULLIF(btrim(COALESCE(p_display_name,'')),''), v_canonical, 'commercial', 'unknown', true)
    RETURNING id INTO v_endpoint_id;
  END IF;

  -- 8. vinculo com a Route, sem apagar historico
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
  ELSE
    v_link_state := 'unchanged';
  END IF;

  -- 9. mapping Evolution (idempotente) + coerencia de provisioning_status
  IF p_provider = 'evolution' THEN
    IF v_inst.endpoint_id IS DISTINCT FROM v_endpoint_id THEN
      UPDATE public.evolution_instances
         SET endpoint_id = v_endpoint_id,
             provisioning_status = 'linked',
             updated_at = now()
       WHERE id = v_inst.id;
      v_evo_state := 'linked';
    ELSE
      UPDATE public.evolution_instances
         SET provisioning_status = 'linked', updated_at = now()
       WHERE id = v_inst.id AND provisioning_status <> 'linked';
      v_evo_state := 'unchanged';
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'endpoint_id', v_endpoint_id,
    'line_id', p_line_id,
    'provider', p_provider,
    'address_masked', '****' || right(v_digits, 4),
    'outcome', v_outcome,
    'link', v_link_state,
    'evolution_mapping', v_evo_state);
END
$function$;