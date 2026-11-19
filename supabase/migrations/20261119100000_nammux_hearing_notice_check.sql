-- Conferência "o que o cliente ouviu x a agenda".
--
-- Medido em 19/11/2026: em 17 processos arquivados por ausência do reclamante,
-- o tribunal tinha marcado a audiência, a data estava no sistema e o cliente
-- não foi avisado — vários ouviram "estamos aguardando a designação" quando a
-- audiência já estava marcada. No mesmo dia havia cliente avisado de uma hora
-- diferente da real e cliente avisado de uma audiência que o tribunal já tinha
-- cancelado.
--
-- Esta conferência compara, para cada audiência futura que o Nammux mandou
-- (`nammux_process_events`), a data e a hora da agenda com a última data e
-- hora que NÓS escrevemos ao cliente nas conversas. Devolve só o que pede
-- atenção:
--   * `sem_aviso`        audiência próxima e nenhuma mensagem nossa com a data;
--   * `hora_diferente`   avisamos o dia certo, com outra hora;
--   * `data_mudou`       avisamos uma data futura que depois foi cancelada ou
--                        remarcada, e não escrevemos mais nada sobre isso.
--
-- Sem IA: lê data e hora por expressão regular nos formatos que a equipe e os
-- modelos usam. Mensagem em que a data não foi reconhecida conta como "sem
-- aviso" — a tela diz "não achei", não "não avisou".
-- Só leitura. Vale para qualquer organização; a tela fica atrás da flag
-- `nammux_hearing_check`, desligada por padrão.

-- Datas com hora citadas num texto:
--   "📅 Data: *19/11/2026* ⏰ Horário: *08:30*" · "19 de Novembro de 2026 ... 08:30"
--   "19/11/2026 (quinta-feira) ⏰ Horário: 10h25" · "dia 19/11 às 9h"
-- Sem ano, vale o ano da mensagem (ou o seguinte, se a data já tinha passado).
create or replace function public.nammux_hearing_mentions(_text text, _ref date)
returns table (dia date, hora text)
language sql
immutable
set search_path = public
as $$
  with m as (
    select regexp_matches(
             regexp_replace(coalesce(_text, ''), '\s+', ' ', 'g'),
             '(?:^|[^0-9/.])(\d{1,2})(?:[/.](\d{1,2})(?:[/.](20\d{2}))?|\s+de\s+([[:alpha:]]+)(?:\s+de\s+(20\d{2}))?)(?![0-9/.])[^0-9]{0,60}?(\d{1,2})\s?(?:[:hH]\s?(\d{2})|[hH])(?![0-9])',
             'gi') as g
  ), p as (
    select g[1]::int as d,
           coalesce(g[2]::int, array_position(
             array['janeiro','fevereiro','marco','abril','maio','junho','julho','agosto','setembro','outubro','novembro','dezembro'],
             translate(lower(g[4]), 'çã', 'ca'))) as mes,
           coalesce(g[3], g[5])::int as ano,
           g[6]::int as h, coalesce(g[7], '00')::int as mi
      from m
  ), q as (
    select d, mes, h, mi,
           coalesce(ano, case
             when mes between 1 and 12 and d between 1 and 28
                  and make_date(extract(year from _ref)::int, mes, d) < _ref - 30 then extract(year from _ref)::int + 1
             else extract(year from _ref)::int end) as ano
      from p
  )
  select make_date(ano, mes, d), lpad(h::text, 2, '0') || ':' || lpad(mi::text, 2, '0')
    from q
   where mes between 1 and 12 and d >= 1 and h between 0 and 23 and mi between 0 and 59
     and d <= extract(day from (make_date(ano, mes, 1) + interval '1 month' - interval '1 day'))::int;
$$;

create or replace function public.nammux_hearing_notice_check(_organization_id uuid, _days int default 15)
returns table (
  kind text, opportunity_id uuid, contact_id uuid, contact_name text, cnj text,
  subtype text, modality text, start_at timestamptz, timezone text,
  event_day date, event_hour text,
  told_day date, told_hour text, told_at timestamptz, last_outbound_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $function$
declare
  v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
  v_dias int := least(greatest(coalesce(_days, 15), 1), 60);
begin
  if not public.user_has_org_access(_organization_id) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  return query
  with ev as (
    -- audiências futuras que o Nammux mandou, com o cliente do negócio
    select e.opportunity_id, o.contact_id, e.subtype, e.modality, e.start_at, e.all_day,
           coalesce(e.timezone, 'America/Sao_Paulo') as tz,
           (e.start_at at time zone coalesce(e.timezone, 'America/Sao_Paulo'))::date as d,
           to_char(e.start_at at time zone coalesce(e.timezone, 'America/Sao_Paulo'), 'HH24:MI') as h
      from public.nammux_process_events e
      join public.opportunities o on o.id = e.opportunity_id and o.organization_id = e.organization_id
     where e.organization_id = _organization_id
       and e.event_type = 'audiencia' and e.status = 'pendente' and e.removed_at is null
       and o.contact_id is not null and o.deleted_at is null
       and (case when e.all_day then (e.start_at at time zone 'UTC')::date
                 else (e.start_at at time zone coalesce(e.timezone, 'America/Sao_Paulo'))::date end) >= v_hoje
  ), cli as (
    -- clientes com algum compromisso do Nammux (inclusive os que só têm audiência cancelada)
    select distinct o.contact_id
      from public.nammux_process_events e
      join public.opportunities o on o.id = e.opportunity_id and o.organization_id = e.organization_id
     where e.organization_id = _organization_id and o.contact_id is not null
  ), msg as (
    select t.contact_id, m.created_at, m.content
      from public.message_threads t
      join public.messages m on m.thread_id = t.id
     where t.organization_id = _organization_id and t.contact_id in (select c.contact_id from cli c)
       and m.direction = 'outbound' and m.deleted_at is null and not coalesce(m.is_internal_note, false)
       and m.created_at > now() - interval '150 days'
  ), ult as (
    select msg.contact_id, max(msg.created_at) as last_outbound_at from msg group by msg.contact_id
  ), men as (
    -- o que escrevemos ao cliente sobre audiência, com data e hora
    select msg.contact_id, msg.created_at, x.dia, x.hora
      from msg, lateral public.nammux_hearing_mentions(msg.content, (msg.created_at at time zone 'America/Sao_Paulo')::date) x
     where msg.content ~* 'audi[eê]ncia|per[ií]cia|📅'
  ), men_ult as (
    -- por cliente e dia, a última vez que falamos desse dia
    select distinct on (men.contact_id, men.dia) men.contact_id, men.dia, men.hora, men.created_at
      from men order by men.contact_id, men.dia, men.created_at desc
  ), mud as (
    -- audiências do cliente que saíram da data em que estavam: canceladas, removidas ou remarcadas
    select distinct on (o.contact_id, x.dia_antigo) o.contact_id, e.opportunity_id, e.subtype, e.modality, x.dia_antigo,
           coalesce(e.timezone, 'America/Sao_Paulo') as tz,
           case when x.remarcada then e.start_at end as novo_inicio,
           case when x.remarcada then (e.start_at at time zone coalesce(e.timezone, 'America/Sao_Paulo'))::date end as novo_dia,
           case when x.remarcada and not e.all_day then to_char(e.start_at at time zone coalesce(e.timezone, 'America/Sao_Paulo'), 'HH24:MI') end as nova_hora
      from public.nammux_process_events e
      join public.opportunities o on o.id = e.opportunity_id and o.organization_id = e.organization_id
      cross join lateral (
        select (e.start_at at time zone coalesce(e.timezone, 'America/Sao_Paulo'))::date as dia_antigo, false as remarcada
         where e.status <> 'pendente' or e.removed_at is not null
        union all
        select (e.previous_start_at at time zone coalesce(e.timezone, 'America/Sao_Paulo'))::date, true
         where e.previous_start_at is not null and e.status = 'pendente' and e.removed_at is null
           and (e.previous_start_at at time zone coalesce(e.timezone, 'America/Sao_Paulo'))::date
               <> (e.start_at at time zone coalesce(e.timezone, 'America/Sao_Paulo'))::date
      ) x
     where e.organization_id = _organization_id and e.event_type = 'audiencia' and o.contact_id is not null
       and e.status not in ('concluido', 'nao_compareceu')
     order by o.contact_id, x.dia_antigo, x.remarcada desc, e.updated_at desc
  ), snap as (
    select distinct on (s.opportunity_id) s.opportunity_id, s.cnj
      from public.nammux_process_snapshots s where s.organization_id = _organization_id
     order by s.opportunity_id, s.last_synced_at desc nulls last
  ), problemas as (
    -- audiência próxima sem aviso, ou avisada com outra hora
    select case when mu.contact_id is null then 'sem_aviso' else 'hora_diferente' end as kind,
           ev.opportunity_id, ev.contact_id, ev.subtype, ev.modality, ev.start_at, ev.tz,
           ev.d as event_day, case when ev.all_day then null else ev.h end as event_hour,
           mu.dia as told_day, mu.hora as told_hour, mu.created_at as told_at
      from ev
      left join men_ult mu on mu.contact_id = ev.contact_id and mu.dia = ev.d
     where ev.d <= v_hoje + v_dias
       and (mu.contact_id is null or (not ev.all_day and mu.hora <> ev.h
            -- outra audiência do mesmo cliente nesse dia, na hora que avisamos, explica o aviso
            and not exists (select 1 from ev e2 where e2.contact_id = ev.contact_id and e2.d = ev.d and e2.h = mu.hora)))
    union all
    -- avisamos uma data futura que depois foi cancelada ou remarcada, e desde então
    -- não escrevemos a data nova nem falamos em cancelamento
    select 'data_mudou', mv.opportunity_id, mu.contact_id, mv.subtype, mv.modality, mv.novo_inicio, mv.tz,
           mv.novo_dia, mv.nova_hora, mu.dia, mu.hora, mu.created_at
      from men_ult mu
      join mud mv on mv.contact_id = mu.contact_id and mv.dia_antigo = mu.dia
     where mu.dia >= v_hoje and mu.created_at > now() - interval '120 days'
       and not exists (select 1 from ev where ev.contact_id = mu.contact_id and ev.d = mu.dia)
       and not exists (select 1 from men_ult m2 where m2.contact_id = mu.contact_id and m2.dia = mv.novo_dia and m2.created_at > mu.created_at)
       and not exists (select 1 from msg where msg.contact_id = mu.contact_id and msg.created_at > mu.created_at
                         and msg.content ~* '(cancelad|redesignad|remarcad|adiad|antecipad|nova data)')
  )
  select p.kind, p.opportunity_id, p.contact_id, c.full_name::text, sn.cnj::text,
         p.subtype::text, p.modality::text, p.start_at, p.tz::text,
         p.event_day, p.event_hour, p.told_day, p.told_hour, p.told_at, u.last_outbound_at
    from problemas p
    join public.contacts c on c.id = p.contact_id
    left join snap sn on sn.opportunity_id = p.opportunity_id
    left join ult u on u.contact_id = p.contact_id
   order by coalesce(p.event_day, p.told_day), coalesce(p.event_hour, p.told_hour), c.full_name;
end;
$function$;

revoke all on function public.nammux_hearing_mentions(text, date) from public, anon;
grant execute on function public.nammux_hearing_mentions(text, date) to authenticated, service_role;
revoke all on function public.nammux_hearing_notice_check(uuid, int) from public, anon;
grant execute on function public.nammux_hearing_notice_check(uuid, int) to authenticated, service_role;
