DO $mig$
DECLARE
  v_def text; v_new text;
BEGIN
  -- provision_line_endpoint_core
  SELECT pg_get_functiondef('public.provision_line_endpoint_core(uuid,uuid,uuid,text,text,text,text,text,uuid,text,text)'::regprocedure) INTO v_def;
  v_new := replace(v_def,
$a$      inbound_settings, sender_sid, external_account_id)
    VALUES (p_organization_id, v_integration, 'whatsapp', p_address,$a$,
$b$      inbound_settings, sender_sid, external_account_id,
      requires_template_outside_window)
    VALUES (p_organization_id, v_integration, 'whatsapp', p_address,$b$);
  v_new := replace(v_new,
$a$      NULLIF(btrim(COALESCE(p_external_account_id,'')),''))
    RETURNING id INTO v_endpoint_id;$a$,
$b$      NULLIF(btrim(COALESCE(p_external_account_id,'')),''),
      -- Capacidade explicita por provider (espelha _shared/whatsapp-provider/capabilities.ts).
      -- v_canonical vem de whitelist; qualquer outro valor fica true (fail-closed).
      (v_canonical IS DISTINCT FROM 'evolution_api'))
    RETURNING id INTO v_endpoint_id;$b$);
  IF v_new = v_def OR position('requires_template_outside_window' in v_new) = 0 THEN
    RAISE EXCEPTION 'patch provision_line_endpoint_core nao aplicado';
  END IF;
  EXECUTE v_new;

  -- provision_sales_endpoint
  SELECT pg_get_functiondef('public.provision_sales_endpoint(uuid,uuid,text,text,text,text)'::regprocedure) INTO v_def;
  v_new := replace(v_def,
$a$      display_name, provider, purpose, status, is_active)
    VALUES (p_organization_id, v_integration, 'whatsapp', p_address,
      NULLIF(btrim(COALESCE(p_display_name,'')),''), v_canonical, 'commercial', 'unknown', true)$a$,
$b$      display_name, provider, purpose, status, is_active,
      requires_template_outside_window)
    VALUES (p_organization_id, v_integration, 'whatsapp', p_address,
      NULLIF(btrim(COALESCE(p_display_name,'')),''), v_canonical, 'commercial', 'unknown', true,
      -- Capacidade explicita por provider; fail-closed para qualquer outro.
      (v_canonical IS DISTINCT FROM 'evolution_api'))$b$);
  IF v_new = v_def THEN
    RAISE EXCEPTION 'patch provision_sales_endpoint nao aplicado';
  END IF;
  EXECUTE v_new;
END
$mig$;