-- Agente SDR como destino da distribuição de leads novos do WhatsApp.
-- Quem o agente pega fica sem dono até a passagem, e só então entra no rodízio.

alter table public.ai_agents
  add column if not exists distribution_mode text not null default 'all',
  add column if not exists distribution_value integer,
  add column if not exists distribution_sequence bigint not null default 0,
  add column if not exists distribution_day date,
  add column if not exists distribution_day_count integer not null default 0;

alter table public.ai_agents drop constraint if exists ai_agents_distribution_mode_check;
alter table public.ai_agents add constraint ai_agents_distribution_mode_check
  check (distribution_mode in ('all', 'every_n', 'percent', 'daily_quota'));
alter table public.ai_agents drop constraint if exists ai_agents_distribution_value_check;
alter table public.ai_agents add constraint ai_agents_distribution_value_check check (
  distribution_mode = 'all'
  or (distribution_mode = 'every_n' and distribution_value between 2 and 100)
  or (distribution_mode = 'percent' and distribution_value between 1 and 100)
  or (distribution_mode = 'daily_quota' and distribution_value between 1 and 10000)
);

alter table public.contacts
  add column if not exists ai_agent_id uuid references public.ai_agents(id) on delete set null;
alter table public.message_threads
  add column if not exists ai_agent_id uuid references public.ai_agents(id) on delete set null,
  add column if not exists ai_agent_released_at timestamptz,
  add column if not exists ai_agent_release_reason text;
create index if not exists idx_message_threads_ai_agent
  on public.message_threads (organization_id, ai_agent_id) where ai_agent_id is not null;

-- Sequência, não sorteio: com pouco volume, 25% é exatamente 1 a cada 4.
create or replace function public.fn_agent_should_take(_mode text, _value integer, _sequence bigint, _day_count integer)
returns boolean language sql immutable as $$
  select case _mode
    when 'all' then true
    when 'every_n' then _value >= 1 and (_sequence - 1) % _value = 0
    when 'percent' then _value >= 1 and floor(_sequence * _value / 100.0) > floor((_sequence - 1) * _value / 100.0)
    when 'daily_quota' then _value >= 1 and _day_count < _value
    else false
  end;
$$;

create or replace function public.fn_agent_claim_lead(_org uuid)
returns uuid language plpgsql security definer set search_path to 'public' as $$
declare
  a record;
  v_today date;
  v_count integer;
  v_seq bigint;
begin
  select id, distribution_mode, distribution_value, distribution_sequence, distribution_day, distribution_day_count, working_hours
    into a
  from ai_agents
  where organization_id = _org and agent_type = 'sdr' and is_enabled = true
  order by created_at desc
  limit 1
  for update;
  if a.id is null then return null; end if;

  v_today := (now() at time zone coalesce(a.working_hours->>'timezone', 'America/Sao_Paulo'))::date;
  v_count := case when a.distribution_day = v_today then a.distribution_day_count else 0 end;
  v_seq := a.distribution_sequence + 1;

  if fn_agent_should_take(a.distribution_mode, a.distribution_value, v_seq, v_count) then
    update ai_agents set distribution_sequence = v_seq, distribution_day = v_today, distribution_day_count = v_count + 1 where id = a.id;
    return a.id;
  end if;
  update ai_agents set distribution_sequence = v_seq, distribution_day = v_today, distribution_day_count = v_count where id = a.id;
  return null;
end;
$$;
revoke all on function public.fn_agent_claim_lead(uuid) from public, anon, authenticated;

create or replace function public.trg_contacts_round_robin()
returns trigger language plpgsql security definer set search_path to 'public' as $function$
DECLARE
  v_assigned uuid;
  v_scope text;
BEGIN
  IF NEW.owner_user_id IS NOT NULL THEN
    RETURN NEW;
  END IF;

  -- Lead novo do WhatsApp pode ir para o agente; falha aqui nunca impede criar o contato.
  IF NEW.source IN ('whatsapp', 'ctwa') THEN
    BEGIN
      NEW.ai_agent_id := fn_agent_claim_lead(NEW.organization_id);
    EXCEPTION WHEN others THEN
      NEW.ai_agent_id := NULL;
    END;
    IF NEW.ai_agent_id IS NOT NULL THEN
      RETURN NEW;
    END IF;
  END IF;

  SELECT round_robin_scope INTO v_scope
  FROM organizations
  WHERE id = NEW.organization_id;

  IF v_scope NOT IN ('contacts_only', 'threads_and_contacts') THEN
    RETURN NEW;
  END IF;

  v_assigned := assign_round_robin(NEW.organization_id);

  IF v_assigned IS NOT NULL THEN
    NEW.owner_user_id := v_assigned;
  END IF;

  RETURN NEW;
END;
$function$;

create or replace function public.trg_threads_round_robin()
returns trigger language plpgsql security definer set search_path to 'public' as $function$
DECLARE
  v_assigned uuid;
  v_scope text;
  v_contact_owner uuid;
  v_contact_agent uuid;
  v_ctx text;
BEGIN
  -- Rodízio do Atendimento: conversas de Atendimento nunca usam o rodízio comercial.
  BEGIN
    v_ctx := COALESCE(NEW.business_context, public.fn_thread_context_preview(NEW.primary_endpoint_id, NEW.created_at));
  EXCEPTION WHEN others THEN v_ctx := NEW.business_context;
  END;
  IF v_ctx = 'customer_service' THEN RETURN NEW; END IF;

  IF NEW.assigned_user_id IS NOT NULL THEN
    IF NEW.original_owner_user_id IS NULL THEN
      NEW.original_owner_user_id := NEW.assigned_user_id;
    END IF;
    RETURN NEW;
  END IF;

  -- Lead com o agente: a conversa fica com ele, sem vendedor, até a passagem.
  IF NEW.contact_id IS NOT NULL THEN
    SELECT owner_user_id, ai_agent_id INTO v_contact_owner, v_contact_agent FROM contacts WHERE id = NEW.contact_id;
    IF v_contact_owner IS NULL AND v_contact_agent IS NOT NULL AND NEW.channel = 'whatsapp' THEN
      NEW.ai_agent_id := v_contact_agent;
      RETURN NEW;
    END IF;
  END IF;

  SELECT round_robin_scope INTO v_scope FROM organizations WHERE id = NEW.organization_id;
  IF v_scope NOT IN ('threads_only', 'threads_and_contacts') THEN
    RETURN NEW;
  END IF;
  IF NEW.contact_id IS NOT NULL THEN
    IF v_contact_owner IS NOT NULL THEN
      NEW.assigned_user_id := v_contact_owner;
      NEW.original_owner_user_id := v_contact_owner;
      RETURN NEW;
    END IF;
  END IF;
  v_assigned := assign_round_robin(NEW.organization_id);
  IF v_assigned IS NOT NULL THEN
    NEW.assigned_user_id := v_assigned;
    NEW.original_owner_user_id := v_assigned;
  END IF;
  RETURN NEW;
END;
$function$;

-- Passagem para humano: o vendedor é escolhido aqui. Repetir não muda nada.
create or replace function public.fn_agent_release_thread(_thread uuid, _reason text, _summary text default null)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare
  t record;
  v_owner uuid;
  v_agent_name text;
begin
  select id, organization_id, contact_id, ai_agent_id, ai_agent_released_at, assigned_user_id
    into t from message_threads where id = _thread for update;
  if t.id is null or t.ai_agent_id is null then return jsonb_build_object('ok', false, 'error', 'not_agent_thread'); end if;
  if t.ai_agent_released_at is not null then return jsonb_build_object('ok', true, 'already', true); end if;

  v_owner := t.assigned_user_id;
  if v_owner is null and t.contact_id is not null then
    select owner_user_id into v_owner from contacts where id = t.contact_id;
  end if;
  if v_owner is null then v_owner := assign_round_robin(t.organization_id); end if;

  update message_threads set
    ai_agent_released_at = now(),
    ai_agent_release_reason = _reason,
    needs_human_attention = true,
    assigned_user_id = coalesce(assigned_user_id, v_owner),
    original_owner_user_id = coalesce(original_owner_user_id, v_owner),
    assigned_at = case when assigned_user_id is null and v_owner is not null then now() else assigned_at end,
    last_routing_decision = jsonb_build_object('action', 'agent_handoff', 'reason', _reason, 'decided_at', now())
  where id = _thread;

  if v_owner is not null and t.contact_id is not null then
    update contacts set owner_user_id = v_owner where id = t.contact_id and owner_user_id is null;
  end if;

  select name into v_agent_name from ai_agents where id = t.ai_agent_id;
  insert into messages (organization_id, thread_id, content, direction, is_internal_note, sender_type, sender_agent_id, sender_name, sent_at)
  values (
    t.organization_id, _thread,
    coalesce(nullif(btrim(_summary), ''), 'Passado para humano. Motivo: ' || _reason),
    'internal', true, 'system', t.ai_agent_id, v_agent_name, now()
  );

  if v_owner is not null then
    insert into notifications (user_id, organization_id, type, title, body, entity_type, entity_id)
    values (v_owner, t.organization_id, 'whatsapp_message', 'Lead passado pelo agente',
            left(coalesce(nullif(btrim(_summary), ''), _reason), 200), 'message', _thread);
  end if;
  return jsonb_build_object('ok', true, 'assigned_user_id', v_owner);
end;
$$;
revoke all on function public.fn_agent_release_thread(uuid, text, text) from public, anon, authenticated;
grant execute on function public.fn_agent_release_thread(uuid, text, text) to service_role;

-- Comparação simples do período: leads com o agente x leads sem ele.
create or replace function public.rpc_agent_distribution_stats(_org uuid, _days integer default 30)
returns jsonb language plpgsql stable security definer set search_path to 'public' as $$
declare r jsonb;
begin
  if not public.can_manage_integrations_in_org(_org) then raise exception 'forbidden'; end if;
  with leads as (
    select t.id, t.contact_id, t.ai_agent_id is not null as com_agente, t.ai_agent_released_at is not null as passou
    from message_threads t
    join contacts c on c.id = t.contact_id
    where t.organization_id = _org and t.channel = 'whatsapp'
      and t.created_at > now() - make_interval(days => greatest(_days, 1))
      and c.source in ('whatsapp', 'ctwa')
      and coalesce(t.business_context, 'sales') <> 'customer_service'
  ), res as (
    select l.*, exists (
      select 1 from opportunities o where o.contact_id = l.contact_id and o.status = 'won' and o.deleted_at is null
    ) as ganhou from leads l
  )
  select jsonb_build_object(
    'agent_leads', count(*) filter (where com_agente),
    'agent_handed_off', count(*) filter (where com_agente and passou),
    'agent_won', count(*) filter (where com_agente and ganhou),
    'human_leads', count(*) filter (where not com_agente),
    'human_won', count(*) filter (where not com_agente and ganhou)
  ) into r from res;
  return r;
end;
$$;
revoke all on function public.rpc_agent_distribution_stats(uuid, integer) from public, anon;
grant execute on function public.rpc_agent_distribution_stats(uuid, integer) to authenticated;
