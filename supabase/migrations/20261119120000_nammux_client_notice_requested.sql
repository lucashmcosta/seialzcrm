-- Avisos de agenda pedidos pelo Nammux (`client.notice.requested`).
--
-- Decisão: o Nammux é o único dono de QUANDO o cliente é avisado sobre
-- audiência, perícia e entrevista. Ele planeja e, na hora de enviar, pede ao
-- Seialz "comunique este cliente", com o estado do compromisso naquele momento.
-- O Seialz só monta o texto (modelos da Meta são dele), escolhe o canal e envia.
--
-- Com a flag `nammux_notices_planned_by_source` ligada na organização, o
-- Seialz deixa de planejar avisos de agenda a partir do espelho
-- (`nammux_process_events`). A confirmação de pedidos de entrevista continua.

-- ============================================================
-- Fila: o estado do compromisso que veio no pedido
-- ============================================================
alter table public.nammux_notices add column if not exists payload jsonb;

alter table public.nammux_notices drop constraint if exists nammux_notices_subject_type_check;
alter table public.nammux_notices add constraint nammux_notices_subject_type_check
  check (subject_type in ('event', 'finance', 'movement', 'interview_request', 'source_event'));

-- ============================================================
-- Aplicar o pedido. Devolve {status}:
--   applied | duplicate | stale (expirado, flag desligada ou regra desligada) |
--   opportunity_not_found | invalid
-- ============================================================
create or replace function public.nammux_apply_client_notice(
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
  v_kind text := _data->>'kind';
  v_key text := _data->>'notice_key';
  v_opp uuid;
  v_start timestamptz;
  v_expires timestamptz;
  v_id uuid;
begin
  if coalesce(_event_id, '') = '' then
    return jsonb_build_object('status', 'invalid', 'error', 'event_id_required');
  end if;
  if coalesce(v_key, '') = '' or length(v_key) > 300 then
    return jsonb_build_object('status', 'invalid', 'error', 'notice_key_required');
  end if;
  if v_kind is null or v_kind not in (
       'event_scheduled', 'event_rescheduled', 'event_cancelled',
       'event_reminder_7d', 'event_reminder_1d', 'event_reminder_1h', 'event_starting') then
    return jsonb_build_object('status', 'invalid', 'error', 'kind_not_supported');
  end if;
  if v_ev is null or jsonb_typeof(v_ev) <> 'object'
     or coalesce(v_ev->>'id', '') = ''
     or coalesce(v_ev->>'type', '') not in ('audiencia', 'pericia', 'entrevista')
     or coalesce(v_ev->>'status', '') = '' then
    return jsonb_build_object('status', 'invalid', 'error', 'event_required');
  end if;
  begin
    v_opp := (_data->>'seialz_opportunity_id')::uuid;
    v_start := (v_ev->>'start_at')::timestamptz;
    v_expires := nullif(_data->>'expires_at', '')::timestamptz;
  exception when others then
    return jsonb_build_object('status', 'invalid', 'error', 'malformed_field');
  end;
  if v_opp is null or v_start is null then
    return jsonb_build_object('status', 'invalid', 'error', 'required_field_missing');
  end if;
  if not exists (
    select 1 from public.opportunities o
     where o.id = v_opp and o.organization_id = _organization_id and o.deleted_at is null
  ) then
    return jsonb_build_object('status', 'opportunity_not_found');
  end if;

  if not public.nammux_inbound_receipt(
       _organization_id, _event_id, 'client.notice.requested', v_opp, _occurred_at,
       jsonb_build_object('kind', v_kind, 'notice_key', v_key, 'external_event_id', v_ev->>'id')) then
    return jsonb_build_object('status', 'duplicate');
  end if;

  -- Avisos desligados na organização, ou o pedido chegou tarde: não envia.
  if not public.fn_feature_flag_enabled('nammux_notices', _organization_id) then
    return jsonb_build_object('status', 'stale', 'reason', 'flag_off');
  end if;
  if v_expires is not null and v_expires <= now() then
    return jsonb_build_object('status', 'stale', 'reason', 'expired');
  end if;

  v_id := public.nammux_notice_enqueue(
    _organization_id, v_opp, null, v_kind, 'source_event',
    -- subject_id é obrigatório: id estável do compromisso no Nammux.
    md5(_organization_id::text || ':' || (v_ev->>'id'))::uuid,
    coalesce(nullif(v_ev->>'root_event_id', ''), v_ev->>'id'),
    v_start,
    'src:' || v_key,
    now(),
    v_expires,
    'live');
  if v_id is null then
    -- Regra desligada, contato inexistente ou o mesmo aviso já na fila.
    return jsonb_build_object('status', 'stale', 'reason', 'not_enqueued');
  end if;
  update public.nammux_notices set payload = v_ev where id = v_id;
  return jsonb_build_object('status', 'applied', 'notice_id', v_id);
end;
$$;
revoke all on function public.nammux_apply_client_notice(uuid, text, jsonb, timestamptz) from public, anon, authenticated;
grant execute on function public.nammux_apply_client_notice(uuid, text, jsonb, timestamptz) to service_role;

-- ============================================================
-- Planejamento pelo espelho: desligável por organização
-- ============================================================
create or replace function public.nammux_after_process_event(
  _process_event_id uuid,
  _change text,
  _reason text
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org uuid;
begin
  perform public.nammux_interview_confirm_from_agenda(_process_event_id);
  select organization_id into v_org from public.nammux_process_events where id = _process_event_id;
  -- Quem planeja é o Nammux: o Seialz não planeja de novo a partir do espelho.
  if v_org is not null and public.fn_feature_flag_enabled('nammux_notices_planned_by_source', v_org) then
    return;
  end if;
  perform public.nammux_plan_event_notices(_process_event_id, _change, _reason);
end;
$$;
revoke all on function public.nammux_after_process_event(uuid, text, text) from public, anon, authenticated;
grant execute on function public.nammux_after_process_event(uuid, text, text) to service_role;
