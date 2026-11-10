-- Conversa encerrada pelo agente de IA reabre com o agente, sem passar para um vendedor.
CREATE OR REPLACE FUNCTION public.trg_messages_smart_reopen()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_thread record;
  v_owner_active boolean;
  v_new_owner uuid;
  v_cand uuid;
  v_reason text;
BEGIN
  IF NEW.direction <> 'inbound' THEN RETURN NEW; END IF;
  SELECT id, organization_id, status, assigned_user_id, original_owner_user_id, business_context, resolved_at, ai_agent_id, ai_agent_released_at
  INTO v_thread FROM message_threads WHERE id = NEW.thread_id;
  IF v_thread.id IS NULL THEN RETURN NEW; END IF;
  IF v_thread.status NOT IN ('closed', 'resolved') THEN RETURN NEW; END IF;

  -- Conversa que o agente de IA encerrou: reabre com o próprio agente, sem dono.
  IF v_thread.ai_agent_id IS NOT NULL AND v_thread.ai_agent_released_at IS NULL AND v_thread.assigned_user_id IS NULL THEN
    UPDATE message_threads SET status = 'open', resolved_at = NULL WHERE id = v_thread.id;
    RETURN NEW;
  END IF;

  IF v_thread.business_context = 'customer_service' THEN
    BEGIN
      -- Última PESSOA que atendia: ignora entradas "sem responsável".
      SELECT h.to_user_id INTO v_cand FROM thread_assignment_history h
       WHERE h.thread_id = v_thread.id AND h.to_user_id IS NOT NULL
         AND h.created_at <= COALESCE(v_thread.resolved_at, now())
       ORDER BY h.created_at DESC LIMIT 1;
      v_cand := COALESCE(v_cand, v_thread.assigned_user_id);
      IF v_cand IS NOT NULL AND public.can_receive_cs(v_thread.organization_id, v_cand) THEN
        v_new_owner := v_cand; v_reason := 'Voltou para quem atendia';
      ELSE
        v_new_owner := public.assign_cs_round_robin(v_thread.organization_id);
        v_reason := CASE WHEN v_new_owner IS NULL THEN 'Sem responsável: ninguém disponível' ELSE 'Rodízio do Atendimento' END;
      END IF;
      UPDATE message_threads
         SET status = 'open', assigned_user_id = v_new_owner, resolved_at = NULL,
             last_routing_decision = jsonb_build_object('action','reopen','reason', v_reason,
               'source','cs_round_robin','at', to_char(now(), 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'), 'message_id', NEW.id)
       WHERE id = v_thread.id;
    EXCEPTION WHEN others THEN
      BEGIN
        INSERT INTO cs_routing_errors(organization_id, thread_id, stage, error)
        VALUES (v_thread.organization_id, v_thread.id, 'reopen', SQLERRM);
      EXCEPTION WHEN others THEN NULL; END;
      BEGIN
        UPDATE message_threads SET status = 'open', assigned_user_id = NULL, resolved_at = NULL,
               last_routing_decision = jsonb_build_object('action','reopen','reason','Sem responsável: erro na distribuição','source','cs_round_robin','message_id', NEW.id)
         WHERE id = v_thread.id;
      EXCEPTION WHEN others THEN NULL; END;
    END;
    RETURN NEW;
  END IF;

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
