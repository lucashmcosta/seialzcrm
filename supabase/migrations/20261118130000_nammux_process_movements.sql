-- Movimentações relevantes do processo vindas do Nammux (evento
-- process.movement.added), já com o texto em linguagem simples do catálogo de
-- lá. Servem ao agente de atendimento e à fila de avisos ao cliente.

create table if not exists public.nammux_process_movements (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  opportunity_id uuid not null references public.opportunities(id) on delete cascade,
  external_process_id text not null,
  external_movement_id text not null,
  occurred_at timestamptz not null,
  code integer,
  catalog_key text not null,
  text text not null,
  tone text not null check (tone in ('neutra', 'favoravel', 'desfavoravel')),
  -- O catálogo do Nammux marcou este tipo para virar aviso ao cliente.
  notify boolean not null default false,
  source_version bigint not null,
  last_event_id text,
  created_at timestamptz not null default now(),
  constraint nammux_process_movements_external_unique unique (organization_id, external_movement_id)
);

create index if not exists idx_nammux_process_movements_recentes
  on public.nammux_process_movements (organization_id, opportunity_id, occurred_at desc);

alter table public.nammux_process_movements enable row level security;
revoke all on public.nammux_process_movements from public, anon, authenticated;
grant select on public.nammux_process_movements to authenticated;
grant all on public.nammux_process_movements to service_role;

drop policy if exists "org members read Nammux process movements" on public.nammux_process_movements;
create policy "org members read Nammux process movements"
  on public.nammux_process_movements for select to authenticated
  using (organization_id = any (public.current_user_org_ids()));

-- Gancho chamado quando uma movimentação nova é gravada. Aqui não faz nada; a
-- fila de avisos ao cliente substitui o corpo desta função quando entrar.
create or replace function public.nammux_after_process_movement(
  _movement_id uuid,
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
revoke all on function public.nammux_after_process_movement(uuid, text) from public, anon, authenticated;
grant execute on function public.nammux_after_process_movement(uuid, text) to service_role;

-- Aplica um process.movement.added. Devolve {status}:
-- applied | duplicate | stale | opportunity_not_found | invalid.
-- Movimentação não muda depois de gravada: a que já existe é `stale`.
create or replace function public.nammux_apply_process_movement(
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
  v_mov jsonb := _data->'movement';
  v_reason text := coalesce(nullif(_data->>'reason', ''), 'live');
  v_opp uuid;
  v_version bigint;
  v_when timestamptz;
  v_code integer;
  v_notify boolean;
  v_id uuid;
begin
  if coalesce(_event_id, '') = '' then
    return jsonb_build_object('status', 'invalid', 'error', 'event_id_required');
  end if;
  if v_mov is null or jsonb_typeof(v_mov) <> 'object' then
    return jsonb_build_object('status', 'invalid', 'error', 'movement_required');
  end if;
  if coalesce(v_mov->>'id', '') = '' or coalesce(_data->>'external_process_id', '') = '' then
    return jsonb_build_object('status', 'invalid', 'error', 'ids_required');
  end if;
  if coalesce(btrim(v_mov->>'text'), '') = '' or coalesce(v_mov->>'catalog_key', '') = '' then
    return jsonb_build_object('status', 'invalid', 'error', 'text_required');
  end if;
  if coalesce(v_mov->>'tone', '') not in ('neutra', 'favoravel', 'desfavoravel') then
    return jsonb_build_object('status', 'invalid', 'error', 'tone_invalid');
  end if;

  begin
    v_opp := (_data->>'seialz_opportunity_id')::uuid;
    v_version := (_data->>'version')::bigint;
    v_when := (v_mov->>'occurred_at')::timestamptz;
    v_code := nullif(v_mov->>'code', '')::integer;
    v_notify := coalesce(nullif(v_mov->>'notify', '')::boolean, false);
  exception when others then
    return jsonb_build_object('status', 'invalid', 'error', 'malformed_field');
  end;
  if v_opp is null or v_version is null or v_when is null then
    return jsonb_build_object('status', 'invalid', 'error', 'required_field_missing');
  end if;

  if not exists (
    select 1 from public.opportunities o
     where o.id = v_opp and o.organization_id = _organization_id and o.deleted_at is null
  ) then
    return jsonb_build_object('status', 'opportunity_not_found');
  end if;

  if not public.nammux_inbound_receipt(
       _organization_id, _event_id, 'process.movement.added', v_opp, _occurred_at,
       jsonb_build_object('external_movement_id', v_mov->>'id', 'catalog_key', v_mov->>'catalog_key',
                          'reason', v_reason, 'version', v_version)) then
    return jsonb_build_object('status', 'duplicate');
  end if;

  insert into public.nammux_process_movements (
    organization_id, opportunity_id, external_process_id, external_movement_id, occurred_at,
    code, catalog_key, text, tone, notify, source_version, last_event_id
  ) values (
    _organization_id, v_opp, _data->>'external_process_id', v_mov->>'id', v_when,
    v_code, v_mov->>'catalog_key', btrim(v_mov->>'text'), v_mov->>'tone', v_notify, v_version, _event_id
  )
  on conflict (organization_id, external_movement_id) do nothing
  returning id into v_id;

  if v_id is null then
    update public.nammux_sync_events
       set summary = summary || jsonb_build_object('ignored_as_stale', true)
     where organization_id = _organization_id and direction = 'inbound' and external_event_id = _event_id;
    return jsonb_build_object('status', 'stale');
  end if;

  perform public.nammux_after_process_movement(v_id, v_reason);

  return jsonb_build_object('status', 'applied', 'id', v_id);
end;
$$;
revoke all on function public.nammux_apply_process_movement(uuid, text, jsonb, timestamptz) from public, anon, authenticated;
grant execute on function public.nammux_apply_process_movement(uuid, text, jsonb, timestamptz) to service_role;
