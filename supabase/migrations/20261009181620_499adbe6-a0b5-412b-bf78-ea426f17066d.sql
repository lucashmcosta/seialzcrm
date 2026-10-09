CREATE OR REPLACE FUNCTION public.fn_thread_context_preview(_endpoint uuid, _created timestamptz)
RETURNS text LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_purpose text;
BEGIN
  IF _endpoint IS NULL THEN RETURN NULL; END IF;
  IF _endpoint = 'c09bd713-0225-4533-afe8-20ac07bd3a7c'::uuid THEN
    RETURN CASE WHEN coalesce(_created, now()) < '2026-06-16 22:29:40+00'::timestamptz THEN 'sales' ELSE 'customer_service' END;
  END IF;
  SELECT purpose INTO v_purpose FROM communication_endpoints WHERE id = _endpoint;
  IF lower(coalesce(v_purpose,'')) IN ('sales','commercial','vendor_personal') THEN RETURN 'sales';
  ELSIF lower(coalesce(v_purpose,'')) IN ('customer_service','support') THEN RETURN 'customer_service';
  ELSIF v_purpose IS NOT NULL THEN RETURN 'other'; END IF;
  RETURN NULL;
END $$;
REVOKE EXECUTE ON FUNCTION public.fn_thread_context_preview(uuid, timestamptz) FROM PUBLIC, anon, authenticated;

-- Comercial: corpo idêntico; só sai cedo quando a conversa é de Atendimento.
CREATE OR REPLACE FUNCTION public.trg_threads_round_robin()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_assigned uuid;
  v_scope text;
  v_contact_owner uuid;
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

-- Atendimento: conversa nova (roda depois do preenchimento do business_context).
CREATE OR REPLACE FUNCTION public.fn_cs_thread_assignment()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_me uuid; v_on boolean; v_cand uuid; v_owner uuid; v_reason text; v_action text;
BEGIN
  IF NEW.business_context IS DISTINCT FROM 'customer_service' THEN RETURN NEW; END IF;
  BEGIN
    v_me := public.current_user_id();
    IF v_me IS NOT NULL AND EXISTS (SELECT 1 FROM user_organizations
         WHERE user_id = v_me AND organization_id = NEW.organization_id AND is_active) THEN
      v_cand := v_me; v_action := 'initial_assignment'; v_reason := 'Iniciada pelo atendente';
    ELSE
      SELECT cs_round_robin_enabled INTO v_on FROM organizations WHERE id = NEW.organization_id;
      IF COALESCE(v_on,false) THEN
        v_cand := public.assign_cs_round_robin(NEW.organization_id);
        v_action := 'round_robin';
        v_reason := CASE WHEN v_cand IS NULL THEN 'Sem responsável: ninguém disponível' ELSE 'Rodízio do Atendimento' END;
      ELSE
        IF NEW.contact_id IS NOT NULL THEN
          SELECT owner_user_id INTO v_owner FROM contacts WHERE id = NEW.contact_id;
        END IF;
        v_cand := COALESCE(NEW.assigned_user_id, v_owner);
        v_action := 'initial_assignment';
        IF v_cand IS NOT NULL AND public.can_receive_cs(NEW.organization_id, v_cand) THEN
          v_reason := 'Dono do contato';
        ELSE
          v_cand := NULL; v_reason := 'Sem responsável: ninguém disponível';
        END IF;
      END IF;
    END IF;
    NEW.assigned_user_id := v_cand;
    NEW.original_owner_user_id := v_cand;
    NEW.last_routing_decision := jsonb_build_object('action', v_action, 'reason', v_reason,
      'source', 'cs_round_robin', 'at', to_char(now(), 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'));
  EXCEPTION WHEN others THEN
    NEW.assigned_user_id := NULL;
    NEW.original_owner_user_id := NULL;
    BEGIN
      INSERT INTO cs_routing_errors(organization_id, thread_id, stage, error)
      VALUES (NEW.organization_id, NEW.id, 'thread_insert', SQLERRM);
    EXCEPTION WHEN others THEN NULL; END;
  END;
  RETURN NEW;
END $$;
REVOKE EXECUTE ON FUNCTION public.fn_cs_thread_assignment() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER trg_zy_cs_assignment BEFORE INSERT ON public.message_threads
  FOR EACH ROW EXECUTE FUNCTION public.fn_cs_thread_assignment();

-- Histórico da atribuição inicial do Atendimento (o log padrão só vê UPDATE).
CREATE OR REPLACE FUNCTION public.fn_cs_thread_assignment_log()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.last_routing_decision->>'source' = 'cs_round_robin' THEN
    BEGIN
      INSERT INTO thread_assignment_history(organization_id, thread_id, action_type, from_user_id,
        to_user_id, performed_by_user_id, reason, metadata)
      VALUES (NEW.organization_id, NEW.id, NEW.last_routing_decision->>'action', NULL,
        NEW.assigned_user_id, NEW.assigned_user_id, NEW.last_routing_decision->>'reason', NEW.last_routing_decision);
    EXCEPTION WHEN others THEN
      BEGIN
        INSERT INTO cs_routing_errors(organization_id, thread_id, stage, error)
        VALUES (NEW.organization_id, NEW.id, 'thread_insert_log', SQLERRM);
      EXCEPTION WHEN others THEN NULL; END;
    END;
  END IF;
  RETURN NEW;
END $$;
REVOKE EXECUTE ON FUNCTION public.fn_cs_thread_assignment_log() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER trg_cs_assignment_log AFTER INSERT ON public.message_threads
  FOR EACH ROW EXECUTE FUNCTION public.fn_cs_thread_assignment_log();

-- Reabertura: ramo comercial idêntico; ramo de Atendimento novo e à prova de erro.
CREATE OR REPLACE FUNCTION public.trg_messages_smart_reopen()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_thread record;
  v_owner_active boolean;
  v_new_owner uuid;
  v_cand uuid;
  v_reason text;
BEGIN
  IF NEW.direction <> 'inbound' THEN RETURN NEW; END IF;
  SELECT id, organization_id, status, assigned_user_id, original_owner_user_id, business_context, resolved_at
  INTO v_thread FROM message_threads WHERE id = NEW.thread_id;
  IF v_thread.id IS NULL THEN RETURN NEW; END IF;
  IF v_thread.status NOT IN ('closed', 'resolved') THEN RETURN NEW; END IF;

  IF v_thread.business_context = 'customer_service' THEN
    BEGIN
      SELECT h.to_user_id INTO v_cand FROM thread_assignment_history h
       WHERE h.thread_id = v_thread.id AND h.created_at <= COALESCE(v_thread.resolved_at, now())
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