-- Filtros do Comercial: "parada há X dias" e "janela de 24h" (aberta/vencida).
--   idle_days  int   sem mensagem (de nenhum lado) há mais de N dias
--   window     'open' | 'closed'   janela de 24h do WhatsApp pela última mensagem DO CLIENTE
-- Só acrescenta condições ao fn_comercial_threads_filtered; lista e contador continuam usando a mesma regra.
DO $mig$
DECLARE v_def text;
BEGIN
  SELECT pg_get_functiondef('public.fn_comercial_threads_filtered(uuid, jsonb)'::regprocedure) INTO v_def;
  IF position('v_idle_days' in v_def) > 0 THEN RETURN; END IF;
  v_def := replace(v_def,
    '  v_thread_ids uuid[];' || chr(10) || 'BEGIN',
    '  v_thread_ids uuid[];' || chr(10) ||
    '  v_idle_days integer := nullif(f->>''idle_days'','''')::integer;' || chr(10) ||
    '  v_window text := nullif(f->>''window'','''');' || chr(10) || 'BEGIN');
  v_def := replace(v_def,
    '    AND (v_thread_ids IS NULL OR mt.id = ANY(v_thread_ids))',
    '    AND (v_thread_ids IS NULL OR mt.id = ANY(v_thread_ids))' || chr(10) ||
    '    AND (v_idle_days IS NULL OR COALESCE(mt.last_message_at, mt.created_at) < now() - make_interval(days => v_idle_days))' || chr(10) ||
    '    AND (v_window IS NULL' || chr(10) ||
    '      OR (v_window = ''open'' AND COALESCE(mt.whatsapp_last_inbound_at, mt.last_inbound_at) >= now() - interval ''24 hours'')' || chr(10) ||
    '      OR (v_window = ''closed'' AND (COALESCE(mt.whatsapp_last_inbound_at, mt.last_inbound_at) IS NULL' || chr(10) ||
    '            OR COALESCE(mt.whatsapp_last_inbound_at, mt.last_inbound_at) < now() - interval ''24 hours'')))');
  IF position('v_idle_days' in v_def) = 0 OR position('v_window = ''closed''' in v_def) = 0 THEN
    RAISE EXCEPTION 'patch_failed';
  END IF;
  EXECUTE v_def;
  REVOKE ALL ON FUNCTION public.fn_comercial_threads_filtered(uuid, jsonb) FROM PUBLIC, anon, authenticated;
END $mig$;
