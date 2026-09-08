-- 1) Device tokens
CREATE TABLE public.user_push_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  expo_push_token text NOT NULL,
  platform text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT user_push_tokens_platform_chk CHECK (platform IN ('ios','android')),
  CONSTRAINT user_push_tokens_user_token_uniq UNIQUE (user_id, expo_push_token)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_push_tokens TO authenticated;
GRANT ALL ON public.user_push_tokens TO service_role;

ALTER TABLE public.user_push_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own push tokens select" ON public.user_push_tokens
  FOR SELECT TO authenticated USING (user_id = current_user_id());
CREATE POLICY "own push tokens insert" ON public.user_push_tokens
  FOR INSERT TO authenticated WITH CHECK (user_id = current_user_id());
CREATE POLICY "own push tokens update" ON public.user_push_tokens
  FOR UPDATE TO authenticated USING (user_id = current_user_id()) WITH CHECK (user_id = current_user_id());
CREATE POLICY "own push tokens delete" ON public.user_push_tokens
  FOR DELETE TO authenticated USING (user_id = current_user_id());

CREATE INDEX idx_user_push_tokens_active ON public.user_push_tokens (user_id) WHERE is_active;

CREATE TRIGGER trg_user_push_tokens_updated_at
  BEFORE UPDATE ON public.user_push_tokens
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2) Delivery queue (service_role only)
CREATE TABLE public.push_delivery_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  recipient_user_id uuid NOT NULL,
  thread_id uuid NOT NULL,
  message_id uuid NOT NULL,
  business_context text,
  title text NOT NULL,
  body text NOT NULL,
  target_url text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  attempts integer NOT NULL DEFAULT 0,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  last_error text,
  last_error_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT push_delivery_jobs_status_chk CHECK (status IN ('pending','running','sent','failed','dead_letter','skipped'))
);

GRANT ALL ON public.push_delivery_jobs TO service_role;

ALTER TABLE public.push_delivery_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "push jobs service only" ON public.push_delivery_jobs
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE INDEX idx_push_delivery_jobs_claim ON public.push_delivery_jobs (status, next_attempt_at);

CREATE TRIGGER trg_push_delivery_jobs_updated_at
  BEFORE UPDATE ON public.push_delivery_jobs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 3) App-facing RPCs
CREATE OR REPLACE FUNCTION public.rpc_register_push_token(p_expo_push_token text, p_platform text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_user_id uuid := current_user_id();
  v_id uuid;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;
  IF coalesce(trim(p_expo_push_token), '') = '' THEN
    RAISE EXCEPTION 'invalid_token';
  END IF;
  IF p_platform NOT IN ('ios','android') THEN
    RAISE EXCEPTION 'invalid_platform';
  END IF;

  INSERT INTO public.user_push_tokens (user_id, expo_push_token, platform)
  VALUES (v_user_id, trim(p_expo_push_token), p_platform)
  ON CONFLICT (user_id, expo_push_token) DO UPDATE
    SET is_active = true,
        platform = EXCLUDED.platform,
        last_seen_at = now(),
        updated_at = now()
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.rpc_deactivate_push_token(p_expo_push_token text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_user_id uuid := current_user_id();
  v_count integer;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  UPDATE public.user_push_tokens
     SET is_active = false, updated_at = now()
   WHERE user_id = v_user_id
     AND expo_push_token = trim(p_expo_push_token);

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count > 0;
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_register_push_token(text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_deactivate_push_token(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_register_push_token(text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_deactivate_push_token(text) TO authenticated;

-- 4) Enqueue push in the existing notification trigger (web behaviour untouched)
CREATE OR REPLACE FUNCTION public.notify_new_message()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_contact_owner_id UUID;
  v_contact_name TEXT;
  v_assigned_user_id UUID;
  v_business_context TEXT;
  v_preview TEXT;
  v_url TEXT;
BEGIN
  -- Get contact owner and name
  SELECT c.owner_user_id, c.full_name, mt.assigned_user_id, mt.business_context
  INTO v_contact_owner_id, v_contact_name, v_assigned_user_id, v_business_context
  FROM message_threads mt
  JOIN contacts c ON c.id = mt.contact_id
  WHERE mt.id = NEW.thread_id;

  -- Only notify if message is from contact (inbound) and owner exists
  IF NEW.direction = 'inbound' AND v_contact_owner_id IS NOT NULL THEN
    INSERT INTO notifications (
      user_id, organization_id, type, title, body,
      entity_type, entity_id
    ) VALUES (
      v_contact_owner_id,
      NEW.organization_id,
      'new_message',
      'Nova mensagem recebida',
      v_contact_name || ' enviou uma mensagem',
      'message',
      NEW.id
    );
  END IF;

  -- Mobile push: assigned user of the thread only.
  IF NEW.direction = 'inbound'
     AND NEW.deleted_at IS NULL
     AND coalesce(NEW.is_internal_note, false) = false
     AND v_assigned_user_id IS NOT NULL THEN

    v_preview := nullif(btrim(coalesce(NEW.content, '')), '');
    IF v_preview IS NULL THEN
      v_preview := CASE
        WHEN NEW.media_type ILIKE 'audio%' THEN 'Mensagem de voz'
        WHEN NEW.media_type ILIKE 'image%' THEN 'Imagem'
        WHEN NEW.media_type ILIKE 'video%' THEN 'Vídeo'
        WHEN NEW.media_type IS NOT NULL THEN 'Documento'
        ELSE 'Nova mensagem'
      END;
    ELSIF length(v_preview) > 180 THEN
      v_preview := left(v_preview, 177) || '...';
    END IF;

    v_url := CASE
      WHEN v_business_context = 'customer_service' THEN '/inbox/' || NEW.thread_id::text
      ELSE '/messages/' || NEW.thread_id::text
    END;

    INSERT INTO public.push_delivery_jobs (
      organization_id, recipient_user_id, thread_id, message_id,
      business_context, title, body, target_url
    ) VALUES (
      NEW.organization_id,
      v_assigned_user_id,
      NEW.thread_id,
      NEW.id,
      v_business_context,
      coalesce(nullif(btrim(coalesce(v_contact_name, '')), ''), 'Nova mensagem'),
      v_preview,
      v_url
    );
  END IF;

  RETURN NEW;
END;
$function$;