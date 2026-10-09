-- Rollback item 3 (Rodízio do Atendimento — regras). Restaura as definições
-- capturadas em 2026-10-09 ~18:10 UTC, antes da migração.
DROP TRIGGER IF EXISTS trg_zy_cs_assignment ON public.message_threads;
DROP TRIGGER IF EXISTS trg_cs_assignment_log ON public.message_threads;
DROP FUNCTION IF EXISTS public.fn_cs_thread_assignment();
DROP FUNCTION IF EXISTS public.fn_cs_thread_assignment_log();
DROP FUNCTION IF EXISTS public.fn_cs_reopen_target(uuid, uuid, uuid, uuid);
DROP FUNCTION IF EXISTS public.fn_thread_context_preview(uuid, uuid, timestamptz);

CREATE OR REPLACE FUNCTION public.trg_threads_round_robin()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_assigned uuid;
  v_scope text;
  v_contact_owner uuid;
BEGIN
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

CREATE OR REPLACE FUNCTION public.trg_messages_smart_reopen()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_thread record;
  v_owner_active boolean;
  v_new_owner uuid;
BEGIN
  IF NEW.direction <> 'inbound' THEN RETURN NEW; END IF;
  SELECT id, organization_id, status, assigned_user_id, original_owner_user_id
  INTO v_thread FROM message_threads WHERE id = NEW.thread_id;
  IF v_thread.id IS NULL THEN RETURN NEW; END IF;
  IF v_thread.status NOT IN ('closed', 'resolved') THEN RETURN NEW; END IF;
  v_owner_active := false;
  IF v_thread.original_owner_user_id IS NOT NULL THEN
    SELECT EXISTS (SELECT 1 FROM user_organizations
      WHERE user_id = v_thread.original_owner_user_id
        AND organization_id = v_thread.organization_id AND is_active = true) INTO v_owner_active;
  END IF;
  IF v_owner_active THEN
    v_new_owner := v_thread.original_owner_user_id;
  ELSE
    v_new_owner := assign_round_robin(v_thread.organization_id);
    IF v_new_owner IS NULL THEN v_new_owner := v_thread.assigned_user_id; END IF;
  END IF;
  UPDATE message_threads
  SET status = 'open', assigned_user_id = v_new_owner, resolved_at = NULL,
      last_routing_decision = CASE
        WHEN v_new_owner IS DISTINCT FROM v_thread.assigned_user_id
          THEN jsonb_build_object('action','reopen','reason','inbound_message_reopen',
                 'at', to_char(now(), 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'), 'message_id', NEW.id)
        ELSE last_routing_decision END
  WHERE id = v_thread.id;
  RETURN NEW;
END;
$function$;
