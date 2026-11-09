-- Desfaz a distribuição do agente. Restaura os triggers de rodízio antes de remover as colunas.
create or replace function public.trg_contacts_round_robin()
returns trigger language plpgsql security definer set search_path to 'public' as $function$
DECLARE
  v_assigned uuid;
  v_scope text;
BEGIN
  IF NEW.owner_user_id IS NOT NULL THEN
    RETURN NEW;
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
  v_ctx text;
BEGIN
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
  SELECT round_robin_scope INTO v_scope FROM organizations WHERE id = NEW.organization_id;
  IF v_scope NOT IN ('threads_only', 'threads_and_contacts') THEN
    RETURN NEW;
  END IF;
  IF NEW.contact_id IS NOT NULL THEN
    SELECT owner_user_id INTO v_contact_owner FROM contacts WHERE id = NEW.contact_id;
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

drop function if exists public.rpc_agent_distribution_stats(uuid, integer);
drop function if exists public.fn_agent_release_thread(uuid, text, text);
drop function if exists public.fn_agent_claim_lead(uuid);
drop function if exists public.fn_agent_should_take(text, integer, bigint, integer);
alter table public.message_threads drop column if exists ai_agent_release_reason, drop column if exists ai_agent_released_at, drop column if exists ai_agent_id;
alter table public.contacts drop column if exists ai_agent_id;
alter table public.ai_agents drop constraint if exists ai_agents_distribution_value_check, drop constraint if exists ai_agents_distribution_mode_check;
alter table public.ai_agents drop column if exists handoff_ack_message, drop column if exists distribution_day_count, drop column if exists distribution_day, drop column if exists distribution_sequence, drop column if exists distribution_value, drop column if exists distribution_mode;
