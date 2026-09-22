-- 1. Capacidade por aparelho
ALTER TABLE public.user_push_tokens
  ADD COLUMN IF NOT EXISTS app_version text,
  ADD COLUMN IF NOT EXISTS supports_read_sync boolean NOT NULL DEFAULT false;

-- 2. Registro v2 (a funcao de 2 parametros permanece intocada)
CREATE OR REPLACE FUNCTION public.rpc_register_push_token_v2(
  p_expo_push_token text,
  p_platform text,
  p_app_version text DEFAULT NULL,
  p_supports_read_sync boolean DEFAULT false
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_user_id uuid;
  v_id uuid;
BEGIN
  v_user_id := current_user_id();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'NOT_AUTHENTICATED' USING ERRCODE = 'P0002';
  END IF;
  IF nullif(btrim(coalesce(p_expo_push_token, '')), '') IS NULL THEN
    RAISE EXCEPTION 'INVALID_TOKEN' USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO public.user_push_tokens (
    user_id, expo_push_token, platform, is_active, last_seen_at,
    app_version, supports_read_sync
  ) VALUES (
    v_user_id, btrim(p_expo_push_token), coalesce(p_platform, 'unknown'), true, now(),
    nullif(btrim(coalesce(p_app_version, '')), ''), coalesce(p_supports_read_sync, false)
  )
  ON CONFLICT (user_id, expo_push_token) DO UPDATE
    SET platform = coalesce(excluded.platform, public.user_push_tokens.platform),
        is_active = true,
        last_seen_at = now(),
        app_version = coalesce(excluded.app_version, public.user_push_tokens.app_version),
        supports_read_sync = excluded.supports_read_sync,
        updated_at = now()
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_register_push_token_v2(text, text, text, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_register_push_token_v2(text, text, text, boolean) TO authenticated, service_role;

-- 3. Fila reaproveitada
ALTER TABLE public.push_delivery_jobs
  ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'message',
  ADD COLUMN IF NOT EXISTS payload jsonb,
  ADD COLUMN IF NOT EXISTS exclude_push_token text;

ALTER TABLE public.push_delivery_jobs ALTER COLUMN title DROP NOT NULL;
ALTER TABLE public.push_delivery_jobs ALTER COLUMN body DROP NOT NULL;
ALTER TABLE public.push_delivery_jobs ALTER COLUMN thread_id DROP NOT NULL;
ALTER TABLE public.push_delivery_jobs ALTER COLUMN message_id DROP NOT NULL;
ALTER TABLE public.push_delivery_jobs ALTER COLUMN target_url DROP NOT NULL;

CREATE INDEX IF NOT EXISTS idx_push_delivery_jobs_read_sync_pending
  ON public.push_delivery_jobs (recipient_user_id, created_at DESC)
  WHERE kind = 'read_sync' AND status = 'pending';

-- 3b. PROTECAO (diff de uma linha sobre a definicao atual obtida por
-- pg_get_functiondef: mesma assinatura (p_limit integer DEFAULT 25), mesmo
-- retorno SETOF push_delivery_jobs, mesmo corpo; acrescido apenas de
-- "AND kind = 'message'"). Ate a edge function nova estar no ar, o dispatcher
-- atual nao pode reivindicar jobs read_sync.
CREATE OR REPLACE FUNCTION public.rpc_claim_push_delivery_jobs(p_limit integer DEFAULT 25)
RETURNS SETOF push_delivery_jobs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  RETURN QUERY
  WITH candidates AS (
    SELECT id
    FROM public.push_delivery_jobs
    WHERE status = 'pending'
      AND next_attempt_at <= now()
      AND kind = 'message'
    ORDER BY next_attempt_at
    LIMIT greatest(1, least(coalesce(p_limit, 25), 100))
    FOR UPDATE SKIP LOCKED
  )
  UPDATE public.push_delivery_jobs j
     SET status = 'running',
         attempts = j.attempts + 1,
         updated_at = now()
   WHERE j.id IN (SELECT id FROM candidates)
  RETURNING j.*;
END;
$$;

-- 4. Contador de conversas com mensagem nova (badge)
CREATE OR REPLACE FUNCTION public.fn_push_unread_thread_count(p_user_id uuid)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT count(*)::int
  FROM public.message_threads mt
  LEFT JOIN public.message_thread_reads r
    ON r.thread_id = mt.id AND r.user_id = p_user_id
  WHERE mt.assigned_user_id = p_user_id
    AND mt.last_message_direction = 'inbound'
    AND mt.last_message_at IS NOT NULL
    AND (r.last_read_at IS NULL OR mt.last_message_at > r.last_read_at);
$$;

REVOKE ALL ON FUNCTION public.fn_push_unread_thread_count(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_push_unread_thread_count(uuid) TO service_role;

-- 5. Trigger a prova de erro em message_thread_reads
CREATE OR REPLACE FUNCTION public.fn_enqueue_read_sync_push()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_prev timestamptz;
  v_org uuid;
  v_last_at timestamptz;
  v_last_dir text;
  v_source_token text;
  v_job_id uuid;
BEGIN
  v_prev := CASE WHEN TG_OP = 'UPDATE' THEN OLD.last_read_at ELSE NULL END;

  SELECT mt.organization_id, mt.last_message_at, mt.last_message_direction
    INTO v_org, v_last_at, v_last_dir
  FROM public.message_threads mt
  WHERE mt.id = NEW.thread_id;

  IF v_org IS NULL
     OR v_last_dir IS DISTINCT FROM 'inbound'
     OR v_last_at IS NULL
     OR NOT (v_prev IS NULL OR v_last_at > v_prev)
     OR NEW.last_read_at IS NULL
     OR v_last_at > NEW.last_read_at THEN
    RETURN NEW;
  END IF;

  v_source_token := nullif(btrim(coalesce(current_setting('seialz.read_source_token', true), '')), '');

  SELECT id INTO v_job_id
  FROM public.push_delivery_jobs
  WHERE kind = 'read_sync'
    AND status = 'pending'
    AND recipient_user_id = NEW.user_id
    AND created_at > now() - interval '20 seconds'
  ORDER BY created_at DESC
  LIMIT 1
  FOR UPDATE SKIP LOCKED;

  IF v_job_id IS NOT NULL THEN
    UPDATE public.push_delivery_jobs
       SET payload = jsonb_build_object(
             'thread_ids',
             (SELECT to_jsonb(array_agg(DISTINCT t))
                FROM unnest(
                  ARRAY(SELECT jsonb_array_elements_text(coalesce(payload -> 'thread_ids', '[]'::jsonb)))
                  || ARRAY[NEW.thread_id::text]
                ) AS t)
           ),
           updated_at = now()
     WHERE id = v_job_id
       AND status = 'pending';
    RETURN NEW;
  END IF;

  INSERT INTO public.push_delivery_jobs (
    organization_id, recipient_user_id, thread_id, kind,
    payload, exclude_push_token, target_url
  ) VALUES (
    v_org, NEW.user_id, NEW.thread_id, 'read_sync',
    jsonb_build_object('thread_ids', jsonb_build_array(NEW.thread_id::text)),
    v_source_token,
    NULL
  );

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING '[read_sync] enqueue failed for thread % user %: %', NEW.thread_id, NEW.user_id, SQLERRM;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enqueue_read_sync_push ON public.message_thread_reads;
CREATE TRIGGER trg_enqueue_read_sync_push
AFTER INSERT OR UPDATE OF last_read_at ON public.message_thread_reads
FOR EACH ROW EXECUTE FUNCTION public.fn_enqueue_read_sync_push();

-- 6. Marcacao de leitura com origem
CREATE OR REPLACE FUNCTION public.rpc_mark_thread_read(
  p_thread_id uuid,
  p_source text DEFAULT 'web',
  p_device_token text DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_user_id uuid;
  v_org uuid;
  v_prev timestamptz;
  v_last_at timestamptz;
  v_last_dir text;
BEGIN
  v_user_id := current_user_id();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'NOT_AUTHENTICATED' USING ERRCODE = 'P0002';
  END IF;

  SELECT mt.organization_id, mt.last_message_at, mt.last_message_direction
    INTO v_org, v_last_at, v_last_dir
  FROM public.message_threads mt
  WHERE mt.id = p_thread_id;

  IF v_org IS NULL THEN
    RAISE EXCEPTION 'THREAD_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.user_organizations uo
    WHERE uo.organization_id = v_org
      AND uo.user_id = v_user_id
      AND uo.is_active = true
  ) THEN
    RAISE EXCEPTION 'ACCESS_DENIED' USING ERRCODE = 'P0002';
  END IF;

  SELECT r.last_read_at INTO v_prev
  FROM public.message_thread_reads r
  WHERE r.thread_id = p_thread_id AND r.user_id = v_user_id;

  PERFORM set_config('seialz.read_source_token', coalesce(nullif(btrim(coalesce(p_device_token, '')), ''), ''), true);

  INSERT INTO public.message_thread_reads (thread_id, user_id, last_read_at)
  VALUES (p_thread_id, v_user_id, now())
  ON CONFLICT (thread_id, user_id) DO UPDATE SET last_read_at = now();

  RETURN v_last_dir = 'inbound'
     AND v_last_at IS NOT NULL
     AND (v_prev IS NULL OR v_last_at > v_prev);
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_mark_thread_read(uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_mark_thread_read(uuid, text, text) TO authenticated, service_role;