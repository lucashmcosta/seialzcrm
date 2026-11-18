-- Entrevista agendada pelo cliente com o agente de atendimento.
--
--   1. O agente consulta os horários livres no Nammux (na hora, sem guardar).
--   2. O cliente escolhe; nammux_request_interview grava o pedido e, na mesma
--      transação, o evento `entrevista.agendada` para o outbox.
--   3. O Nammux confere o horário de novo e cria ou remarca a entrevista.
--   4. A volta: `process.agenda.changed` confirma o pedido;
--      `interview.booking.rejected` o recusa (horário tomado nesse meio-tempo).

-- ============================================================
-- Pedidos
-- ============================================================
create table if not exists public.nammux_interview_requests (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  opportunity_id uuid not null references public.opportunities(id) on delete cascade,
  contact_id uuid references public.contacts(id) on delete set null,
  thread_id uuid,
  external_process_id text not null,
  requested_start_at timestamptz not null,
  requested_end_at timestamptz,
  status text not null default 'requested' check (status in ('requested', 'confirmed', 'rejected')),
  -- Chave de idempotência do evento enviado ao Nammux; volta na recusa.
  request_key text not null,
  external_event_id text,
  rejection_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint nammux_interview_requests_key_unique unique (organization_id, request_key)
);
create index if not exists idx_nammux_interview_requests_abertos
  on public.nammux_interview_requests (organization_id, opportunity_id, requested_start_at)
  where status = 'requested';

alter table public.nammux_interview_requests enable row level security;
revoke all on public.nammux_interview_requests from public, anon, authenticated;
grant all on public.nammux_interview_requests to service_role;

-- Grava o pedido e o evento de saída na mesma transação. Devolve {status}:
--   requested          pedido novo, evento enfileirado
--   already_requested  este horário já foi pedido para este negócio e está em aberto ou confirmado
--   no_process         o negócio não tem processo do Nammux
-- Um horário recusado pode ser pedido de novo (vira outro pedido, outra chave).
create or replace function public.nammux_request_interview(
  _organization_id uuid,
  _opportunity_id uuid,
  _contact_id uuid,
  _thread_id uuid,
  _start_at timestamptz,
  _end_at timestamptz default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_process text;
  v_base text;
  v_key text;
  v_recusados integer;
  v_id uuid;
begin
  if _organization_id is null or _opportunity_id is null or _start_at is null then
    raise exception 'NAMMUX_INTERVIEW_PARAMETROS' using errcode = '22023';
  end if;

  select s.external_process_id into v_process
    from public.nammux_process_snapshots s
    join public.opportunities o on o.id = s.opportunity_id
   where s.organization_id = _organization_id
     and s.opportunity_id = _opportunity_id
     and o.deleted_at is null
     and (_contact_id is null or o.contact_id = _contact_id);
  if v_process is null then
    return jsonb_build_object('status', 'no_process');
  end if;

  v_base := 'seialz:entrevista.agendada:' || _organization_id::text || ':' || _opportunity_id::text || ':'
            || to_char(_start_at at time zone 'UTC', 'YYYYMMDD"T"HH24MI"Z"');

  -- Serializa pedidos do mesmo negócio.
  perform pg_advisory_xact_lock(hashtextextended(v_base, 0));

  if exists (
    select 1 from public.nammux_interview_requests r
     where r.organization_id = _organization_id and r.opportunity_id = _opportunity_id
       and r.requested_start_at = _start_at and r.status in ('requested', 'confirmed')
  ) then
    return jsonb_build_object('status', 'already_requested');
  end if;

  select count(*) into v_recusados
    from public.nammux_interview_requests r
   where r.organization_id = _organization_id and r.opportunity_id = _opportunity_id
     and r.requested_start_at = _start_at and r.status = 'rejected';
  v_key := case when v_recusados = 0 then v_base else v_base || ':retry:' || v_recusados::text end;

  insert into public.nammux_interview_requests
    (organization_id, opportunity_id, contact_id, thread_id, external_process_id,
     requested_start_at, requested_end_at, request_key)
  values
    (_organization_id, _opportunity_id, _contact_id, _thread_id, v_process, _start_at, _end_at, v_key)
  returning id into v_id;

  insert into public.integration_events
    (organization_id, aggregate_type, aggregate_id, event_type, payload, idempotency_key)
  values
    (_organization_id, 'opportunity', _opportunity_id, 'entrevista.agendada',
     jsonb_build_object(
       'schema_version', 1,
       'seialz_opportunity_id', _opportunity_id,
       'seialz_contact_id', _contact_id,
       'external_process_id', v_process,
       'slot', jsonb_build_object('start_at', _start_at, 'end_at', _end_at),
       'timezone', 'America/Sao_Paulo',
       'channel', 'whatsapp',
       'chosen_at', now()
     ),
     v_key)
  on conflict (idempotency_key) do nothing;

  return jsonb_build_object('status', 'requested', 'request_id', v_id, 'request_key', v_key);
end;
$$;
revoke all on function public.nammux_request_interview(uuid, uuid, uuid, uuid, timestamptz, timestamptz) from public, anon, authenticated;
grant execute on function public.nammux_request_interview(uuid, uuid, uuid, uuid, timestamptz, timestamptz) to service_role;

-- ============================================================
-- Confirmação (process.agenda.changed) e recusa (interview.booking.rejected)
-- ============================================================
-- A entrevista que chegou do Nammux confirma o pedido em aberto daquele negócio
-- naquele horário. Chamado pelo gancho da agenda.
create or replace function public.nammux_interview_confirm_from_agenda(_process_event_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ev public.nammux_process_events;
  v_rows integer;
begin
  select * into v_ev from public.nammux_process_events where id = _process_event_id;
  if v_ev.id is null or v_ev.event_type <> 'entrevista' or v_ev.status <> 'pendente' or v_ev.removed_at is not null then
    return 0;
  end if;
  update public.nammux_interview_requests r
     set status = 'confirmed', external_event_id = v_ev.external_event_id, updated_at = now()
   where r.organization_id = v_ev.organization_id
     and r.opportunity_id = v_ev.opportunity_id
     and r.requested_start_at = v_ev.start_at
     and r.status = 'requested';
  get diagnostics v_rows = row_count;
  return v_rows;
end;
$$;
revoke all on function public.nammux_interview_confirm_from_agenda(uuid) from public, anon, authenticated;
grant execute on function public.nammux_interview_confirm_from_agenda(uuid) to service_role;

-- O gancho da agenda passa a confirmar pedidos de entrevista. (A fila de avisos,
-- quando entrar, redefine esta função mantendo esta chamada.)
create or replace function public.nammux_after_process_event(
  _process_event_id uuid,
  _change text,
  _reason text
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.nammux_interview_confirm_from_agenda(_process_event_id);
end;
$$;
revoke all on function public.nammux_after_process_event(uuid, text, text) from public, anon, authenticated;
grant execute on function public.nammux_after_process_event(uuid, text, text) to service_role;

-- Gancho da recusa. Aqui não faz nada; a fila de avisos substitui o corpo.
create or replace function public.nammux_after_interview_rejection(_request_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  return;
end;
$$;
revoke all on function public.nammux_after_interview_rejection(uuid) from public, anon, authenticated;
grant execute on function public.nammux_after_interview_rejection(uuid) to service_role;

-- Aplica um interview.booking.rejected. Devolve {status}:
-- applied | duplicate | stale (pedido desconhecido ou já resolvido) |
-- opportunity_not_found | invalid.
create or replace function public.nammux_apply_interview_rejection(
  _organization_id uuid,
  _event_id text,
  _data jsonb,
  _occurred_at timestamptz default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_key text := _data->>'request_key';
  v_reason text := coalesce(nullif(_data->>'rejection_reason', ''), 'unknown');
  v_opp uuid;
  v_id uuid;
begin
  if coalesce(_event_id, '') = '' then
    return jsonb_build_object('status', 'invalid', 'error', 'event_id_required');
  end if;
  if coalesce(v_key, '') = '' then
    return jsonb_build_object('status', 'invalid', 'error', 'request_key_required');
  end if;
  begin
    v_opp := (_data->>'seialz_opportunity_id')::uuid;
  exception when others then
    return jsonb_build_object('status', 'invalid', 'error', 'malformed_field');
  end;
  if v_opp is null then
    return jsonb_build_object('status', 'invalid', 'error', 'required_field_missing');
  end if;
  if not exists (
    select 1 from public.opportunities o
     where o.id = v_opp and o.organization_id = _organization_id and o.deleted_at is null
  ) then
    return jsonb_build_object('status', 'opportunity_not_found');
  end if;

  if not public.nammux_inbound_receipt(
       _organization_id, _event_id, 'interview.booking.rejected', v_opp, _occurred_at,
       jsonb_build_object('request_key', v_key, 'rejection_reason', v_reason)) then
    return jsonb_build_object('status', 'duplicate');
  end if;

  update public.nammux_interview_requests r
     set status = 'rejected', rejection_reason = v_reason, updated_at = now()
   where r.organization_id = _organization_id
     and r.opportunity_id = v_opp
     and r.request_key = v_key
     and r.status = 'requested'
  returning r.id into v_id;

  if v_id is null then
    update public.nammux_sync_events
       set summary = summary || jsonb_build_object('ignored_as_stale', true)
     where organization_id = _organization_id and direction = 'inbound' and external_event_id = _event_id;
    return jsonb_build_object('status', 'stale');
  end if;

  perform public.nammux_after_interview_rejection(v_id);
  return jsonb_build_object('status', 'applied', 'request_id', v_id);
end;
$$;
revoke all on function public.nammux_apply_interview_rejection(uuid, text, jsonb, timestamptz) from public, anon, authenticated;
grant execute on function public.nammux_apply_interview_rejection(uuid, text, jsonb, timestamptz) to service_role;

-- ============================================================
-- Assinatura do evento de saída
-- ============================================================
-- Mesma função de antes, com uma terceira assinatura: `entrevista.agendada`.
-- Ela depende só de a integração estar ligada (não do envio de negócio ganho).
create or replace function public.fn_sync_nammux_subscription(p_org_id uuid)
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_enabled boolean := false;
  v_send_won boolean := false;
  v_has_credential boolean := false;
  v_cfg jsonb := '{}'::jsonb;
begin
  select
    oi.is_enabled
      and coalesce((oi.config_values->>'enabled')::boolean, true),
    coalesce((oi.config_values->>'send_opportunity_won')::boolean, true),
    coalesce(oi.config_values, '{}'::jsonb)
  into v_enabled, v_send_won, v_cfg
  from public.organization_integrations oi
  join public.admin_integrations ai on ai.id = oi.integration_id
  where oi.organization_id = p_org_id and ai.slug = 'nammux'
  limit 1;

  select exists (
    select 1
    from public.nammux_integration_credentials c
    where c.organization_id = p_org_id
      and c.is_active
      and c.valid_from <= now()
      and (c.expires_at is null or c.expires_at > now())
  ) into v_has_credential;

  v_enabled := coalesce(v_enabled, false)
    and v_has_credential
    and nullif(btrim(v_cfg->>'webhook_url'), '') is not null;

  insert into public.integration_subscriptions (
    organization_id, integration_slug, event_type, target_action, is_active, config
  ) values
    (p_org_id, 'nammux', 'opportunity.won', 'send_opportunity_won', v_enabled and v_send_won, '{}'::jsonb),
    (p_org_id, 'nammux', 'contact.updated', 'send_contact_updated', v_enabled and v_send_won, '{}'::jsonb),
    (p_org_id, 'nammux', 'entrevista.agendada', 'send_interview_scheduled', v_enabled, '{}'::jsonb)
  on conflict (organization_id, integration_slug, event_type, target_action)
  do update set
    is_active = excluded.is_active,
    paused_until = null;
end;
$function$;

-- Organizações que já têm a integração ganham a assinatura nova. O evento só
-- nasce quando o agente usa a ferramenta, e ela fica atrás de flag.
do $$
declare r record;
begin
  for r in
    select oi.organization_id
      from public.organization_integrations oi
      join public.admin_integrations ai on ai.id = oi.integration_id
     where ai.slug = 'nammux'
  loop
    perform public.fn_sync_nammux_subscription(r.organization_id);
  end loop;
end $$;
