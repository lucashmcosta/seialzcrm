-- Convite automático para marcar a ENTREVISTA (integração Nammux).
--
-- Medido em 24/11/2026: 123 clientes da Central estavam na etapa "Entrevista"
-- (aguardando agendamento, não compareceu, reagendada sem data…) sem entrevista
-- futura, parados há semanas. O agente só responde quando o cliente escreve,
-- então ninguém puxava a conversa.
--
-- O que entra:
--   * 3 tipos de aviso: interview_invite, interview_invite_reminder, interview_last_call.
--     Assunto = a oportunidade (subject_type 'opportunity'): o worker confere, na hora
--     de enviar, se o processo ainda está esperando entrevista; se não estiver, cancela.
--   * Cadência por processo: tentativas nos dias 0, 2, 5, 9 e 14 depois do primeiro
--     convite (convite, convite, lembrete, lembrete, último aviso). Uma por dia, no máximo.
--   * nammux_interview_outreach_plan(org, quota): agenda as próximas tentativas de quem
--     já está na cadência e começa até `quota` processos novos, os parados há mais
--     tempo primeiro. A quota vem da função nammux-interview-outreach, que olha a agenda.
-- Tudo atrás da flag `nammux_interview_outreach` (desligada). Vale para qualquer org.

alter table public.nammux_notice_rules drop constraint if exists nammux_notice_rules_kind_check;
alter table public.nammux_notice_rules add constraint nammux_notice_rules_kind_check check (kind in (
  'event_scheduled', 'event_rescheduled', 'event_cancelled',
  'event_reminder_7d', 'event_reminder_1d', 'event_reminder_1h', 'event_starting',
  'interview_slot_unavailable',
  'agreement_homologated', 'installment_paid', 'installment_overdue', 'payout_done',
  'movement_update', 'movement_unfavorable',
  'interview_invite', 'interview_invite_reminder', 'interview_last_call'));

insert into public.nammux_notice_rules (organization_id, kind, enabled, requires_approval) values
  (null, 'interview_invite', true, false),
  (null, 'interview_invite_reminder', true, false),
  (null, 'interview_last_call', true, false)
on conflict do nothing;

alter table public.nammux_notices drop constraint if exists nammux_notices_subject_type_check;
alter table public.nammux_notices add constraint nammux_notices_subject_type_check check (subject_type in (
  'event', 'finance', 'movement', 'interview_request', 'source_event', 'opportunity'));

-- Situações do Nammux em que o processo espera a entrevista ser marcada. "Agendada" fica de fora:
-- mesmo com a data no passado, o Nammux diz que está marcada e o convite soaria errado.
create or replace function public.nammux_interview_waiting_status(_status text)
returns boolean
language sql
immutable
as $$
  select coalesce(_status in ('Aguardando agendamento', 'Não compareceu', 'Reagendada', 'Cancelada'), false);
$$;

-- O processo ainda espera a entrevista? (etapa Entrevista, situação de espera, sem entrevista futura)
create or replace function public.nammux_interview_still_waiting(_organization_id uuid, _opportunity_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.nammux_process_snapshots s
     where s.organization_id = _organization_id and s.opportunity_id = _opportunity_id
       and s.stage_name = 'Entrevista' and public.nammux_interview_waiting_status(s.status_name))
  and not exists (
    select 1 from public.nammux_process_events e
     where e.organization_id = _organization_id and e.opportunity_id = _opportunity_id
       and e.event_type = 'entrevista' and e.status = 'pendente' and e.removed_at is null and e.start_at > now());
$$;
revoke all on function public.nammux_interview_still_waiting(uuid, uuid) from public, anon, authenticated;
grant execute on function public.nammux_interview_still_waiting(uuid, uuid) to service_role;

-- O modelo da Meta deste tipo está aprovado na org? Sem modelo aprovado não se planeja a tentativa:
-- o worker pularia o envio (no_template) e a tentativa seria gasta à toa.
create or replace function public.nammux_interview_outreach_template_ok(_organization_id uuid, _kind text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.nammux_notice_templates nt
      join public.whatsapp_templates w on w.id = nt.whatsapp_template_id
     where nt.organization_id = _organization_id and nt.kind = _kind
       and w.status = 'approved' and coalesce(w.is_active, true));
$$;
revoke all on function public.nammux_interview_outreach_template_ok(uuid, text) from public, anon, authenticated;
grant execute on function public.nammux_interview_outreach_template_ok(uuid, text) to service_role;

-- Cadência: dia (desde o 1º convite) e tipo de cada tentativa.
create or replace function public.nammux_interview_outreach_step(_attempt int)
returns table (day_offset int, kind text)
language sql
immutable
as $$
  select (array[0, 2, 5, 9, 14])[_attempt],
         (array['interview_invite', 'interview_invite', 'interview_invite_reminder', 'interview_invite_reminder', 'interview_last_call'])[_attempt]
   where _attempt between 1 and 5;
$$;

create or replace function public.nammux_interview_outreach_plan(_organization_id uuid, _new_quota int)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_today date := (now() at time zone 'America/Sao_Paulo')::date;
  v_send timestamptz := public.nammux_notice_defer(now());
  v_expires timestamptz := ((v_today + 1) + time '20:00') at time zone 'America/Sao_Paulo';
  r record;
  v_step record;
  v_next int;
  v_prev_offset int;
  v_followups int := 0;
  v_started int := 0;
  v_quota int;
  v_id uuid;
begin
  -- A quota é do DIA: convites novos já criados hoje contam (a rotina pode rodar de novo).
  select greatest(coalesce(_new_quota, 0), 0) - count(*) into v_quota
    from public.nammux_notices n
   where n.organization_id = _organization_id and n.subject_type = 'opportunity' and n.kind = 'interview_invite'
     and n.dedup_key like '%:1' and (n.created_at at time zone 'America/Sao_Paulo')::date = v_today;

  -- 1) Quem já está na cadência: próxima tentativa, se chegou o dia e o processo ainda espera.
  for r in
    -- Tentativa = número no fim da chave. Toda tentativa criada conta, tenha saído ou não
    -- (pulada, vencida, cancelada): a cadência segue para a próxima em vez de travar.
    select n.opportunity_id, n.contact_id,
           max(split_part(n.dedup_key, ':', 3)::int) as last_attempt,
           min(coalesce(n.sent_at, n.created_at)) filter (where n.dedup_key like '%:1') as first_at,
           bool_or(n.status in ('scheduled', 'sending', 'pending_approval')) as open,
           max(coalesce(n.sent_at, n.created_at)) as last_at
      from public.nammux_notices n
     where n.organization_id = _organization_id and n.subject_type = 'opportunity'
       and n.kind in ('interview_invite', 'interview_invite_reminder', 'interview_last_call')
     group by n.opportunity_id, n.contact_id
  loop
    continue when r.open or r.first_at is null or r.last_attempt >= 5;
    continue when not public.nammux_interview_still_waiting(_organization_id, r.opportunity_id);
    v_next := r.last_attempt + 1;
    select * into v_step from public.nammux_interview_outreach_step(v_next);
    continue when v_step.kind is null;
    select s.day_offset into v_prev_offset from public.nammux_interview_outreach_step(r.last_attempt) s;
    -- Chegou o dia contado do 1º convite E passou o intervalo desde a última tentativa
    -- (sem isso, fim de semana ou um processo que volta à espera juntaria várias em dias seguidos).
    continue when (r.first_at at time zone 'America/Sao_Paulo')::date + v_step.day_offset > v_today;
    continue when (r.last_at at time zone 'America/Sao_Paulo')::date + (v_step.day_offset - coalesce(v_prev_offset, 0)) > v_today;
    continue when not public.nammux_interview_outreach_template_ok(_organization_id, v_step.kind);
    v_id := public.nammux_notice_enqueue(_organization_id, r.opportunity_id, r.contact_id, v_step.kind, 'opportunity',
      r.opportunity_id, null, null, 'interview_outreach:' || r.opportunity_id || ':' || v_next, v_send, v_expires, 'outreach');
    if v_id is not null then v_followups := v_followups + 1; end if;
  end loop;

  -- 2) Processos novos: um por cliente. Primeiro "Aguardando agendamento", depois os outros;
  --    dentro de cada grupo, os parados há mais tempo.
  for r in
    select * from (
    select distinct on (o.contact_id) s.opportunity_id, o.contact_id, s.status_changed_at, s.status_name
      from public.nammux_process_snapshots s
      join public.opportunities o on o.id = s.opportunity_id and o.organization_id = s.organization_id and o.deleted_at is null
      join public.contacts c on c.id = o.contact_id
     where s.organization_id = _organization_id
       and s.stage_name = 'Entrevista' and public.nammux_interview_waiting_status(s.status_name)
       and length(regexp_replace(coalesce(c.phone, ''), '\D', '', 'g')) >= 10
       and coalesce(c.do_not_contact, false) = false and c.deleted_at is null
       and not exists (select 1 from public.nammux_notices n
                        where n.organization_id = _organization_id and n.contact_id = o.contact_id
                          and n.subject_type = 'opportunity'
                          and n.kind in ('interview_invite', 'interview_invite_reminder', 'interview_last_call'))
     order by o.contact_id, s.status_changed_at nulls first
    ) x
    order by (x.status_name = 'Aguardando agendamento') desc, x.status_changed_at nulls first
  loop
    exit when v_started >= v_quota or not public.nammux_interview_outreach_template_ok(_organization_id, 'interview_invite');
    continue when not public.nammux_interview_still_waiting(_organization_id, r.opportunity_id);
    v_id := public.nammux_notice_enqueue(_organization_id, r.opportunity_id, r.contact_id, 'interview_invite', 'opportunity',
      r.opportunity_id, null, null, 'interview_outreach:' || r.opportunity_id || ':1', v_send, v_expires, 'outreach');
    if v_id is not null then v_started := v_started + 1; end if;
  end loop;

  return jsonb_build_object('followups', v_followups, 'started', v_started);
end;
$$;
revoke all on function public.nammux_interview_outreach_plan(uuid, int) from public, anon, authenticated;
grant execute on function public.nammux_interview_outreach_plan(uuid, int) to service_role;

-- Números para a quota do dia (função nammux-interview-outreach):
--   pending    convites enviados nos últimos 3 dias de processos que ainda esperam
--   invited    processos com 1º convite entre 3 e 14 dias atrás
--   converted  desses, quantos já não esperam mais (marcaram ou saíram da etapa)
--   sample_opportunity  um processo que espera, para consultar a agenda no Nammux
create or replace function public.nammux_interview_outreach_stats(_organization_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with firsts as (
    select n.opportunity_id, min(n.sent_at) as first_sent, max(n.sent_at) as last_sent
      from public.nammux_notices n
     where n.organization_id = _organization_id and n.subject_type = 'opportunity' and n.status = 'sent'
       and n.kind in ('interview_invite', 'interview_invite_reminder', 'interview_last_call')
     group by n.opportunity_id
  )
  select jsonb_build_object(
    'pending', (select count(*) from firsts f where f.last_sent > now() - interval '3 days'
                  and public.nammux_interview_still_waiting(_organization_id, f.opportunity_id)),
    'invited', (select count(*) from firsts f where f.first_sent between now() - interval '14 days' and now() - interval '3 days'),
    'converted', (select count(*) from firsts f where f.first_sent between now() - interval '14 days' and now() - interval '3 days'
                  and not public.nammux_interview_still_waiting(_organization_id, f.opportunity_id)),
    'sample_opportunity', (select s.opportunity_id from public.nammux_process_snapshots s
                            where s.organization_id = _organization_id and s.stage_name = 'Entrevista'
                              and public.nammux_interview_waiting_status(s.status_name)
                            order by s.updated_at desc limit 1));
$$;
revoke all on function public.nammux_interview_outreach_stats(uuid) from public, anon, authenticated;
grant execute on function public.nammux_interview_outreach_stats(uuid) to service_role;

-- Agendador: dias úteis, 09:05 de Brasília (12:05 UTC). Sem a flag em nenhuma org, só uma consulta.
select cron.unschedule('nammux-interview-outreach')
 where exists (select 1 from cron.job where jobname = 'nammux-interview-outreach');
select cron.schedule('nammux-interview-outreach', '5 12 * * 1-5', $cron$
  SELECT net.http_post(
    url := 'https://qvmtzfvkhkhkhdpclzua.supabase.co/functions/v1/nammux-interview-outreach',
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || (SELECT public.get_internal_function_auth_token())),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
$cron$);
