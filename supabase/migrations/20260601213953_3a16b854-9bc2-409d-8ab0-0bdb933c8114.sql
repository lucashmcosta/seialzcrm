
-- Fase 1.3D — Blindar triggers contra notas internas
-- Notas internas (is_internal_note=true) NÃO devem:
--   1) virar last_message_content/direction da thread
--   2) entrar na fila de IA (intelligence_jobs)
--   3) gerar activity pública de mensagem

-- ============================================================
-- 1) fn_update_thread_last_message
-- ============================================================
CREATE OR REPLACE FUNCTION public.fn_update_thread_last_message()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_thread_id uuid;
  v_rec RECORD;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_thread_id := OLD.thread_id;
  ELSE
    v_thread_id := NEW.thread_id;
  END IF;

  -- FAST PATH: INSERT only
  IF TG_OP = 'INSERT' AND NEW.deleted_at IS NULL THEN
    -- Nota interna nunca vira last_message
    IF COALESCE(NEW.is_internal_note, false) THEN
      RETURN NEW;
    END IF;

    UPDATE message_threads
    SET
      last_message_id = NEW.id,
      last_message_at = NEW.sent_at,
      last_message_content = LEFT(NEW.content, 200),
      last_message_direction = NEW.direction,
      updated_at = now()
    WHERE id = v_thread_id
      AND (last_message_at IS NULL OR NEW.sent_at >= last_message_at);

    RETURN NEW;
  END IF;

  -- SLOW PATH: UPDATE or DELETE — recalcula ignorando notas internas
  SELECT m.id, m.sent_at, m.content, m.direction
  INTO v_rec
  FROM messages m
  WHERE m.thread_id = v_thread_id
    AND m.deleted_at IS NULL
    AND COALESCE(m.is_internal_note, false) = false
  ORDER BY m.sent_at DESC
  LIMIT 1;

  IF v_rec.id IS NOT NULL THEN
    UPDATE message_threads
    SET
      last_message_id = v_rec.id,
      last_message_at = v_rec.sent_at,
      last_message_content = LEFT(v_rec.content, 200),
      last_message_direction = v_rec.direction,
      updated_at = now()
    WHERE id = v_thread_id;
  ELSE
    UPDATE message_threads
    SET
      last_message_id = NULL,
      last_message_at = NULL,
      last_message_content = NULL,
      last_message_direction = NULL,
      updated_at = now()
    WHERE id = v_thread_id;
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$function$;

-- ============================================================
-- 2) fn_messages_intelligence_enqueue
-- ============================================================
CREATE OR REPLACE FUNCTION public.fn_messages_intelligence_enqueue()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_prev_at timestamptz;
  v_is_audio boolean;
  v_has_text boolean;
BEGIN
  -- Notas internas não entram em filas de IA nem recalculam response_time
  IF COALESCE(NEW.is_internal_note, false) THEN
    RETURN NEW;
  END IF;

  IF NEW.thread_id IS NOT NULL THEN
    SELECT MAX(created_at) INTO v_prev_at
    FROM public.messages
    WHERE thread_id = NEW.thread_id
      AND direction <> NEW.direction
      AND created_at < NEW.created_at;
    IF v_prev_at IS NOT NULL THEN
      NEW.response_time_seconds := GREATEST(0, EXTRACT(EPOCH FROM (NEW.created_at - v_prev_at))::int);
    END IF;
  END IF;

  v_is_audio := COALESCE(NEW.media_type, '') ILIKE 'audio%';
  v_has_text := NEW.content IS NOT NULL AND length(btrim(NEW.content)) >= 2;

  IF v_is_audio THEN
    INSERT INTO public.intelligence_jobs (organization_id, target_action, payload, idempotency_key)
    VALUES (NEW.organization_id, 'intelligence.transcribe_audio',
            jsonb_build_object('message_id', NEW.id),
            'transcribe:' || NEW.id::text)
    ON CONFLICT (organization_id, idempotency_key) DO NOTHING;
  ELSIF v_has_text THEN
    INSERT INTO public.intelligence_jobs (organization_id, target_action, payload, idempotency_key)
    VALUES (NEW.organization_id, 'intelligence.analyze_message',
            jsonb_build_object('message_id', NEW.id),
            'analyze:' || NEW.id::text)
    ON CONFLICT (organization_id, idempotency_key) DO NOTHING;
  END IF;

  RETURN NEW;
END;
$function$;

-- ============================================================
-- 3) create_message_activity
-- ============================================================
CREATE OR REPLACE FUNCTION public.create_message_activity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_contact_id UUID;
  v_opportunity_id UUID;
BEGIN
  -- Notas internas não geram activity pública
  IF COALESCE(NEW.is_internal_note, false) THEN
    RETURN NEW;
  END IF;

  SELECT contact_id, opportunity_id
  INTO v_contact_id, v_opportunity_id
  FROM message_threads
  WHERE id = NEW.thread_id;

  INSERT INTO activities (
    organization_id, contact_id, opportunity_id,
    activity_type, title, body, created_by_user_id, occurred_at
  ) VALUES (
    NEW.organization_id, v_contact_id, v_opportunity_id,
    'message', 'Nova mensagem',
    LEFT(NEW.content, 200),
    NEW.sender_user_id,
    COALESCE(NEW.sent_at, now())
  );

  RETURN NEW;
END;
$function$;
