-- Agenda do processo vinda do Nammux (evento process.agenda.changed):
-- audiências, perícias e entrevistas, para o agente de atendimento responder
-- com a data real e para a fila de avisos ao cliente.
--
-- Tudo aqui é da integração: nenhuma tabela existente é alterada.

-- ============================================================
-- Recibo de evento de entrada
-- ============================================================
-- Devolve true só na primeira vez que o evento é aplicado com sucesso. Roda na
-- mesma transação que grava o estado: se a gravação falhar, o recibo é
-- desfeito junto e o reenvio do Nammux tenta de novo. É o que dá efeito
-- "exatamente uma vez" sob entrega repetida.
create or replace function public.nammux_inbound_receipt(
  _organization_id uuid,
  _event_id text,
  _event_type text,
  _opportunity_id uuid,
  _occurred_at timestamptz,
  _summary jsonb
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare v_id uuid;
begin
  insert into public.nammux_sync_events
    (organization_id, opportunity_id, external_event_id, event_type, direction, status, summary, occurred_at)
  values
    (_organization_id, _opportunity_id, _event_id, _event_type, 'inbound', 'processed',
     coalesce(_summary, '{}'::jsonb), _occurred_at)
  on conflict (organization_id, direction, external_event_id)
  do update set status = 'processed',
                error = null,
                summary = excluded.summary,
                opportunity_id = excluded.opportunity_id,
                event_type = excluded.event_type
          where public.nammux_sync_events.status <> 'processed'
  returning id into v_id;
  return v_id is not null;
end;
$$;
revoke all on function public.nammux_inbound_receipt(uuid, text, text, uuid, timestamptz, jsonb) from public, anon, authenticated;
grant execute on function public.nammux_inbound_receipt(uuid, text, text, uuid, timestamptz, jsonb) to service_role;

-- ============================================================
-- Estado da agenda
-- ============================================================
create table if not exists public.nammux_process_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  opportunity_id uuid not null references public.opportunities(id) on delete cascade,
  external_process_id text not null,
  external_event_id text not null,
  event_type text not null check (event_type in ('audiencia', 'pericia', 'entrevista')),
  subtype text,
  status text not null,
  start_at timestamptz not null,
  end_at timestamptz,
  all_day boolean not null default false,
  timezone text not null default 'America/Sao_Paulo',
  modality text,
  location text,
  virtual_link text,
  root_external_event_id text not null,
  rescheduled_from_external_event_id text,
  reschedule_seq integer not null default 0,
  previous_start_at timestamptz,
  cancel_reason text,
  last_change text not null,
  -- Compromisso apagado ou desvinculado do processo no Nammux.
  removed_at timestamptz,
  -- Versão do último evento aplicado. Evento com versão menor é ignorado.
  source_version bigint not null,
  source_updated_at timestamptz,
  last_event_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint nammux_process_events_external_unique unique (organization_id, external_event_id)
);

create index if not exists idx_nammux_process_events_proximos
  on public.nammux_process_events (organization_id, opportunity_id, start_at)
  where status = 'pendente' and removed_at is null;

alter table public.nammux_process_events enable row level security;
revoke all on public.nammux_process_events from public, anon, authenticated;
grant select on public.nammux_process_events to authenticated;
grant all on public.nammux_process_events to service_role;

drop policy if exists "org members read Nammux process events" on public.nammux_process_events;
create policy "org members read Nammux process events"
  on public.nammux_process_events for select to authenticated
  using (organization_id = any (public.current_user_org_ids()));

-- Gancho chamado depois que o estado da agenda muda. Aqui não faz nada; a fila
-- de avisos ao cliente substitui o corpo desta função quando entrar.
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
  return;
end;
$$;
revoke all on function public.nammux_after_process_event(uuid, text, text) from public, anon, authenticated;
grant execute on function public.nammux_after_process_event(uuid, text, text) to service_role;

-- Aplica um process.agenda.changed. Devolve {status}:
--   applied               estado gravado
--   duplicate             este evento já tinha sido aplicado
--   stale                 já existe versão mais nova do compromisso; ignorado
--   opportunity_not_found negócio não existe nesta organização (recusa definitiva)
--   invalid               payload fora do contrato (recusa definitiva)
-- Erro inesperado sobe como exceção: nada é gravado e o Nammux reenvia.
create or replace function public.nammux_apply_process_event(
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
  v_ev jsonb := _data->'event';
  v_change text := _data->>'change';
  v_reason text := coalesce(nullif(_data->>'reason', ''), 'live');
  v_opp uuid;
  v_version bigint;
  v_start timestamptz;
  v_end timestamptz;
  v_prev timestamptz;
  v_source_updated timestamptz;
  v_row_id uuid;
begin
  if coalesce(_event_id, '') = '' then
    return jsonb_build_object('status', 'invalid', 'error', 'event_id_required');
  end if;
  if v_ev is null or jsonb_typeof(v_ev) <> 'object' then
    return jsonb_build_object('status', 'invalid', 'error', 'event_required');
  end if;
  if coalesce(v_ev->>'id', '') = '' or coalesce(_data->>'external_process_id', '') = '' then
    return jsonb_build_object('status', 'invalid', 'error', 'ids_required');
  end if;
  if coalesce(v_ev->>'type', '') not in ('audiencia', 'pericia', 'entrevista') then
    return jsonb_build_object('status', 'invalid', 'error', 'event_type_invalid');
  end if;
  if coalesce(v_change, '') not in ('scheduled', 'rescheduled', 'details_updated', 'cancelled',
                                    'superseded', 'completed', 'no_show', 'removed') then
    return jsonb_build_object('status', 'invalid', 'error', 'change_invalid');
  end if;
  if coalesce(v_ev->>'status', '') = '' then
    return jsonb_build_object('status', 'invalid', 'error', 'status_required');
  end if;

  begin
    v_opp := (_data->>'seialz_opportunity_id')::uuid;
    v_version := (_data->>'version')::bigint;
    v_start := (v_ev->>'start_at')::timestamptz;
    v_end := nullif(v_ev->>'end_at', '')::timestamptz;
    v_prev := nullif(v_ev->>'previous_start_at', '')::timestamptz;
    v_source_updated := nullif(v_ev->>'updated_at', '')::timestamptz;
  exception when others then
    return jsonb_build_object('status', 'invalid', 'error', 'malformed_field');
  end;
  if v_opp is null or v_version is null or v_start is null then
    return jsonb_build_object('status', 'invalid', 'error', 'required_field_missing');
  end if;

  if not exists (
    select 1 from public.opportunities o
     where o.id = v_opp and o.organization_id = _organization_id and o.deleted_at is null
  ) then
    return jsonb_build_object('status', 'opportunity_not_found');
  end if;

  if not public.nammux_inbound_receipt(
       _organization_id, _event_id, 'process.agenda.changed', v_opp, _occurred_at,
       jsonb_build_object('external_event_id', v_ev->>'id', 'change', v_change,
                          'reason', v_reason, 'version', v_version)) then
    return jsonb_build_object('status', 'duplicate');
  end if;

  insert into public.nammux_process_events as t (
    organization_id, opportunity_id, external_process_id, external_event_id, event_type, subtype,
    status, start_at, end_at, all_day, timezone, modality, location, virtual_link,
    root_external_event_id, rescheduled_from_external_event_id, reschedule_seq, previous_start_at,
    cancel_reason, last_change, removed_at, source_version, source_updated_at, last_event_id
  ) values (
    _organization_id, v_opp, _data->>'external_process_id', v_ev->>'id', v_ev->>'type', nullif(v_ev->>'subtype', ''),
    v_ev->>'status', v_start, v_end, coalesce((v_ev->>'all_day')::boolean, false),
    coalesce(nullif(v_ev->>'timezone', ''), 'America/Sao_Paulo'),
    nullif(v_ev->>'modality', ''), nullif(v_ev->>'location', ''), nullif(v_ev->>'virtual_link', ''),
    coalesce(nullif(v_ev->>'root_event_id', ''), v_ev->>'id'),
    nullif(v_ev->>'rescheduled_from_event_id', ''),
    coalesce((v_ev->>'reschedule_seq')::integer, 0), v_prev,
    nullif(v_ev->>'cancel_reason', ''), v_change,
    case when v_change = 'removed' then now() end,
    v_version, v_source_updated, _event_id
  )
  on conflict (organization_id, external_event_id) do update set
    opportunity_id = excluded.opportunity_id,
    external_process_id = excluded.external_process_id,
    event_type = excluded.event_type,
    subtype = excluded.subtype,
    status = excluded.status,
    start_at = excluded.start_at,
    end_at = excluded.end_at,
    all_day = excluded.all_day,
    timezone = excluded.timezone,
    modality = excluded.modality,
    location = excluded.location,
    virtual_link = excluded.virtual_link,
    root_external_event_id = excluded.root_external_event_id,
    rescheduled_from_external_event_id = excluded.rescheduled_from_external_event_id,
    reschedule_seq = excluded.reschedule_seq,
    previous_start_at = excluded.previous_start_at,
    cancel_reason = excluded.cancel_reason,
    last_change = excluded.last_change,
    removed_at = excluded.removed_at,
    source_version = excluded.source_version,
    source_updated_at = excluded.source_updated_at,
    last_event_id = excluded.last_event_id,
    updated_at = now()
  where t.source_version < excluded.source_version
  returning t.id into v_row_id;

  if v_row_id is null then
    update public.nammux_sync_events
       set summary = summary || jsonb_build_object('ignored_as_stale', true)
     where organization_id = _organization_id and direction = 'inbound' and external_event_id = _event_id;
    return jsonb_build_object('status', 'stale');
  end if;

  perform public.nammux_after_process_event(v_row_id, v_change, v_reason);

  return jsonb_build_object('status', 'applied', 'id', v_row_id, 'change', v_change);
end;
$$;
revoke all on function public.nammux_apply_process_event(uuid, text, jsonb, timestamptz) from public, anon, authenticated;
grant execute on function public.nammux_apply_process_event(uuid, text, jsonb, timestamptz) to service_role;
