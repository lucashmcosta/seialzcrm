-- Visão Geral acionável da Intelligence: como as conversas andam, sem IA e sem custo.
-- Velocidade da 1ª resposta, onde a conversa para, horário de chegada e resultado por anúncio.
-- Só agregados e textos enviados pela própria empresa. As perguntas dos clientes
-- (texto deles) aparecem só para quem administra a org.
create or replace function public.rpc_intelligence_conversations(p_org uuid, p_days integer default 30)
returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp
as $$
declare
  v_days integer := least(greatest(coalesce(p_days, 30), 1), 90);
  v_since timestamptz := now() - make_interval(days => v_days);
  v_tz text;
  v_admin boolean;
  v_result jsonb;
begin
  if not (p_org = any(public.current_user_org_ids())) then
    return null;
  end if;
  select coalesce(nullif(timezone, ''), 'America/Sao_Paulo') into v_tz from organizations where id = p_org;
  v_admin := public.is_org_system_admin(p_org) or public.can_manage_integrations_in_org(p_org);

  with th as materialized (
    select t.id, t.contact_id
    from message_threads t
    where t.organization_id = p_org and t.channel = 'whatsapp' and t.merged_into_thread_id is null
      and t.created_at >= v_since and coalesce(t.business_context, 'sales') <> 'customer_service'
  ),
  msg as materialized (
    select m.thread_id, m.direction, m.sent_at, m.content,
           row_number() over (partition by m.thread_id order by m.sent_at desc) as rn_desc,
           max(m.sent_at) filter (where m.direction = 'inbound') over (partition by m.thread_id) as last_in
    from messages m join th on th.id = m.thread_id
    where m.organization_id = p_org and m.deleted_at is null and coalesce(m.is_internal_note, false) = false
      and m.direction in ('inbound', 'outbound')
  ),
  per as materialized (
    select th.id, th.contact_id,
      min(msg.sent_at) filter (where msg.direction = 'inbound') as first_in,
      count(*) filter (where msg.direction = 'inbound') as n_in,
      max(msg.sent_at) as last_at,
      max(msg.direction) filter (where msg.rn_desc = 1) as last_dir,
      max(msg.content) filter (where msg.rn_desc = 1) as last_text
    from th join msg on msg.thread_id = th.id
    group by th.id, th.contact_id
  ),
  resp as (
    select p.*, (
      select min(m2.sent_at) from msg m2
      where m2.thread_id = p.id and m2.direction = 'outbound' and m2.sent_at > p.first_in
    ) as first_out
    from per p where p.first_in is not null
  ),
  speed as (
    select case
             when first_out is null then 5
             when first_out - first_in < interval '5 minutes' then 1
             when first_out - first_in < interval '30 minutes' then 2
             when first_out - first_in < interval '2 hours' then 3
             else 4 end as bucket,
           n_in
    from resp
  ),
  -- Texto enviado pela empresa, sem o nome da cliente no começo ("Vanessa, o salário...").
  sent as (
    select msg.thread_id, (msg.sent_at < msg.last_in) as answered,
      lower(btrim(regexp_replace(regexp_replace(
        case when position(', ' in msg.content) between 2 and 21 then substr(msg.content, position(', ' in msg.content) + 2) else msg.content end,
        '\s+', ' ', 'g'), '\s+\?', '?', 'g'))) as key
    from msg
    where msg.direction = 'outbound' and btrim(coalesce(msg.content, '')) like '%?' and length(btrim(msg.content)) >= 15
  ),
  questions as (
    select left(key, 140) as text, count(*) as sent, count(*) filter (where answered) as answered
    from sent where length(key) >= 15 group by 1 having count(*) >= 3
  ),
  stalls as (
    select left(lower(btrim(regexp_replace(
        case when position(', ' in last_text) between 2 and 21 then substr(last_text, position(', ' in last_text) + 2) else last_text end,
        '\s+', ' ', 'g'))), 140) as text, count(*) as n
    from per
    where last_dir = 'outbound' and last_at < now() - interval '24 hours'
      and btrim(coalesce(last_text, '')) <> '' and btrim(last_text) not like '[%'
    group by 1
  ),
  ads as (
    select coalesce(nullif(btrim(c.ad_referral_headline), ''), 'Sem anúncio') as ad, r.n_in, r.contact_id
    from resp r join contacts c on c.id = r.contact_id
  )
  select jsonb_build_object(
    'days', v_days,
    'timezone', v_tz,
    'conversations', (select count(*) from resp),
    'no_reply', (select count(*) from resp where n_in = 1),
    'speed', coalesce((select jsonb_agg(jsonb_build_object('bucket', bucket, 'conversations', n, 'engaged', e) order by bucket)
      from (select bucket, count(*) n, count(*) filter (where n_in >= 5) e from speed group by bucket) s), '[]'::jsonb),
    'hours', coalesce((select jsonb_agg(jsonb_build_object('hour', h, 'conversations', n, 'median_minutes', md) order by h)
      from (select extract(hour from first_in at time zone v_tz)::int h, count(*) n,
                   round((percentile_cont(0.5) within group (order by extract(epoch from (first_out - first_in)) / 60))::numeric) md
            from resp where first_out is not null group by 1) x), '[]'::jsonb),
    'stalls', coalesce((select jsonb_agg(jsonb_build_object('text', text, 'conversations', n) order by n desc)
      from (select * from stalls order by n desc limit 6) y), '[]'::jsonb),
    'stalled_total', (select count(*) from per where last_dir = 'outbound' and last_at < now() - interval '24 hours'),
    'questions', coalesce((select jsonb_agg(jsonb_build_object('text', text, 'sent', sent, 'answered', answered) order by sent desc)
      from (select * from questions order by sent desc limit 8) z), '[]'::jsonb),
    'ads', coalesce((select jsonb_agg(jsonb_build_object('ad', ad, 'conversations', n, 'engaged', e, 'won', w) order by n desc)
      from (select ad, count(*) n, count(*) filter (where n_in >= 5) e,
                   count(distinct a.contact_id) filter (where exists (
                     select 1 from opportunities o where o.contact_id = a.contact_id and o.status = 'won' and o.deleted_at is null)) w
            from ads a group by ad order by count(*) desc limit 8) w), '[]'::jsonb),
    'client_questions', case when v_admin then coalesce((select jsonb_agg(q) from (select q from (
        -- A primeira mensagem costuma ser o texto pronto do anúncio, então fica de fora.
        select distinct on (lower(btrim(m.content))) regexp_replace(left(btrim(m.content), 160), '\d{5,}', '•••', 'g') as q, m.sent_at
        from msg m join per p on p.id = m.thread_id
        where m.direction = 'inbound' and m.sent_at > p.first_in and m.content like '%?%'
          and length(btrim(m.content)) between 12 and 160 and btrim(m.content) not like '[%'
        order by lower(btrim(m.content)), m.sent_at desc) qq
        order by qq.sent_at desc limit 12) ), '[]'::jsonb) end
  ) into v_result;

  return v_result;
end $$;
revoke all on function public.rpc_intelligence_conversations(uuid, integer) from public, anon;
grant execute on function public.rpc_intelligence_conversations(uuid, integer) to authenticated, service_role;
