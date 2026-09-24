DO $m$
DECLARE d text;
BEGIN
  d := pg_get_functiondef('public.fn_enqueue_nammux_contact_contract_replays_v1'::regproc);
  IF position('v_document.external_source is distinct from ''suvsign''' in d) = 0 THEN
    RAISE EXCEPTION 'replay predicate not found';
  END IF;
  d := replace(d, 'v_document.external_source is distinct from ''suvsign''',
                  'coalesce(v_document.external_source, '''') not in (''suvsign'', ''suvsign_v2'')');
  EXECUTE d;

  d := pg_get_functiondef('public.fn_emit_nammux_contact_contract_v1'::regproc);
  IF position('new.external_source = ''suvsign''' in d) = 0 THEN
    RAISE EXCEPTION 'trigger predicate not found';
  END IF;
  d := replace(d, 'new.external_source = ''suvsign''', 'new.external_source in (''suvsign'', ''suvsign_v2'')');
  EXECUTE d;
END $m$;