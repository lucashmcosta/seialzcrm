CREATE OR REPLACE FUNCTION public.fn_log_thread_assignment_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_decision jsonb;
  v_raw      text;
  v_action   text;
  v_reason   text;
  v_by       uuid;
BEGIN
  IF NEW.assigned_user_id IS NOT DISTINCT FROM OLD.assigned_user_id THEN
    RETURN NEW;
  END IF;

  IF NEW.last_routing_decision IS NULL THEN
    RETURN NEW;
  END IF;

  v_decision := NEW.last_routing_decision;
  v_raw      := COALESCE(v_decision->>'action', 'manual_assignment');
  v_reason   := v_decision->>'reason';
  v_by       := NULLIF(v_decision->>'by_user_id','')::uuid;

  -- Coerção defensiva: marcadores de UI (ex.: inbox_manual_start) não pertencem
  -- ao contrato de action_type e NUNCA devem derrubar o INSERT do inbound.
  IF v_raw = ANY (ARRAY['initial_assignment','manual_assignment','round_robin',
                        'rule_match','take_over','escalation','reopen','auto_reassign']) THEN
    v_action := v_raw;
  ELSE
    v_action := 'auto_reassign';
    v_decision := v_decision || jsonb_build_object('original_action', v_raw);
    v_reason := COALESCE(v_reason, 'coerced_from:' || v_raw);
  END IF;

  INSERT INTO public.thread_assignment_history
    (organization_id, thread_id, action_type,
     from_user_id, to_user_id, performed_by_user_id,
     reason, metadata)
  VALUES
    (NEW.organization_id, NEW.id, v_action,
     OLD.assigned_user_id, NEW.assigned_user_id,
     COALESCE(v_by, NEW.assigned_user_id),
     v_reason, v_decision);

  RETURN NEW;
END;
$fn$;

CREATE OR REPLACE FUNCTION public.trg_messages_smart_reopen()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_thread record;
  v_owner_active boolean;
  v_new_owner uuid;
BEGIN
  IF NEW.direction <> 'inbound' THEN
    RETURN NEW;
  END IF;

  SELECT id, organization_id, status, assigned_user_id, original_owner_user_id
  INTO v_thread
  FROM message_threads
  WHERE id = NEW.thread_id;

  IF v_thread.id IS NULL THEN
    RETURN NEW;
  END IF;

  IF v_thread.status NOT IN ('closed', 'resolved') THEN
    RETURN NEW;
  END IF;

  v_owner_active := false;
  IF v_thread.original_owner_user_id IS NOT NULL THEN
    SELECT EXISTS (
      SELECT 1 FROM user_organizations
      WHERE user_id = v_thread.original_owner_user_id
        AND organization_id = v_thread.organization_id
        AND is_active = true
    ) INTO v_owner_active;
  END IF;

  IF v_owner_active THEN
    v_new_owner := v_thread.original_owner_user_id;
  ELSE
    v_new_owner := assign_round_robin(v_thread.organization_id);
    IF v_new_owner IS NULL THEN
      v_new_owner := v_thread.assigned_user_id;
    END IF;
  END IF;

  UPDATE message_threads
  SET status = 'open',
      assigned_user_id = v_new_owner,
      resolved_at = NULL,
      -- Semântica correta do evento: reabertura por mensagem recebida.
      last_routing_decision = CASE
        WHEN v_new_owner IS DISTINCT FROM v_thread.assigned_user_id
          THEN jsonb_build_object(
                 'action', 'reopen',
                 'reason', 'inbound_message_reopen',
                 'at', to_char(now(), 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
                 'message_id', NEW.id
               )
        ELSE last_routing_decision
      END
  WHERE id = v_thread.id;

  RETURN NEW;
END;
$fn$;