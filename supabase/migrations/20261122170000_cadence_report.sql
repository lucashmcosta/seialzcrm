-- Relatório por régua (qualquer org): inscritos, em andamento, enviados, pulados (e por quê), respostas,
-- saídas por motivo, quantos viraram ganho e o resultado de cada passo (com entregue/aberto/clicado no e-mail).
-- Janela: inscrições dos últimos p_days dias. Leitura para membros da org.
CREATE OR REPLACE FUNCTION public.rpc_cadence_report_v1(p_org uuid, p_days integer DEFAULT 30)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE
  v_from timestamptz := now() - make_interval(days => least(greatest(coalesce(p_days, 30), 1), 365));
  v_out jsonb;
BEGIN
  IF current_user IN ('authenticated', 'anon') AND NOT (p_org = ANY (current_user_org_ids())) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  WITH e AS (
    SELECT en.*, (o.status = 'won' AND coalesce(o.won_at, o.updated_at) >= en.enrolled_at) AS won
    FROM cadence_enrollments en
    JOIN opportunities o ON o.id = en.opportunity_id
    WHERE en.organization_id = p_org AND en.enrolled_at >= v_from
  ),
  s AS (
    SELECT cs.*, e.cadence_id FROM cadence_sends cs JOIN e ON e.id = cs.enrollment_id
  ),
  per_cadence AS (
    SELECT c.id, c.name, c.is_active, c.trigger_type, (c.deleted_at IS NOT NULL) AS deleted,
      (SELECT count(*) FROM e WHERE e.cadence_id = c.id) AS enrolled,
      (SELECT count(*) FROM e WHERE e.cadence_id = c.id AND e.status IN ('active', 'paused')) AS live,
      (SELECT count(*) FROM e WHERE e.cadence_id = c.id AND e.status = 'completed') AS completed,
      (SELECT count(*) FROM e WHERE e.cadence_id = c.id AND e.last_reply_at IS NOT NULL) AS replied,
      (SELECT count(*) FROM e WHERE e.cadence_id = c.id AND e.won) AS won,
      (SELECT coalesce(jsonb_object_agg(r, n), '{}'::jsonb) FROM (
         SELECT coalesce(end_reason, 'sem motivo') r, count(*) n FROM e WHERE e.cadence_id = c.id AND e.status = 'cancelled' GROUP BY 1) x) AS exits,
      (SELECT coalesce(jsonb_object_agg(st, n), '{}'::jsonb) FROM (
         SELECT status st, count(*) n FROM s WHERE s.cadence_id = c.id GROUP BY 1) x) AS sends,
      (SELECT coalesce(jsonb_object_agg(r, n), '{}'::jsonb) FROM (
         SELECT coalesce(result_reason, 'sem motivo') r, count(*) n FROM s WHERE s.cadence_id = c.id AND s.status IN ('skipped', 'failed')
         GROUP BY 1 ORDER BY 2 DESC LIMIT 8) x) AS problems,
      (SELECT coalesce(jsonb_agg(jsonb_build_object(
          'step_id', st.id, 'position', st.position, 'kind', st.kind,
          'label', coalesce(wt.friendly_name, wt.meta_template_name, et.name, st.task_title, st.kind),
          'sent', (SELECT count(*) FROM s WHERE s.step_id = st.id AND s.status = 'sent'),
          'skipped', (SELECT count(*) FROM s WHERE s.step_id = st.id AND s.status = 'skipped'),
          'failed', (SELECT count(*) FROM s WHERE s.step_id = st.id AND s.status = 'failed'),
          'pending', (SELECT count(*) FROM s WHERE s.step_id = st.id AND s.status IN ('pending', 'sending')),
          'cancelled', (SELECT count(*) FROM s WHERE s.step_id = st.id AND s.status = 'cancelled'),
          'delivered', (SELECT count(*) FROM email_messages m JOIN s ON s.id = m.cadence_send_id WHERE s.step_id = st.id AND m.delivered_at IS NOT NULL),
          'opened', (SELECT count(*) FROM email_messages m JOIN s ON s.id = m.cadence_send_id WHERE s.step_id = st.id AND m.opened_at IS NOT NULL),
          'clicked', (SELECT count(*) FROM email_messages m JOIN s ON s.id = m.cadence_send_id WHERE s.step_id = st.id AND m.clicked_at IS NOT NULL)
        ) ORDER BY st.position), '[]'::jsonb)
       FROM cadence_steps st
       LEFT JOIN whatsapp_templates wt ON wt.id = st.template_id
       LEFT JOIN email_templates et ON et.id = st.email_template_id
       WHERE st.cadence_id = c.id) AS steps
    FROM cadences c
    WHERE c.organization_id = p_org
      AND (c.deleted_at IS NULL OR EXISTS (SELECT 1 FROM e WHERE e.cadence_id = c.id))
  )
  SELECT coalesce(jsonb_agg(to_jsonb(p) ORDER BY p.enrolled DESC, p.name), '[]'::jsonb) INTO v_out FROM per_cadence p;
  RETURN jsonb_build_object('since', v_from, 'cadences', v_out);
END $function$;
REVOKE ALL ON FUNCTION public.rpc_cadence_report_v1(uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_cadence_report_v1(uuid, integer) TO authenticated, service_role;
