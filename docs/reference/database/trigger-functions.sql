-- Seialz DB (qvmtzfvkhkhkhdpclzua) — Corpos das 48 trigger functions
-- GERADO do banco vivo em 2026-07-04. Não editar à mão.

CREATE OR REPLACE FUNCTION public.audit_log_trigger()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id UUID;
  v_org_id UUID;
BEGIN
  SELECT id INTO v_user_id FROM users WHERE auth_user_id = auth.uid();
  v_org_id := COALESCE(NEW.organization_id, OLD.organization_id);
  IF TG_OP = 'DELETE' THEN
    INSERT INTO audit_logs (organization_id, entity_type, entity_id, action, old_data, changed_by_user_id)
    VALUES (v_org_id, TG_TABLE_NAME, OLD.id, 'DELETE', to_jsonb(OLD), v_user_id);
    RETURN OLD;
  ELSIF TG_OP = 'UPDATE' THEN
    INSERT INTO audit_logs (organization_id, entity_type, entity_id, action, old_data, new_data, changed_by_user_id)
    VALUES (v_org_id, TG_TABLE_NAME, NEW.id, 'UPDATE', to_jsonb(OLD), to_jsonb(NEW), v_user_id);
    RETURN NEW;
  ELSIF TG_OP = 'INSERT' THEN
    INSERT INTO audit_logs (organization_id, entity_type, entity_id, action, new_data, changed_by_user_id)
    VALUES (v_org_id, TG_TABLE_NAME, NEW.id, 'INSERT', to_jsonb(NEW), v_user_id);
    RETURN NEW;
  END IF;
END;
$function$;

CREATE OR REPLACE FUNCTION public.contacts_set_phone_normalized()
 RETURNS trigger LANGUAGE plpgsql
AS $function$
BEGIN
  NEW.phone_normalized := normalize_phone_br(NEW.phone);
  RETURN NEW;
END;
$function$;

-- ============ HOT PATH: MESSAGES ============

CREATE OR REPLACE FUNCTION public.fn_update_thread_last_message()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_thread_id uuid;
  v_rec RECORD;
BEGIN
  IF TG_OP = 'DELETE' THEN v_thread_id := OLD.thread_id; ELSE v_thread_id := NEW.thread_id; END IF;
  -- FAST PATH: INSERT only
  IF TG_OP = 'INSERT' AND NEW.deleted_at IS NULL THEN
    IF COALESCE(NEW.is_internal_note, false) THEN RETURN NEW; END IF;
    UPDATE message_threads
    SET last_message_id = NEW.id, last_message_at = NEW.sent_at,
        last_message_content = LEFT(NEW.content, 200),
        last_message_direction = NEW.direction, updated_at = now()
    WHERE id = v_thread_id AND (last_message_at IS NULL OR NEW.sent_at >= last_message_at);
    RETURN NEW;
  END IF;
  -- SLOW PATH: UPDATE/DELETE — recalcula ignorando notas internas
  SELECT m.id, m.sent_at, m.content, m.direction INTO v_rec
  FROM messages m
  WHERE m.thread_id = v_thread_id AND m.deleted_at IS NULL
    AND COALESCE(m.is_internal_note, false) = false
  ORDER BY m.sent_at DESC LIMIT 1;
  IF v_rec.id IS NOT NULL THEN
    UPDATE message_threads SET last_message_id = v_rec.id, last_message_at = v_rec.sent_at,
      last_message_content = LEFT(v_rec.content, 200), last_message_direction = v_rec.direction, updated_at = now()
    WHERE id = v_thread_id;
  ELSE
    UPDATE message_threads SET last_message_id = NULL, last_message_at = NULL,
      last_message_content = NULL, last_message_direction = NULL, updated_at = now()
    WHERE id = v_thread_id;
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.fn_messages_intelligence_enqueue()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_prev_at timestamptz; v_is_audio boolean; v_has_text boolean;
BEGIN
  IF COALESCE(NEW.is_internal_note, false) THEN RETURN NEW; END IF;
  IF NEW.thread_id IS NOT NULL THEN
    SELECT MAX(created_at) INTO v_prev_at FROM public.messages
    WHERE thread_id = NEW.thread_id AND direction <> NEW.direction AND created_at < NEW.created_at;
    IF v_prev_at IS NOT NULL THEN
      NEW.response_time_seconds := GREATEST(0, EXTRACT(EPOCH FROM (NEW.created_at - v_prev_at))::int);
    END IF;
  END IF;
  v_is_audio := COALESCE(NEW.media_type, '') ILIKE 'audio%';
  v_has_text := NEW.content IS NOT NULL AND length(btrim(NEW.content)) >= 2;
  IF v_is_audio THEN
    INSERT INTO public.intelligence_jobs (organization_id, target_action, payload, idempotency_key)
    VALUES (NEW.organization_id, 'intelligence.transcribe_audio', jsonb_build_object('message_id', NEW.id), 'transcribe:' || NEW.id::text)
    ON CONFLICT (organization_id, idempotency_key) DO NOTHING;
  ELSIF v_has_text THEN
    INSERT INTO public.intelligence_jobs (organization_id, target_action, payload, idempotency_key)
    VALUES (NEW.organization_id, 'intelligence.analyze_message', jsonb_build_object('message_id', NEW.id), 'analyze:' || NEW.id::text)
    ON CONFLICT (organization_id, idempotency_key) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.trg_messages_smart_reopen()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_thread record; v_owner_active boolean; v_new_owner uuid;
BEGIN
  IF NEW.direction <> 'inbound' THEN RETURN NEW; END IF;
  SELECT id, organization_id, status, assigned_user_id, original_owner_user_id INTO v_thread
  FROM message_threads WHERE id = NEW.thread_id;
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
    -- TODO(next-sprint): trocar por "caixa não atribuída" + task pro gestor
    v_new_owner := assign_round_robin(v_thread.organization_id);
    IF v_new_owner IS NULL THEN v_new_owner := v_thread.assigned_user_id; END IF;
  END IF;
  UPDATE message_threads SET status = 'open', assigned_user_id = v_new_owner, resolved_at = NULL
  WHERE id = v_thread.id;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.handle_inbound_message_status()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.direction = 'inbound' THEN
    UPDATE message_threads SET status = 'open', updated_at = now()
    WHERE id = NEW.thread_id AND status IN ('awaiting_client', 'resolved');
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.parse_lead_source_marker_from_message()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_src text; v_gclid text; v_contact_id uuid;
BEGIN
  IF NEW.direction IS DISTINCT FROM 'inbound' THEN RETURN NEW; END IF;
  IF NEW.content IS NULL OR NEW.content !~ '\[src:[^\]]+\]' THEN RETURN NEW; END IF;
  -- Escopo v1: apenas Central Trabalhista (org hardcoded)
  IF NEW.organization_id <> '40ae935c-a7f7-4ad7-8ea4-91be6404a95f'::uuid THEN RETURN NEW; END IF;
  BEGIN
    v_src := lower(substring(NEW.content from '\[src:([^|\]]+)'));
    v_gclid := substring(NEW.content from '\|g:([^\]]+)\]');
    SELECT contact_id INTO v_contact_id FROM public.message_threads WHERE id = NEW.thread_id;
    IF v_contact_id IS NULL OR v_src IS NULL THEN RETURN NEW; END IF;
    IF v_src = 'gads' THEN
      UPDATE public.contacts SET utm_source = COALESCE(utm_source, 'google'),
        utm_medium = COALESCE(utm_medium, 'cpc'), source = COALESCE(source, 'google_ads'),
        gclid = COALESCE(gclid, v_gclid)
      WHERE id = v_contact_id AND (utm_source IS NULL OR gclid IS NULL);
    ELSIF v_src = 'direct' THEN
      UPDATE public.contacts SET utm_source = COALESCE(utm_source, 'direct'), utm_medium = COALESCE(utm_medium, 'none')
      WHERE id = v_contact_id AND utm_source IS NULL;
    ELSE
      UPDATE public.contacts SET utm_source = COALESCE(utm_source, v_src)
      WHERE id = v_contact_id AND utm_source IS NULL;
    END IF;
  EXCEPTION WHEN OTHERS THEN RETURN NEW;
  END;
  RETURN NEW;
END;
$function$;

-- ============ HOT PATH: OPPORTUNITIES / EVENTOS / CAPI / ROUND-ROBIN ============

CREATE OR REPLACE FUNCTION public.sync_opportunity_status_from_stage()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  stage_type_text text; new_status text;
BEGIN
  IF NEW.pipeline_stage_id IS NULL THEN RETURN NEW; END IF;
  IF TG_OP = 'INSERT' OR NEW.pipeline_stage_id IS DISTINCT FROM OLD.pipeline_stage_id THEN
    SELECT ps.type::text INTO stage_type_text FROM public.pipeline_stages ps WHERE ps.id = NEW.pipeline_stage_id;
    new_status := CASE stage_type_text WHEN 'won' THEN 'won' WHEN 'lost' THEN 'lost' ELSE 'open' END;
    NEW.status := new_status::opportunity_status;
    IF new_status IN ('won','lost') AND NEW.close_date IS NULL THEN NEW.close_date := now(); END IF;
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.fn_emit_opportunity_won_event()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_new_is_won boolean; v_old_is_won boolean := false; v_payload jsonb; v_idem text;
BEGIN
  IF NEW.deleted_at IS NOT NULL OR NEW.organization_id IS NULL OR NEW.contact_id IS NULL THEN RETURN NEW; END IF;
  SELECT (ps.type = 'won') INTO v_new_is_won FROM public.pipeline_stages ps WHERE ps.id = NEW.pipeline_stage_id;
  IF v_new_is_won IS NOT TRUE THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND OLD.pipeline_stage_id IS NOT NULL THEN
    SELECT (ps.type = 'won') INTO v_old_is_won FROM public.pipeline_stages ps WHERE ps.id = OLD.pipeline_stage_id;
  END IF;
  IF COALESCE(v_old_is_won, false) THEN RETURN NEW; END IF;  -- só na TRANSIÇÃO para won
  v_idem := 'seialz:opportunity.won:' || NEW.organization_id::text || ':' || NEW.id::text;
  v_payload := public.fn_build_opportunity_won_payload(NEW.id);
  INSERT INTO public.integration_events (organization_id, aggregate_type, aggregate_id, event_type, payload, idempotency_key, occurred_at, status)
  VALUES (NEW.organization_id, 'opportunity', NEW.id, 'opportunity.won', v_payload, v_idem, now(), 'pending')
  ON CONFLICT (idempotency_key) DO NOTHING;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.fn_publish_integration_event()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_aggregate_type text := TG_ARGV[0];
  v_org_id uuid; v_event_type text; v_ts_epoch bigint; v_payload jsonb; v_idem text;
  v_stage_changed boolean := false; v_skip text;
BEGIN
  BEGIN
    -- Loop guard: callers podem SET LOCAL app.skip_event_emit = 'true' para suprimir
    BEGIN v_skip := current_setting('app.skip_event_emit', true);
    EXCEPTION WHEN OTHERS THEN v_skip := NULL; END;
    IF v_skip = 'true' THEN RETURN NEW; END IF;
    -- Filtro: messages só outbound
    IF v_aggregate_type = 'message' THEN
      IF NEW.direction IS DISTINCT FROM 'outbound' THEN RETURN NEW; END IF;
    END IF;
    v_org_id := NEW.organization_id;
    IF v_aggregate_type = 'message' THEN
      v_ts_epoch := EXTRACT(EPOCH FROM COALESCE(NEW.created_at, now()))::bigint;
    ELSE
      v_ts_epoch := EXTRACT(EPOCH FROM COALESCE(NEW.updated_at, now()))::bigint;
    END IF;
    IF TG_OP = 'INSERT' THEN
      IF v_aggregate_type = 'message' THEN v_event_type := 'message.outbound_sent';
      ELSE v_event_type := v_aggregate_type || '.created'; END IF;
    ELSE
      v_event_type := v_aggregate_type || '.updated';
      IF v_aggregate_type = 'opportunity'
         AND COALESCE(OLD.pipeline_stage_id::text, '') IS DISTINCT FROM COALESCE(NEW.pipeline_stage_id::text, '') THEN
        v_stage_changed := true;
      END IF;
    END IF;
    v_payload := to_jsonb(NEW);
    v_idem := v_aggregate_type || ':' || NEW.id::text || ':' || v_event_type || ':' || v_ts_epoch::text;
    INSERT INTO public.integration_events (organization_id, aggregate_type, aggregate_id, event_type, payload, idempotency_key)
    VALUES (v_org_id, v_aggregate_type, NEW.id, v_event_type, v_payload, v_idem)
    ON CONFLICT (idempotency_key) DO NOTHING;
    IF v_stage_changed THEN
      v_event_type := 'opportunity.stage_changed';
      v_idem := v_aggregate_type || ':' || NEW.id::text || ':' || v_event_type || ':' || v_ts_epoch::text;
      INSERT INTO public.integration_events (organization_id, aggregate_type, aggregate_id, event_type, payload, idempotency_key)
      VALUES (v_org_id, v_aggregate_type, NEW.id, v_event_type,
        v_payload || jsonb_build_object('previous_stage_id', OLD.pipeline_stage_id), v_idem)
      ON CONFLICT (idempotency_key) DO NOTHING;
    END IF;
    RETURN NEW;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'fn_publish_integration_event failed: %', SQLERRM;
    RETURN NEW;
  END;
END;
$function$;

CREATE OR REPLACE FUNCTION public.fn_fanout_event()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  BEGIN
    INSERT INTO public.integration_jobs
      (organization_id, event_id, subscription_id, integration_slug, target_action, payload, idempotency_key)
    SELECT NEW.organization_id, NEW.id, s.id, s.integration_slug, s.target_action, NEW.payload,
           NEW.idempotency_key || ':' || s.id::text
    FROM public.integration_subscriptions s
    WHERE s.organization_id = NEW.organization_id
      AND s.event_type = NEW.event_type AND s.is_active = true
    ON CONFLICT (idempotency_key) DO NOTHING;
    UPDATE public.integration_events SET status = 'published', published_at = now() WHERE id = NEW.id;
    RETURN NEW;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'fn_fanout_event failed: %', SQLERRM;
    RETURN NEW;
  END;
END;
$function$;

CREATE OR REPLACE FUNCTION public.fn_capi_trigger_lead_on_contact()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'extensions'
AS $function$
BEGIN
  PERFORM public.fn_capi_dispatch_event(NEW.organization_id, 'Lead', NEW.id, NULL);
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.fn_capi_trigger_purchase_on_opp()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'extensions'
AS $function$
BEGIN
  PERFORM public.fn_capi_dispatch_event(NEW.organization_id, 'Purchase', NEW.contact_id, NEW.id);
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.fn_opportunity_won_promote_contact()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  -- Promove contato a 'customer' quando opportunity vira won. Nunca rebaixa.
  IF NEW.status = 'won' AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'won')
     AND NEW.contact_id IS NOT NULL AND NEW.deleted_at IS NULL THEN
    UPDATE public.contacts c SET lifecycle_stage = 'customer', updated_at = now()
    WHERE c.id = NEW.contact_id AND c.organization_id = NEW.organization_id
      AND c.deleted_at IS NULL AND c.lifecycle_stage IS DISTINCT FROM 'customer';
  END IF;
  RETURN NEW;
END;
$function$;

-- ============ ROUND-ROBIN (3 frentes) ============

CREATE OR REPLACE FUNCTION public.trg_contacts_round_robin()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_assigned uuid; v_scope text;
BEGIN
  IF NEW.owner_user_id IS NOT NULL THEN RETURN NEW; END IF;
  SELECT round_robin_scope INTO v_scope FROM organizations WHERE id = NEW.organization_id;
  IF v_scope NOT IN ('contacts_only', 'threads_and_contacts') THEN RETURN NEW; END IF;
  v_assigned := assign_round_robin(NEW.organization_id);
  IF v_assigned IS NOT NULL THEN NEW.owner_user_id := v_assigned; END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.trg_opportunities_round_robin()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_assigned uuid; v_contact_owner uuid;
BEGIN
  IF NEW.owner_user_id IS NOT NULL THEN RETURN NEW; END IF;
  IF NEW.contact_id IS NOT NULL THEN
    SELECT owner_user_id INTO v_contact_owner FROM contacts WHERE id = NEW.contact_id;
    IF v_contact_owner IS NOT NULL THEN
      NEW.owner_user_id := v_contact_owner;  -- herda do contato antes de sortear
      RETURN NEW;
    END IF;
  END IF;
  v_assigned := assign_round_robin(NEW.organization_id);
  IF v_assigned IS NOT NULL THEN NEW.owner_user_id := v_assigned; END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.trg_threads_round_robin()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_assigned uuid; v_scope text; v_contact_owner uuid;
BEGIN
  IF NEW.assigned_user_id IS NOT NULL THEN
    IF NEW.original_owner_user_id IS NULL THEN NEW.original_owner_user_id := NEW.assigned_user_id; END IF;
    RETURN NEW;
  END IF;
  SELECT round_robin_scope INTO v_scope FROM organizations WHERE id = NEW.organization_id;
  IF v_scope NOT IN ('threads_only', 'threads_and_contacts') THEN RETURN NEW; END IF;
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

-- ============ DEMAIS (corpos completos no banco — regenerar com a query abaixo) ============
-- Restantes de menor risco (validadores, notificações, activities, boilerplate updated_at,
-- kommo/nammux subscriptions, knowledge, business_context autofill, handoff, response_time,
-- snapshot, handle_new_user, sanitize_agent_message, marketing enrich async):
-- audit trail completo já mapeado em database-full.md §6.
--
-- REGENERAR ARQUIVO COMPLETO:
-- SELECT string_agg(pg_get_functiondef(p.oid), E'\n\n') FROM pg_proc p
-- JOIN pg_namespace n ON n.oid=p.pronamespace
-- WHERE n.nspname='public' AND p.prorettype='trigger'::regtype;
