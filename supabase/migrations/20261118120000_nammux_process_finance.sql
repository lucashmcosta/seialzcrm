-- Financeiro do processo vindo do Nammux (evento process.finance.changed):
-- acordo, parcelas e repasses, para o agente de atendimento e para a fila de
-- avisos ao cliente.
--
-- O evento traz o ESTADO de um acordo, de uma parcela ou de um repasse. O que
-- aconteceu ("empresa pagou", "venceu sem pagar") é deduzido aqui, comparando
-- com o estado anterior, na mesma transação que grava o novo.
--
-- No Nammux o financeiro é restrito a dono, admin e advogado. Aqui a tabela é
-- só service_role: ninguém lê pela tela; o agente de atendimento lê pela
-- função dele.

create table if not exists public.nammux_process_finance (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  opportunity_id uuid not null references public.opportunities(id) on delete cascade,
  external_process_id text not null,
  kind text not null check (kind in ('agreement', 'installment', 'payout')),
  external_id text not null,
  -- Parcela → acordo a que pertence.
  parent_external_id text,
  status text,
  -- acordo
  agreed_on date,
  homologated_on date,
  installments_count integer,
  -- parcela
  number integer,
  due_date date,
  effective_due_date date,
  client_amount numeric(14, 2),
  paid_on date,
  manifestation_due_date date,
  -- repasse
  amount numeric(14, 2),
  reversed boolean,
  source_version bigint not null,
  last_event_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint nammux_process_finance_external_unique unique (organization_id, kind, external_id)
);

create index if not exists idx_nammux_process_finance_opportunity
  on public.nammux_process_finance (organization_id, opportunity_id, kind);

alter table public.nammux_process_finance enable row level security;
revoke all on public.nammux_process_finance from public, anon, authenticated;
grant all on public.nammux_process_finance to service_role;

-- Gancho chamado para cada transição deduzida. Aqui não faz nada; a fila de
-- avisos ao cliente substitui o corpo desta função quando entrar.
--   agreement_closed, agreement_homologated,
--   installment_paid, installment_overdue, payment_reversed,
--   payout_done, payout_reversed
create or replace function public.nammux_after_process_finance(
  _finance_id uuid,
  _transition text,
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
revoke all on function public.nammux_after_process_finance(uuid, text, text) from public, anon, authenticated;
grant execute on function public.nammux_after_process_finance(uuid, text, text) to service_role;

-- Grava um assunto (acordo, parcela ou repasse) se a versão for mais nova e
-- devolve as transições que a mudança representa. Uso interno da RPC abaixo.
-- Campo do payload com formato inválido levanta 22023 (e só isso): qualquer
-- outro erro é defeito nosso e tem de subir, para o Nammux reenviar.
create or replace function public.nammux_finance_upsert(
  _organization_id uuid,
  _opportunity_id uuid,
  _external_process_id text,
  _kind text,
  _subject jsonb,
  _version bigint,
  _event_id text,
  _reason text
) returns text[]
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old public.nammux_process_finance;
  v_new public.nammux_process_finance;
  v_transitions text[] := array[]::text[];
  v_t text;
  v_external_id text;
  v_agreed_on date;
  v_homologated_on date;
  v_installments_count integer;
  v_number integer;
  v_due_date date;
  v_effective_due_date date;
  v_client_amount numeric(14, 2);
  v_paid_on date;
  v_manifestation_due_date date;
  v_amount numeric(14, 2);
  v_reversed boolean;
begin
  -- Leitura dos campos: o único trecho em que erro de formato é culpa do payload.
  begin
    if _subject is null or jsonb_typeof(_subject) <> 'object' then
      raise exception 'assunto ausente';
    end if;
    v_external_id := nullif(_subject->>'id', '');
    if v_external_id is null then
      raise exception 'assunto sem id';
    end if;
    v_agreed_on := nullif(_subject->>'agreed_on', '')::date;
    v_homologated_on := nullif(_subject->>'homologated_on', '')::date;
    v_installments_count := nullif(_subject->>'installments_count', '')::integer;
    v_number := nullif(_subject->>'number', '')::integer;
    v_due_date := nullif(_subject->>'due_date', '')::date;
    v_effective_due_date := nullif(_subject->>'effective_due_date', '')::date;
    v_client_amount := nullif(_subject->>'client_amount', '')::numeric;
    v_paid_on := nullif(_subject->>'paid_on', '')::date;
    v_manifestation_due_date := nullif(_subject->>'manifestation_due_date', '')::date;
    v_amount := nullif(_subject->>'amount', '')::numeric;
    v_reversed := nullif(_subject->>'reversed', '')::boolean;
  exception when others then
    raise exception 'NAMMUX_FINANCE_SUBJECT_INVALID' using errcode = '22023';
  end;

  select * into v_old
    from public.nammux_process_finance
   where organization_id = _organization_id and kind = _kind and external_id = v_external_id
     for update;

  if v_old.id is not null and v_old.source_version >= _version then
    return null;  -- já temos esta versão ou uma mais nova
  end if;

  insert into public.nammux_process_finance as t (
    organization_id, opportunity_id, external_process_id, kind, external_id, parent_external_id, status,
    agreed_on, homologated_on, installments_count,
    number, due_date, effective_due_date, client_amount, paid_on, manifestation_due_date,
    amount, reversed, source_version, last_event_id
  ) values (
    _organization_id, _opportunity_id, _external_process_id, _kind, v_external_id,
    nullif(_subject->>'agreement_id', ''), nullif(_subject->>'status', ''),
    v_agreed_on, v_homologated_on, v_installments_count,
    v_number, v_due_date, v_effective_due_date, v_client_amount, v_paid_on, v_manifestation_due_date,
    v_amount, v_reversed, _version, _event_id
  )
  on conflict (organization_id, kind, external_id) do update set
    opportunity_id = excluded.opportunity_id,
    external_process_id = excluded.external_process_id,
    parent_external_id = excluded.parent_external_id,
    status = excluded.status,
    agreed_on = excluded.agreed_on,
    homologated_on = excluded.homologated_on,
    installments_count = excluded.installments_count,
    number = excluded.number,
    due_date = excluded.due_date,
    effective_due_date = excluded.effective_due_date,
    client_amount = excluded.client_amount,
    paid_on = excluded.paid_on,
    manifestation_due_date = excluded.manifestation_due_date,
    amount = excluded.amount,
    reversed = excluded.reversed,
    source_version = excluded.source_version,
    last_event_id = excluded.last_event_id,
    updated_at = now()
  returning t.* into v_new;

  if _kind = 'agreement' then
    if v_old.id is null and v_new.status = 'vigente' then
      v_transitions := array_append(v_transitions, 'agreement_closed');
    end if;
    if v_new.homologated_on is not null and v_old.homologated_on is null then
      v_transitions := array_append(v_transitions, 'agreement_homologated');
    end if;
  elsif _kind = 'installment' then
    if v_new.status = 'paid' and v_old.status is distinct from 'paid' then
      v_transitions := array_append(v_transitions, 'installment_paid');
    elsif v_new.status = 'overdue' and v_old.status is distinct from 'overdue' then
      v_transitions := array_append(v_transitions, 'installment_overdue');
    end if;
    if v_old.status = 'paid' and v_new.status is distinct from 'paid' then
      v_transitions := array_append(v_transitions, 'payment_reversed');
    end if;
  elsif _kind = 'payout' then
    if v_old.id is null and not coalesce(v_new.reversed, false) then
      v_transitions := array_append(v_transitions, 'payout_done');
    end if;
    if v_old.id is not null and coalesce(v_new.reversed, false) and not coalesce(v_old.reversed, false) then
      v_transitions := array_append(v_transitions, 'payout_reversed');
    end if;
  end if;

  foreach v_t in array v_transitions loop
    perform public.nammux_after_process_finance(v_new.id, v_t, _reason);
  end loop;

  return v_transitions;
end;
$$;
revoke all on function public.nammux_finance_upsert(uuid, uuid, text, text, jsonb, bigint, text, text) from public, anon, authenticated;
grant execute on function public.nammux_finance_upsert(uuid, uuid, text, text, jsonb, bigint, text, text) to service_role;

-- Aplica um process.finance.changed. Devolve {status}, como nammux_apply_process_event:
-- applied | duplicate | stale | opportunity_not_found | invalid.
-- Erro inesperado sobe como exceção: nada é gravado e o Nammux reenvia.
create or replace function public.nammux_apply_process_finance(
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
  v_kind text := _data->>'kind';
  v_reason text := coalesce(nullif(_data->>'reason', ''), 'live');
  v_opp uuid;
  v_version bigint;
  v_process text := _data->>'external_process_id';
  v_transitions text[] := array[]::text[];
  v_part text[];
  v_applied boolean := false;
begin
  if coalesce(_event_id, '') = '' then
    return jsonb_build_object('status', 'invalid', 'error', 'event_id_required');
  end if;
  if coalesce(v_kind, '') not in ('agreement', 'installment', 'payout') then
    return jsonb_build_object('status', 'invalid', 'error', 'kind_invalid');
  end if;
  if coalesce(v_process, '') = '' then
    return jsonb_build_object('status', 'invalid', 'error', 'ids_required');
  end if;
  if coalesce(_data->v_kind->>'id', '') = '' then
    return jsonb_build_object('status', 'invalid', 'error', 'subject_required');
  end if;
  if v_kind = 'installment' and coalesce(_data->'agreement'->>'id', '') = '' then
    return jsonb_build_object('status', 'invalid', 'error', 'agreement_required');
  end if;

  begin
    v_opp := (_data->>'seialz_opportunity_id')::uuid;
    v_version := (_data->>'version')::bigint;
  exception when others then
    return jsonb_build_object('status', 'invalid', 'error', 'malformed_field');
  end;
  if v_opp is null or v_version is null then
    return jsonb_build_object('status', 'invalid', 'error', 'required_field_missing');
  end if;

  if not exists (
    select 1 from public.opportunities o
     where o.id = v_opp and o.organization_id = _organization_id and o.deleted_at is null
  ) then
    return jsonb_build_object('status', 'opportunity_not_found');
  end if;

  -- Recibo e estado no mesmo bloco: um campo com formato inválido (data,
  -- número) desfaz tudo, inclusive o recibo, e vira recusa definitiva.
  begin
    if not public.nammux_inbound_receipt(
         _organization_id, _event_id, 'process.finance.changed', v_opp, _occurred_at,
         jsonb_build_object('kind', v_kind, 'external_id', _data->v_kind->>'id',
                            'reason', v_reason, 'version', v_version)) then
      return jsonb_build_object('status', 'duplicate');
    end if;

    -- A parcela traz junto o acordo dela: o acordo é gravado primeiro, e a
    -- ordem de chegada dos eventos deixa de importar.
    if v_kind in ('agreement', 'installment') then
      v_part := public.nammux_finance_upsert(_organization_id, v_opp, v_process, 'agreement',
                                             _data->'agreement', v_version, _event_id, v_reason);
      if v_part is not null then v_applied := true; v_transitions := v_transitions || v_part; end if;
    end if;
    if v_kind in ('installment', 'payout') then
      v_part := public.nammux_finance_upsert(_organization_id, v_opp, v_process, v_kind,
                                             _data->v_kind, v_version, _event_id, v_reason);
      if v_part is not null then v_applied := true; v_transitions := v_transitions || v_part; end if;
    end if;
  exception
    -- Só o que nammux_finance_upsert sinaliza como campo malformado do payload.
    when invalid_parameter_value then
      return jsonb_build_object('status', 'invalid', 'error', 'malformed_field');
  end;

  if not v_applied then
    update public.nammux_sync_events
       set summary = summary || jsonb_build_object('ignored_as_stale', true)
     where organization_id = _organization_id and direction = 'inbound' and external_event_id = _event_id;
    return jsonb_build_object('status', 'stale');
  end if;

  return jsonb_build_object('status', 'applied', 'transitions', to_jsonb(v_transitions));
end;
$$;
revoke all on function public.nammux_apply_process_finance(uuid, text, jsonb, timestamptz) from public, anon, authenticated;
grant execute on function public.nammux_apply_process_finance(uuid, text, jsonb, timestamptz) to service_role;
