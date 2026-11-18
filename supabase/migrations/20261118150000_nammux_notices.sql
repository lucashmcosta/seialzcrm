-- Fila de avisos automáticos ao cliente, alimentada pelos eventos do Nammux
-- (agenda, financeiro, movimentações, entrevista).
--
-- O aviso é PLANEJADO na mesma transação que grava o estado que o originou
-- (ganchos nammux_after_*). Como o recibo do evento está nessa transação, o
-- mesmo evento entregue duas vezes não planeja duas vezes; e cada aviso tem uma
-- chave de negócio única por organização, então dois caminhos que chegam ao
-- mesmo aviso produzem uma linha só.
--
-- O texto NÃO é guardado aqui: o worker monta a mensagem na hora do envio, a
-- partir do estado atual (data, link, local). Lembrete nunca sai com dado velho.
--
-- Tudo desligado por padrão: a organização liga com a flag `nammux_notices`.

-- ============================================================
-- Regras
-- ============================================================
-- organization_id nulo = padrão de todas as organizações; a linha da
-- organização substitui o padrão daquele tipo.
create table if not exists public.nammux_notice_rules (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id) on delete cascade,
  kind text not null check (kind in (
    'event_scheduled', 'event_rescheduled', 'event_cancelled',
    'event_reminder_7d', 'event_reminder_1d', 'event_reminder_1h', 'event_starting',
    'interview_slot_unavailable',
    'agreement_homologated', 'installment_paid', 'installment_overdue', 'payout_done',
    'movement_update', 'movement_unfavorable')),
  enabled boolean not null default true,
  -- true: uma pessoa aprova antes de o aviso sair.
  requires_approval boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists ux_nammux_notice_rules_kind
  on public.nammux_notice_rules (coalesce(organization_id, '00000000-0000-0000-0000-000000000000'::uuid), kind);

alter table public.nammux_notice_rules enable row level security;
revoke all on public.nammux_notice_rules from public, anon, authenticated;
grant all on public.nammux_notice_rules to service_role;

-- Padrão: tudo ligado e automático, com duas exceções.
--   movement_unfavorable  passa por uma pessoa (notícia ruim)
--   payout_done           desligado (não estava na lista de avisos pedida)
insert into public.nammux_notice_rules (organization_id, kind, enabled, requires_approval) values
  (null, 'event_scheduled', true, false),
  (null, 'event_rescheduled', true, false),
  (null, 'event_cancelled', true, false),
  (null, 'event_reminder_7d', true, false),
  (null, 'event_reminder_1d', true, false),
  (null, 'event_reminder_1h', true, false),
  (null, 'event_starting', true, false),
  (null, 'interview_slot_unavailable', true, false),
  (null, 'agreement_homologated', true, false),
  (null, 'installment_paid', true, false),
  (null, 'installment_overdue', true, false),
  (null, 'payout_done', false, false),
  (null, 'movement_update', true, false),
  (null, 'movement_unfavorable', true, true)
on conflict do nothing;

create or replace function public.nammux_notice_rule(_organization_id uuid, _kind text)
returns table (enabled boolean, requires_approval boolean)
language sql
stable
security definer
set search_path = public
as $$
  select r.enabled, r.requires_approval
    from public.nammux_notice_rules r
   where r.kind = _kind and (r.organization_id = _organization_id or r.organization_id is null)
   order by (r.organization_id is null)
   limit 1;
$$;
revoke all on function public.nammux_notice_rule(uuid, text) from public, anon, authenticated;
grant execute on function public.nammux_notice_rule(uuid, text) to service_role;

-- Modelo de WhatsApp aprovado de cada tipo de aviso, por organização (modelos
-- são da conta de WhatsApp da organização).
create table if not exists public.nammux_notice_templates (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  kind text not null,
  whatsapp_template_id uuid not null references public.whatsapp_templates(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (organization_id, kind)
);
alter table public.nammux_notice_templates enable row level security;
revoke all on public.nammux_notice_templates from public, anon, authenticated;
grant all on public.nammux_notice_templates to service_role;

-- ============================================================
-- Fila
-- ============================================================
create table if not exists public.nammux_notices (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  contact_id uuid not null references public.contacts(id) on delete cascade,
  opportunity_id uuid references public.opportunities(id) on delete cascade,
  kind text not null,
  -- De onde o worker lê o estado na hora de enviar.
  subject_type text not null check (subject_type in ('event', 'finance', 'movement', 'interview_request')),
  subject_id uuid not null,
  -- Para avisos de agenda: raiz da cadeia de remarcações e a data a que o aviso
  -- se refere. Remarcou → os pendentes da raiz com outra data são cancelados.
  subject_root text,
  subject_start_at timestamptz,
  dedup_key text not null,
  send_at timestamptz not null,
  -- Depois disto o aviso não faz mais sentido e não é enviado.
  expires_at timestamptz,
  status text not null default 'scheduled' check (status in (
    'pending_approval', 'scheduled', 'sending', 'sent',
    'cancelled', 'expired', 'skipped', 'rejected', 'dead_letter', 'needs_review')),
  -- Por que parou: superseded, do_not_contact, no_phone, no_template, no_channel,
  -- subject_gone, unknown_outcome, rule_disabled, flag_off…
  status_reason text,
  channel text,
  attempts integer not null default 0,
  next_attempt_at timestamptz,
  last_error text,
  locked_at timestamptz,
  message_id uuid,
  approved_by_user_id uuid,
  approved_at timestamptz,
  rejected_reason text,
  source_reason text not null default 'live',
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint nammux_notices_dedup unique (organization_id, dedup_key)
);
create index if not exists idx_nammux_notices_due
  on public.nammux_notices (send_at) where status = 'scheduled';
create index if not exists idx_nammux_notices_subject
  on public.nammux_notices (organization_id, subject_type, subject_root) where status in ('scheduled', 'pending_approval');
create index if not exists idx_nammux_notices_review
  on public.nammux_notices (organization_id, created_at desc) where status in ('pending_approval', 'needs_review', 'dead_letter');

alter table public.nammux_notices enable row level security;
revoke all on public.nammux_notices from public, anon, authenticated;
grant all on public.nammux_notices to service_role;

-- ============================================================
-- Horário de silêncio
-- ============================================================
-- Aviso comum só sai entre 08:00 e 20:00 (horário de Brasília). Fora disso vai
-- para o próximo horário permitido — a menos que isso passasse do limite
-- (`_no_later_than`): aí sai na hora, porque avisar tarde é pior que avisar de noite.
create or replace function public.nammux_notice_defer(_at timestamptz, _no_later_than timestamptz default null)
returns timestamptz
language plpgsql
immutable
as $$
declare
  v_local timestamp := _at at time zone 'America/Sao_Paulo';
  v_out timestamp;
begin
  if v_local::time < time '08:00' then
    v_out := v_local::date + time '08:00';
  elsif v_local::time >= time '20:00' then
    v_out := (v_local::date + 1) + time '08:00';
  else
    return _at;
  end if;
  if _no_later_than is not null and (v_out at time zone 'America/Sao_Paulo') > _no_later_than then
    return _at;
  end if;
  return v_out at time zone 'America/Sao_Paulo';
end;
$$;
revoke all on function public.nammux_notice_defer(timestamptz, timestamptz) from public, anon, authenticated;
grant execute on function public.nammux_notice_defer(timestamptz, timestamptz) to service_role;

-- Lembrete com antecedência em dias: mantém o dia, mas dentro de 08:00–20:00.
create or replace function public.nammux_notice_clamp(_at timestamptz)
returns timestamptz
language sql
immutable
as $$
  select case
    when (_at at time zone 'America/Sao_Paulo')::time < time '08:00'
      then ((_at at time zone 'America/Sao_Paulo')::date + time '08:00') at time zone 'America/Sao_Paulo'
    when (_at at time zone 'America/Sao_Paulo')::time > time '20:00'
      then ((_at at time zone 'America/Sao_Paulo')::date + time '20:00') at time zone 'America/Sao_Paulo'
    else _at
  end;
$$;
revoke all on function public.nammux_notice_clamp(timestamptz) from public, anon, authenticated;
grant execute on function public.nammux_notice_clamp(timestamptz) to service_role;

-- ============================================================
-- Inserção de um aviso (regra + chave única)
-- ============================================================
-- Devolve o id do aviso criado, ou null quando não criou (regra desligada,
-- contato ausente, ou a chave já existia).
create or replace function public.nammux_notice_enqueue(
  _organization_id uuid,
  _opportunity_id uuid,
  _contact_id uuid,
  _kind text,
  _subject_type text,
  _subject_id uuid,
  _subject_root text,
  _subject_start_at timestamptz,
  _dedup_key text,
  _send_at timestamptz,
  _expires_at timestamptz,
  _source_reason text
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rule record;
  v_contact uuid := _contact_id;
  v_id uuid;
begin
  select * into v_rule from public.nammux_notice_rule(_organization_id, _kind);
  if v_rule.enabled is not true then
    return null;
  end if;
  if v_contact is null and _opportunity_id is not null then
    select o.contact_id into v_contact from public.opportunities o
     where o.id = _opportunity_id and o.organization_id = _organization_id;
  end if;
  if v_contact is null then
    return null;
  end if;

  insert into public.nammux_notices (
    organization_id, contact_id, opportunity_id, kind, subject_type, subject_id, subject_root,
    subject_start_at, dedup_key, send_at, expires_at, status, source_reason
  ) values (
    _organization_id, v_contact, _opportunity_id, _kind, _subject_type, _subject_id, _subject_root,
    _subject_start_at, _dedup_key, _send_at, _expires_at,
    case when v_rule.requires_approval then 'pending_approval' else 'scheduled' end,
    coalesce(_source_reason, 'live')
  )
  on conflict (organization_id, dedup_key) do nothing
  returning id into v_id;
  return v_id;
end;
$$;
revoke all on function public.nammux_notice_enqueue(uuid, uuid, uuid, text, text, uuid, text, timestamptz, text, timestamptz, timestamptz, text) from public, anon, authenticated;
grant execute on function public.nammux_notice_enqueue(uuid, uuid, uuid, text, text, uuid, text, timestamptz, text, timestamptz, timestamptz, text) to service_role;

-- ============================================================
-- Planejamento: agenda
-- ============================================================
create or replace function public.nammux_plan_event_notices(
  _process_event_id uuid,
  _change text,
  _reason text
) returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  e public.nammux_process_events;
  v_live boolean := coalesce(_reason, 'live') = 'live';
  v_now timestamptz := now();
  v_epoch text;
  v_created integer := 0;
  v_at timestamptz;
  v_day_local date;
  v_terminal boolean;
begin
  select * into e from public.nammux_process_events where id = _process_event_id;
  if e.id is null then
    return 0;
  end if;
  if not public.fn_feature_flag_enabled('nammux_notices', e.organization_id) then
    return 0;
  end if;

  v_terminal := _change in ('cancelled', 'superseded', 'completed', 'no_show', 'removed')
                or e.status <> 'pendente' or e.removed_at is not null;

  if v_terminal then
    -- Este compromisso deixou de valer: caem os avisos pendentes DELE. Os de outra
    -- linha da mesma cadeia (a nova data de uma remarcação) não são tocados.
    -- Aviso já enviado nunca é alterado.
    update public.nammux_notices n
       set status = 'cancelled', status_reason = 'superseded', updated_at = now()
     where n.organization_id = e.organization_id
       and n.subject_type = 'event'
       and n.subject_id = e.id
       and n.status in ('scheduled', 'pending_approval');
  else
    -- Numa cadeia de remarcações, só a linha mais recente planeja. Um evento
    -- atrasado de uma linha antiga não pode derrubar os avisos da nova.
    if exists (
      select 1 from public.nammux_process_events x
       where x.organization_id = e.organization_id
         and x.root_external_event_id = e.root_external_event_id
         and x.id <> e.id
         and x.status = 'pendente' and x.removed_at is null
         and x.reschedule_seq > e.reschedule_seq
    ) then
      return 0;
    end if;
    -- Vale esta linha, nesta data: cai o que estava pendente para a cadeia em
    -- outra linha ou em outra data.
    update public.nammux_notices n
       set status = 'cancelled', status_reason = 'superseded', updated_at = now()
     where n.organization_id = e.organization_id
       and n.subject_type = 'event'
       and n.subject_root = e.root_external_event_id
       and n.status in ('scheduled', 'pending_approval')
       and (n.subject_id <> e.id or n.subject_start_at is distinct from e.start_at);
  end if;

  if _change = 'cancelled' then
    if v_live and public.nammux_notice_enqueue(
         e.organization_id, e.opportunity_id, null, 'event_cancelled', 'event', e.id,
         e.root_external_event_id, e.start_at,
         'event_cancelled:' || e.external_event_id,
         public.nammux_notice_defer(v_now, e.start_at - interval '2 hours'),
         e.start_at + interval '1 day', _reason) is not null then
      v_created := v_created + 1;
    end if;
    return v_created;
  end if;

  if v_terminal then
    return 0;
  end if;
  if e.start_at <= v_now then
    return 0;  -- compromisso que já passou não gera aviso
  end if;

  v_epoch := extract(epoch from e.start_at)::bigint::text;

  -- Anúncio. Só para mudança de verdade: carga inicial e reparo não repetem "foi marcada".
  -- A chave usa a raiz e a data: a mesma audiência, na mesma data, anuncia uma vez.
  if v_live and _change in ('scheduled', 'rescheduled') then
    if public.nammux_notice_enqueue(
         e.organization_id, e.opportunity_id, null,
         case when _change = 'rescheduled' then 'event_rescheduled' else 'event_scheduled' end,
         'event', e.id, e.root_external_event_id, e.start_at,
         'event_announce:' || e.root_external_event_id || ':' || v_epoch,
         public.nammux_notice_defer(v_now, e.start_at - interval '2 hours'),
         e.start_at, _reason) is not null then
      v_created := v_created + 1;
    end if;
  end if;

  -- Lembretes: só os que ainda estão no futuro.
  if e.all_day then
    -- Sem hora definida: 7 dias antes e na véspera, às 10:00. Sem lembrete de 1 h nem "está iniciando".
    v_day_local := (e.start_at at time zone 'America/Sao_Paulo')::date;
    v_at := ((v_day_local - 7) + time '10:00') at time zone 'America/Sao_Paulo';
    if v_at > v_now and public.nammux_notice_enqueue(e.organization_id, e.opportunity_id, null, 'event_reminder_7d', 'event', e.id,
         e.root_external_event_id, e.start_at, 'event_reminder_7d:' || e.root_external_event_id || ':' || v_epoch,
         v_at, ((v_day_local - 2) + time '20:00') at time zone 'America/Sao_Paulo', _reason) is not null then
      v_created := v_created + 1;
    end if;
    v_at := ((v_day_local - 1) + time '10:00') at time zone 'America/Sao_Paulo';
    if v_at > v_now and public.nammux_notice_enqueue(e.organization_id, e.opportunity_id, null, 'event_reminder_1d', 'event', e.id,
         e.root_external_event_id, e.start_at, 'event_reminder_1d:' || e.root_external_event_id || ':' || v_epoch,
         v_at, ((v_day_local - 1) + time '20:00') at time zone 'America/Sao_Paulo', _reason) is not null then
      v_created := v_created + 1;
    end if;
    return v_created;
  end if;

  v_at := public.nammux_notice_clamp(e.start_at - interval '7 days');
  if v_at > v_now and public.nammux_notice_enqueue(e.organization_id, e.opportunity_id, null, 'event_reminder_7d', 'event', e.id,
       e.root_external_event_id, e.start_at, 'event_reminder_7d:' || e.root_external_event_id || ':' || v_epoch,
       v_at, e.start_at - interval '2 days', _reason) is not null then
    v_created := v_created + 1;
  end if;

  v_at := public.nammux_notice_clamp(e.start_at - interval '24 hours');
  if v_at > v_now and public.nammux_notice_enqueue(e.organization_id, e.opportunity_id, null, 'event_reminder_1d', 'event', e.id,
       e.root_external_event_id, e.start_at, 'event_reminder_1d:' || e.root_external_event_id || ':' || v_epoch,
       v_at, e.start_at - interval '3 hours', _reason) is not null then
    v_created := v_created + 1;
  end if;

  -- 1 h antes e "está iniciando": presos à hora do compromisso, sem horário de silêncio.
  v_at := e.start_at - interval '1 hour';
  if v_at > v_now and public.nammux_notice_enqueue(e.organization_id, e.opportunity_id, null, 'event_reminder_1h', 'event', e.id,
       e.root_external_event_id, e.start_at, 'event_reminder_1h:' || e.root_external_event_id || ':' || v_epoch,
       v_at, e.start_at - interval '20 minutes', _reason) is not null then
    v_created := v_created + 1;
  end if;

  v_at := e.start_at - interval '15 minutes';
  if v_at > v_now and public.nammux_notice_enqueue(e.organization_id, e.opportunity_id, null, 'event_starting', 'event', e.id,
       e.root_external_event_id, e.start_at, 'event_starting:' || e.root_external_event_id || ':' || v_epoch,
       v_at, e.start_at + interval '10 minutes', _reason) is not null then
    v_created := v_created + 1;
  end if;

  return v_created;
end;
$$;
revoke all on function public.nammux_plan_event_notices(uuid, text, text) from public, anon, authenticated;
grant execute on function public.nammux_plan_event_notices(uuid, text, text) to service_role;

-- O gancho da agenda: confirma pedido de entrevista (como antes) e planeja os avisos.
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
  perform public.nammux_plan_event_notices(_process_event_id, _change, _reason);
end;
$$;
revoke all on function public.nammux_after_process_event(uuid, text, text) from public, anon, authenticated;
grant execute on function public.nammux_after_process_event(uuid, text, text) to service_role;

-- ============================================================
-- Planejamento: financeiro
-- ============================================================
create or replace function public.nammux_after_process_finance(
  _finance_id uuid,
  _transition text,
  _reason text
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  f public.nammux_process_finance;
  v_kind text;
  v_key text;
begin
  select * into f from public.nammux_process_finance where id = _finance_id;
  if f.id is null or not public.fn_feature_flag_enabled('nammux_notices', f.organization_id) then
    return;
  end if;

  -- Pagamento estornado: o "empresa pagou" que ainda não saiu é cancelado. Se já
  -- saiu, o cliente foi avisado de algo que deixou de ser verdade: vai para uma pessoa.
  if _transition = 'payment_reversed' then
    update public.nammux_notices n
       set status = 'cancelled', status_reason = 'payment_reversed', updated_at = now()
     where n.organization_id = f.organization_id and n.subject_type = 'finance' and n.subject_id = f.id
       and n.kind = 'installment_paid' and n.status in ('scheduled', 'pending_approval');
    update public.nammux_notices n
       set status = 'needs_review', status_reason = 'payment_reversed_after_sent', updated_at = now()
     where n.id = (
       select n2.id from public.nammux_notices n2
        where n2.organization_id = f.organization_id and n2.subject_type = 'finance' and n2.subject_id = f.id
          and n2.kind = 'installment_paid' and n2.status = 'sent'
        order by n2.sent_at desc nulls last limit 1);
    return;
  end if;

  if coalesce(_reason, 'live') <> 'live' then
    return;  -- carga inicial e reparo não avisam o que já aconteceu
  end if;

  if _transition = 'agreement_homologated' then
    v_kind := 'agreement_homologated';
    v_key := 'agreement_homologated:' || f.external_id;
  elsif _transition = 'installment_paid' then
    v_kind := 'installment_paid';
    v_key := 'installment_paid:' || f.external_id || ':' || coalesce(f.paid_on::text, '');
  elsif _transition = 'installment_overdue' then
    v_kind := 'installment_overdue';
    v_key := 'installment_overdue:' || f.external_id || ':' || coalesce(f.effective_due_date::text, '');
  elsif _transition = 'payout_done' then
    v_kind := 'payout_done';
    v_key := 'payout_done:' || f.external_id;
  else
    return;
  end if;

  -- Parcela que venceu e foi paga em seguida: o "não pagou" pendente perde o sentido.
  if _transition = 'installment_paid' then
    update public.nammux_notices n
       set status = 'cancelled', status_reason = 'paid_meanwhile', updated_at = now()
     where n.organization_id = f.organization_id and n.subject_type = 'finance' and n.subject_id = f.id
       and n.kind = 'installment_overdue' and n.status in ('scheduled', 'pending_approval');
  end if;

  perform public.nammux_notice_enqueue(
    f.organization_id, f.opportunity_id, null, v_kind, 'finance', f.id, null, null, v_key,
    public.nammux_notice_defer(now()), now() + interval '7 days', _reason);
end;
$$;
revoke all on function public.nammux_after_process_finance(uuid, text, text) from public, anon, authenticated;
grant execute on function public.nammux_after_process_finance(uuid, text, text) to service_role;

-- ============================================================
-- Planejamento: movimentações e recusa de entrevista
-- ============================================================
create or replace function public.nammux_after_process_movement(
  _movement_id uuid,
  _reason text
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  m public.nammux_process_movements;
begin
  select * into m from public.nammux_process_movements where id = _movement_id;
  if m.id is null or not m.notify or coalesce(_reason, 'live') <> 'live'
     or not public.fn_feature_flag_enabled('nammux_notices', m.organization_id) then
    return;
  end if;
  perform public.nammux_notice_enqueue(
    m.organization_id, m.opportunity_id, null,
    case when m.tone = 'desfavoravel' then 'movement_unfavorable' else 'movement_update' end,
    'movement', m.id, null, null, 'movement:' || m.external_movement_id,
    public.nammux_notice_defer(now()), now() + interval '7 days', _reason);
end;
$$;
revoke all on function public.nammux_after_process_movement(uuid, text) from public, anon, authenticated;
grant execute on function public.nammux_after_process_movement(uuid, text) to service_role;

create or replace function public.nammux_after_interview_rejection(_request_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  r public.nammux_interview_requests;
begin
  select * into r from public.nammux_interview_requests where id = _request_id;
  if r.id is null or not public.fn_feature_flag_enabled('nammux_notices', r.organization_id) then
    return;
  end if;
  -- Sai na hora, mesmo de noite: o cliente acabou de escolher o horário e está esperando.
  perform public.nammux_notice_enqueue(
    r.organization_id, r.opportunity_id, r.contact_id, 'interview_slot_unavailable',
    'interview_request', r.id, null, r.requested_start_at, 'interview_rejected:' || r.request_key,
    now(), now() + interval '1 day', 'live');
end;
$$;
revoke all on function public.nammux_after_interview_rejection(uuid) from public, anon, authenticated;
grant execute on function public.nammux_after_interview_rejection(uuid) to service_role;

-- ============================================================
-- Worker: reivindicar, registrar resultado, recuperar
-- ============================================================
create or replace function public.nammux_claim_notices(_limit integer default 25)
returns setof public.nammux_notices
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  with due as (
    select n.id
      from public.nammux_notices n
     where n.status = 'scheduled'
       and n.send_at <= now()
       and (n.next_attempt_at is null or n.next_attempt_at <= now())
     order by n.send_at
     limit greatest(1, least(coalesce(_limit, 25), 100))
       for update skip locked
  )
  update public.nammux_notices n
     set status = 'sending', attempts = n.attempts + 1, locked_at = now(), updated_at = now()
    from due
   where n.id = due.id
  returning n.*;
end;
$$;
revoke all on function public.nammux_claim_notices(integer) from public, anon, authenticated;
grant execute on function public.nammux_claim_notices(integer) to service_role;

-- Resultado de uma tentativa. `_outcome`:
--   sent          entregue ao canal
--   retry         falha definida (o provedor recusou): nova tentativa com espera
--                 de 1, 5, 15 e 60 min; na 5ª falha, ou passado o prazo, encerra
--   skipped | cancelled | expired   não envia (com o motivo)
--   needs_review  resultado incerto: uma pessoa decide; nunca reenvia sozinho
-- Só altera aviso que está em `sending`: resultado atrasado de uma tentativa que
-- o recuperador já tratou é ignorado.
create or replace function public.nammux_notice_finish(
  _notice_id uuid,
  _outcome text,
  _reason text default null,
  _channel text default null,
  _message_id uuid default null
) returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  n public.nammux_notices;
  v_wait interval;
  v_status text;
begin
  select * into n from public.nammux_notices where id = _notice_id for update;
  if n.id is null or n.status <> 'sending' then
    return null;
  end if;

  if _outcome = 'sent' then
    update public.nammux_notices
       set status = 'sent', channel = _channel, message_id = _message_id, sent_at = now(),
           last_error = null, locked_at = null, updated_at = now()
     where id = _notice_id;
    return 'sent';
  end if;

  if _outcome = 'retry' then
    v_wait := case n.attempts when 1 then interval '1 minute' when 2 then interval '5 minutes'
                              when 3 then interval '15 minutes' else interval '60 minutes' end;
    v_status := case
      when n.attempts >= 5 then 'dead_letter'
      when n.expires_at is not null and now() + v_wait >= n.expires_at then 'expired'
      else 'scheduled' end;
    update public.nammux_notices
       set status = v_status,
           status_reason = case v_status when 'dead_letter' then 'attempts_exhausted' when 'expired' then 'expired_while_retrying' end,
           next_attempt_at = case when v_status = 'scheduled' then now() + v_wait end,
           last_error = left(coalesce(_reason, 'erro'), 300), channel = coalesce(_channel, channel),
           locked_at = null, updated_at = now()
     where id = _notice_id;
    return v_status;
  end if;

  if _outcome in ('skipped', 'cancelled', 'expired', 'needs_review') then
    update public.nammux_notices
       set status = _outcome, status_reason = left(coalesce(_reason, _outcome), 100),
           channel = coalesce(_channel, channel), locked_at = null, updated_at = now()
     where id = _notice_id;
    return _outcome;
  end if;

  raise exception 'NAMMUX_NOTICE_OUTCOME_INVALIDO' using errcode = '22023';
end;
$$;
revoke all on function public.nammux_notice_finish(uuid, text, text, text, uuid) from public, anon, authenticated;
grant execute on function public.nammux_notice_finish(uuid, text, text, text, uuid) to service_role;

-- Recuperador. Aviso preso em `sending` há mais de 5 min: o worker caiu no meio
-- do envio e não se sabe se a mensagem saiu. NÃO reenvia: vai para uma pessoa.
-- É o que impede aviso em dobro. Também encerra o que passou do prazo.
create or replace function public.nammux_notice_reap()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_stuck integer;
  v_expired integer;
begin
  update public.nammux_notices
     set status = 'needs_review', status_reason = 'unknown_outcome', locked_at = null, updated_at = now()
   where status = 'sending' and locked_at < now() - interval '5 minutes';
  get diagnostics v_stuck = row_count;

  update public.nammux_notices
     set status = 'expired', status_reason = 'expired_before_send', updated_at = now()
   where status in ('scheduled', 'pending_approval') and expires_at is not null and expires_at < now();
  get diagnostics v_expired = row_count;

  return jsonb_build_object('stuck', v_stuck, 'expired', v_expired);
end;
$$;
revoke all on function public.nammux_notice_reap() from public, anon, authenticated;
grant execute on function public.nammux_notice_reap() to service_role;

-- ============================================================
-- Aprovação por uma pessoa
-- ============================================================
-- Quem tem Atendimentos (ver e editar) na organização aprova ou recusa.
create or replace function public.nammux_can_manage_notices(_organization_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare p jsonb;
begin
  if _organization_id is null or public.current_user_id() is null then
    return false;
  end if;
  p := public.perms_v2_for_user(_organization_id, public.current_user_id());
  if p is null then
    return false;
  end if;
  return coalesce(p #>> '{dados,atendimentos,ver}', 'nenhum') <> 'nenhum'
     and coalesce(p #>> '{dados,atendimentos,editar}', 'nenhum') <> 'nenhum';
end;
$$;
revoke all on function public.nammux_can_manage_notices(uuid) from public, anon;
grant execute on function public.nammux_can_manage_notices(uuid) to authenticated, service_role;

-- Aprova (o aviso entra na fila para sair agora) ou recusa (não sai).
-- Vale para aviso aguardando aprovação e para aviso em revisão.
create or replace function public.nammux_notice_decide(
  _notice_id uuid,
  _approve boolean,
  _reason text default null
) returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  n public.nammux_notices;
begin
  select * into n from public.nammux_notices where id = _notice_id for update;
  if n.id is null then
    raise exception 'NAMMUX_NOTICE_NAO_ENCONTRADO' using errcode = 'P0002';
  end if;
  if not public.nammux_can_manage_notices(n.organization_id) then
    raise exception 'NAMMUX_NOTICE_SEM_PERMISSAO' using errcode = '42501';
  end if;
  if n.status not in ('pending_approval', 'needs_review', 'dead_letter') then
    raise exception 'NAMMUX_NOTICE_JA_DECIDIDO' using errcode = '22023';
  end if;

  -- Aviso que já saiu e ficou desmentido (pagamento estornado): não há o que
  -- reenviar. A pessoa só dá baixa na pendência (recusa).
  if _approve and n.status_reason = 'payment_reversed_after_sent' then
    raise exception 'NAMMUX_NOTICE_NAO_REENVIAVEL' using errcode = '22023';
  end if;

  if not _approve then
    update public.nammux_notices
       set status = 'rejected', rejected_reason = left(nullif(btrim(coalesce(_reason, '')), ''), 300),
           approved_by_user_id = public.current_user_id(), approved_at = now(), updated_at = now()
     where id = _notice_id;
    return 'rejected';
  end if;

  if n.expires_at is not null and n.expires_at < now() then
    update public.nammux_notices
       set status = 'expired', status_reason = 'expired_before_approval', updated_at = now()
     where id = _notice_id;
    return 'expired';
  end if;

  update public.nammux_notices
     set status = 'scheduled', send_at = now(), next_attempt_at = null, attempts = 0,
         status_reason = null, last_error = null,
         approved_by_user_id = public.current_user_id(), approved_at = now(), updated_at = now()
   where id = _notice_id;
  return 'scheduled';
end;
$$;
revoke all on function public.nammux_notice_decide(uuid, boolean, text) from public, anon;
grant execute on function public.nammux_notice_decide(uuid, boolean, text) to authenticated, service_role;
