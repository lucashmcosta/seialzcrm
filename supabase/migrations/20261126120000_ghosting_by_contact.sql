-- Alerta de lead sumido (sales_events 'ghosting') parado desde 26/05/2026.
-- Causa: o robô procurava a conversa por message_threads.opportunity_id, que nenhuma conversa nova preenche
-- (0 de 4.785 nos últimos 30 dias). Agora a conversa é a do contato da oportunidade, numa consulta só no banco
-- (antes eram 2 consultas por oportunidade, até 500 por org, de hora em hora).
-- Sumido = oportunidade aberta cuja última mensagem da conversa de vendas foi nossa, e o cliente não responde há N dias
-- (intelligence_settings.behavior.ghosting_threshold_days, padrão 4). Só olha quem respondeu nos últimos 90 dias:
-- lead parado há meses não é "sumiu agora". No máximo um alerta por oportunidade a cada N dias.
-- Rollback: SELECT cron.unschedule('intelligence-ghosting-hourly'); DROP FUNCTION intelligence_detect_ghosting_v1();
--           e reagendar o http_post antigo para a função intelligence-ghosting-detector.
BEGIN;

CREATE OR REPLACE FUNCTION public.intelligence_detect_ghosting_v1()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_count integer;
BEGIN
  WITH orgs AS (
    SELECT s.organization_id, greatest(1, coalesce((s.behavior->>'ghosting_threshold_days')::int, 4)) AS days
    FROM public.intelligence_settings s
    WHERE coalesce((s.behavior->>'detect_ghosting')::boolean, false)
      AND NOT coalesce((s.privacy->>'org_opt_out')::boolean, false)
  ), last_thread AS (
    -- conversa de vendas mais recente de cada contato
    SELECT DISTINCT ON (t.organization_id, t.contact_id)
      t.organization_id, t.contact_id, t.last_inbound_at, t.last_message_at, t.last_message_direction
    FROM public.message_threads t JOIN orgs ON orgs.organization_id = t.organization_id
    WHERE t.contact_id IS NOT NULL AND t.merged_into_thread_id IS NULL
      AND t.business_context IS DISTINCT FROM 'customer_service'
      AND t.last_message_at > now() - interval '90 days'
    ORDER BY t.organization_id, t.contact_id, t.last_message_at DESC NULLS LAST
  ), candidates AS (
    SELECT DISTINCT ON (o.id) o.id, o.organization_id, o.contact_id, o.owner_user_id, lt.last_inbound_at, orgs.days
    FROM public.opportunities o
    JOIN orgs ON orgs.organization_id = o.organization_id
    JOIN last_thread lt ON lt.organization_id = o.organization_id AND lt.contact_id = o.contact_id
    WHERE o.status::text = 'open' AND o.deleted_at IS NULL
      AND lt.last_message_direction = 'outbound'
      AND lt.last_inbound_at IS NOT NULL
      AND lt.last_inbound_at < now() - make_interval(days => orgs.days)
      AND lt.last_inbound_at > now() - interval '90 days'
      AND NOT EXISTS (SELECT 1 FROM public.sales_events e
                      WHERE e.opportunity_id = o.id AND e.event_type = 'ghosting'
                        AND e.occurred_at > now() - make_interval(days => orgs.days))
  )
  INSERT INTO public.sales_events (organization_id, opportunity_id, contact_id, user_id, event_type, occurred_at, payload)
  SELECT c.organization_id, c.id, c.contact_id, c.owner_user_id, 'ghosting', now(),
         jsonb_build_object('threshold_days', c.days, 'last_inbound_at', c.last_inbound_at, 'source', 'contact_thread')
  FROM candidates c;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END $$;
REVOKE ALL ON FUNCTION public.intelligence_detect_ghosting_v1() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.intelligence_detect_ghosting_v1() TO service_role;

-- O cron passa a chamar o banco direto (sem HTTP nem token no comando).
SELECT cron.unschedule('intelligence-ghosting-hourly')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'intelligence-ghosting-hourly');
SELECT cron.schedule('intelligence-ghosting-hourly', '0 * * * *', $$SELECT public.intelligence_detect_ghosting_v1()$$);

INSERT INTO supabase_migrations.schema_migrations(version, name)
VALUES ('20261126120000', 'ghosting_by_contact') ON CONFLICT DO NOTHING;
COMMIT;
