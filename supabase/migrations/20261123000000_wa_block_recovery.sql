-- Recuperação depois de um bloqueio de envio do WhatsApp (config_values.send_block).
-- Durante o bloqueio o agente pausa (não responde nem faz retomada para o vazio). Quando a Meta
-- volta a aceitar mensagens, o webhook grava config_values.block_recovery = pending e a rotina
-- wa-block-recovery (a cada 10 min) retoma, uma vez por conversa:
--  - janela de 24 h aberta: o agente responde lendo a conversa inteira;
--  - janela fechada: um template de retomada (ai_agents.block_recovery_template_id), espaçado.
-- Vale para todas as organizações; sem template configurado, a janela fechada fica para a equipe.

ALTER TABLE public.ai_agents
  ADD COLUMN IF NOT EXISTS block_recovery_template_id uuid REFERENCES public.whatsapp_templates(id) ON DELETE SET NULL;
COMMENT ON COLUMN public.ai_agents.block_recovery_template_id IS
  'Template enviado, depois de um bloqueio de envio, para quem escreveu durante o bloqueio e está fora da janela de 24 h.';

CREATE TABLE IF NOT EXISTS public.wa_block_recovery_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  organization_integration_id uuid NOT NULL REFERENCES public.organization_integrations(id) ON DELETE CASCADE,
  thread_id uuid NOT NULL REFERENCES public.message_threads(id) ON DELETE CASCADE,
  contact_id uuid,
  agent_id uuid,
  block_since timestamptz NOT NULL,
  last_inbound_at timestamptz,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN (
    'pending', 'agent_replied', 'template_sent', 'skipped_answered', 'skipped_human',
    'skipped_do_not_contact', 'skipped_no_template', 'skipped_closed', 'failed')),
  result text,
  created_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,
  UNIQUE (thread_id, block_since)
);
CREATE INDEX IF NOT EXISTS idx_wa_block_recovery_pending ON public.wa_block_recovery_items (organization_integration_id, status);
ALTER TABLE public.wa_block_recovery_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Org members read block recovery" ON public.wa_block_recovery_items;
CREATE POLICY "Org members read block recovery" ON public.wa_block_recovery_items
  FOR SELECT TO authenticated USING (user_has_org_access(organization_id));
REVOKE INSERT, UPDATE, DELETE ON public.wa_block_recovery_items FROM authenticated, anon;

-- Conversas do número que ficaram sem resposta por causa do bloqueio: a última mensagem do
-- cliente caiu no período (com 2 h de folga antes, para quem escreveu logo antes e teve a
-- resposta recusada) e nenhuma mensagem nossa foi aceita depois dela.
CREATE OR REPLACE FUNCTION public.fn_wa_block_recovery_candidates(p_oi uuid, p_since timestamptz, p_until timestamptz)
RETURNS TABLE (thread_id uuid, contact_id uuid, organization_id uuid, last_in timestamptz, agent_id uuid, with_agent boolean, thread_status text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT t.id, t.contact_id, t.organization_id, li.last_in, t.ai_agent_id,
         (t.ai_agent_id IS NOT NULL AND t.ai_agent_released_at IS NULL AND t.assigned_user_id IS NULL
          AND coalesce(t.needs_human_attention, false) = false),
         t.status
  FROM message_threads t
  JOIN communication_endpoints ce ON ce.id = t.primary_endpoint_id AND ce.organization_integration_id = p_oi
  CROSS JOIN LATERAL (
    SELECT max(m.created_at) AS last_in FROM messages m
    WHERE m.thread_id = t.id AND m.direction = 'inbound' AND m.deleted_at IS NULL
  ) li
  WHERE li.last_in BETWEEN p_since - interval '2 hours' AND p_until
    AND NOT EXISTS (
      SELECT 1 FROM messages m
      WHERE m.thread_id = t.id AND m.direction = 'outbound' AND m.deleted_at IS NULL
        AND m.created_at > li.last_in AND m.whatsapp_status IN ('sent', 'delivered', 'read')
    );
$$;
REVOKE ALL ON FUNCTION public.fn_wa_block_recovery_candidates(uuid, timestamptz, timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_wa_block_recovery_candidates(uuid, timestamptz, timestamptz) TO service_role;

-- Retomada do agente: igual à versão em produção, mais uma condição — o número da conversa não
-- pode estar com o envio bloqueado (senão a tentativa sai para o vazio e é gasta).
CREATE OR REPLACE FUNCTION public.fn_agent_followup_claim(_limit integer DEFAULT 20)
 RETURNS TABLE(thread_id uuid, contact_id uuid, agent_id uuid, organization_id uuid, attempt integer, total integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  return query
  with cand as (
    select t.id, t.contact_id, a.id as agent_id, t.organization_id, a.followup_delays_minutes as d,
           coalesce(a.working_hours->>'timezone', 'America/Sao_Paulo') as tz,
           li.last_in, lm.direction as last_dir, lm.sender_type as last_sender, lm.sent_at as last_at,
           case when t.ai_followup_last_at is not null and t.ai_followup_last_at > coalesce(li.last_in, '-infinity'::timestamptz)
                then t.ai_followup_count else 0 end as eff
    from message_threads t
    join ai_agents a on a.id = t.ai_agent_id and a.is_enabled and a.followup_enabled
    -- Retomada é contato proativo: não vai para quem pediu para não ser contatado.
    join contacts ct on ct.id = t.contact_id and coalesce(ct.do_not_contact, false) = false
    cross join lateral (
      select max(m.sent_at) as last_in from messages m
      where m.thread_id = t.id and m.direction = 'inbound' and m.deleted_at is null
    ) li
    cross join lateral (
      select m.direction, m.sender_type, m.sent_at from messages m
      where m.thread_id = t.id and m.deleted_at is null and coalesce(m.is_internal_note, false) = false
      order by m.sent_at desc limit 1
    ) lm
    where t.ai_agent_id is not null and t.ai_agent_released_at is null
      and t.assigned_user_id is null and coalesce(t.needs_human_attention, false) = false
      and t.status not in ('resolved', 'closed')
      -- Contato numa régua ativa: quem conduz é a régua.
      and not exists (select 1 from cadence_enrollments ce where ce.contact_id = t.contact_id and ce.status = 'active')
      -- Número com o envio bloqueado pela Meta: espera a liberação (a recuperação cuida depois).
      and not exists (
        select 1 from communication_endpoints ep
        join organization_integrations oi on oi.id = ep.organization_integration_id
        where ep.id = t.primary_endpoint_id and oi.config_values ? 'send_block'
      )
  ), due as (
    select c.* from cand c
    where c.last_dir = 'outbound' and c.last_sender = 'agent'
      and c.last_in is not null and c.last_in > now() - interval '23 hours'
      and c.eff < coalesce(array_length(c.d, 1), 0)
      -- Cada tentativa sai no tempo configurado, mas nunca depois de 22 h da última mensagem do
      -- cliente: assim a 2ª retomada sempre cabe na janela de 24 h do WhatsApp.
      -- Se o limite cair de noite, adianta para as 20h do mesmo dia (ou do dia anterior, de madrugada).
      and now() >= least(
        c.last_at + make_interval(mins => c.d[c.eff + 1]),
        (case
           when extract(hour from (c.last_in + interval '22 hours') at time zone c.tz) >= 21
             then date_trunc('day', (c.last_in + interval '22 hours') at time zone c.tz) + interval '20 hours'
           when extract(hour from (c.last_in + interval '22 hours') at time zone c.tz) < 8
             then date_trunc('day', (c.last_in + interval '22 hours') at time zone c.tz) - interval '4 hours'
           else (c.last_in + interval '22 hours') at time zone c.tz
         end) at time zone c.tz
      )
      -- Entre uma retomada e a seguinte, pelo menos 1h30.
      and (c.eff = 0 or c.last_at <= now() - interval '90 minutes')
      and extract(hour from now() at time zone c.tz) between 8 and 20
    order by c.last_at
    limit _limit
  )
  update message_threads t
     set ai_followup_count = due.eff + 1, ai_followup_last_at = now()
    from due
   where t.id = due.id
  returning t.id, due.contact_id, due.agent_id, t.organization_id, due.eff + 1, coalesce(array_length(due.d, 1), 0);
end $function$;
REVOKE ALL ON FUNCTION public.fn_agent_followup_claim(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_agent_followup_claim(integer) TO service_role;

SELECT cron.unschedule('wa-block-recovery') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'wa-block-recovery');
SELECT cron.schedule('wa-block-recovery', '*/10 * * * *', $cron$
  SELECT net.http_post(
    url := 'https://qvmtzfvkhkhkhdpclzua.supabase.co/functions/v1/wa-block-recovery',
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || (SELECT public.get_internal_function_auth_token())),
    body := '{}'::jsonb,
    timeout_milliseconds := 120000
  );
$cron$);
