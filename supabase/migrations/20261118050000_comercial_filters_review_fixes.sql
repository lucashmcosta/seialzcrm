-- Revisão do PR #220:
-- 1) status legado 'closed' conta como encerrada (fica fora de Abertas/Para responder/Aguardando).
-- 2) janela de 24h usa a mais recente entre last_inbound_at e whatsapp_last_inbound_at (GREATEST),
--    em vez de COALESCE (uma data velha não pode vencer a janela de quem acabou de escrever).
DO $mig$
DECLARE v_def text;
BEGIN
  SELECT pg_get_functiondef('public.fn_comercial_threads_filtered(uuid, jsonb)'::regprocedure) INTO v_def;
  v_def := replace(v_def, $a$WHEN 'resolved' THEN mt.status = 'resolved'$a$, $a$WHEN 'resolved' THEN mt.status IN ('resolved','closed')$a$);
  v_def := replace(v_def, $a$WHEN 'to_reply' THEN mt.status <> 'resolved' AND$a$, $a$WHEN 'to_reply' THEN mt.status NOT IN ('resolved','closed') AND$a$);
  v_def := replace(v_def, $a$WHEN 'awaiting_client' THEN mt.status <> 'resolved' AND$a$, $a$WHEN 'awaiting_client' THEN mt.status NOT IN ('resolved','closed') AND$a$);
  v_def := replace(v_def, $a$ELSE mt.status <> 'resolved' END)$a$, $a$ELSE mt.status NOT IN ('resolved','closed') END)$a$);
  v_def := replace(v_def, 'COALESCE(mt.whatsapp_last_inbound_at, mt.last_inbound_at)', 'GREATEST(mt.whatsapp_last_inbound_at, mt.last_inbound_at)');
  IF position($a$('resolved','closed') END)$a$ in v_def) = 0 OR position('GREATEST(mt.whatsapp_last_inbound_at' in v_def) = 0 THEN
    RAISE EXCEPTION 'patch_failed';
  END IF;
  EXECUTE v_def;
  REVOKE ALL ON FUNCTION public.fn_comercial_threads_filtered(uuid, jsonb) FROM PUBLIC, anon, authenticated;
END $mig$;
