
-- ============================================================
-- SEIALZ INTELLIGENCE - MVP
-- ============================================================

-- 1) intelligence_jobs (fila isolada)
CREATE TABLE IF NOT EXISTS public.intelligence_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  target_action text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  idempotency_key text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  attempts integer NOT NULL DEFAULT 0,
  max_attempts integer NOT NULL DEFAULT 5,
  next_run_at timestamptz NOT NULL DEFAULT now(),
  last_error text,
  last_error_at timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  external_response jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT intelligence_jobs_status_chk CHECK (status IN ('pending','running','failed','success','permanent_failure')),
  CONSTRAINT intelligence_jobs_idem_uniq UNIQUE (organization_id, idempotency_key)
);
CREATE INDEX IF NOT EXISTS idx_intel_jobs_ready
  ON public.intelligence_jobs (next_run_at)
  WHERE status IN ('pending','failed');
CREATE INDEX IF NOT EXISTS idx_intel_jobs_org_status
  ON public.intelligence_jobs (organization_id, status, created_at DESC);

ALTER TABLE public.intelligence_jobs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "org members read intel jobs" ON public.intelligence_jobs
  FOR SELECT USING (organization_id = ANY (public.current_user_org_ids()));

-- 2) sales_events (append-only)
CREATE TABLE IF NOT EXISTS public.sales_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  contact_id uuid,
  opportunity_id uuid,
  message_id uuid,
  user_id uuid,
  event_type text NOT NULL,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_sales_events_org_time
  ON public.sales_events (organization_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_sales_events_org_opp_type
  ON public.sales_events (organization_id, opportunity_id, event_type)
  WHERE opportunity_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_sales_events_org_contact_type
  ON public.sales_events (organization_id, contact_id, event_type)
  WHERE contact_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_sales_events_message
  ON public.sales_events (message_id)
  WHERE message_id IS NOT NULL;

ALTER TABLE public.sales_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "org members read sales_events" ON public.sales_events
  FOR SELECT USING (organization_id = ANY (public.current_user_org_ids()));

-- 3) message_analyses
CREATE TABLE IF NOT EXISTS public.message_analyses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id uuid NOT NULL,
  organization_id uuid NOT NULL,
  analysis_version text NOT NULL,
  model text NOT NULL,
  sentiment text,
  intent text,
  objection_type text,
  urgency_score integer,
  buying_signals jsonb NOT NULL DEFAULT '[]'::jsonb,
  requires_human boolean NOT NULL DEFAULT false,
  language_complexity text,
  reasoning text,
  tokens_used integer,
  raw_response jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT message_analyses_unique UNIQUE (message_id, analysis_version)
);
CREATE INDEX IF NOT EXISTS idx_msg_analyses_org_created
  ON public.message_analyses (organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_msg_analyses_message ON public.message_analyses (message_id);

ALTER TABLE public.message_analyses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "org members read message_analyses" ON public.message_analyses
  FOR SELECT USING (organization_id = ANY (public.current_user_org_ids()));

-- 4) audio_transcriptions
CREATE TABLE IF NOT EXISTS public.audio_transcriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id uuid NOT NULL,
  organization_id uuid NOT NULL,
  version text NOT NULL,
  provider text NOT NULL,
  language text,
  transcript text NOT NULL DEFAULT '',
  raw_response jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT audio_transcriptions_unique UNIQUE (message_id, version)
);
CREATE INDEX IF NOT EXISTS idx_audio_tr_org_created
  ON public.audio_transcriptions (organization_id, created_at DESC);

ALTER TABLE public.audio_transcriptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "org members read audio_transcriptions" ON public.audio_transcriptions
  FOR SELECT USING (organization_id = ANY (public.current_user_org_ids()));

-- 5) Campos quentes denormalizados em messages
ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS sentiment text,
  ADD COLUMN IF NOT EXISTS intent text,
  ADD COLUMN IF NOT EXISTS urgency_score integer,
  ADD COLUMN IF NOT EXISTS ai_analyzed_at timestamptz,
  ADD COLUMN IF NOT EXISTS ai_analysis_version text,
  ADD COLUMN IF NOT EXISTS response_time_seconds integer;

CREATE INDEX IF NOT EXISTS idx_messages_org_intent
  ON public.messages (organization_id, intent)
  WHERE intent IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_messages_org_sentiment
  ON public.messages (organization_id, sentiment)
  WHERE sentiment IS NOT NULL;

-- 6) Campos em contacts/opportunities
ALTER TABLE public.contacts
  ADD COLUMN IF NOT EXISTS engagement_score integer,
  ADD COLUMN IF NOT EXISTS avg_response_time_seconds integer;

ALTER TABLE public.opportunities
  ADD COLUMN IF NOT EXISTS health_score integer,
  ADD COLUMN IF NOT EXISTS ghosting_risk_score integer;

-- ============================================================
-- 7) RPC: claim atômico de jobs (multi-worker safe)
-- ============================================================
CREATE OR REPLACE FUNCTION public.rpc_claim_intelligence_jobs(p_limit integer DEFAULT 10)
RETURNS SETOF public.intelligence_jobs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  RETURN QUERY
  WITH claimed AS (
    SELECT j.id
    FROM public.intelligence_jobs j
    WHERE j.status IN ('pending','failed')
      AND j.next_run_at <= now()
      AND j.attempts < j.max_attempts
    ORDER BY j.next_run_at
    FOR UPDATE OF j SKIP LOCKED
    LIMIT p_limit
  )
  UPDATE public.intelligence_jobs j
  SET status = 'running',
      started_at = now(),
      attempts = j.attempts + 1
  FROM claimed
  WHERE j.id = claimed.id
  RETURNING j.*;
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_claim_intelligence_jobs(integer) FROM PUBLIC;

-- ============================================================
-- 8) Trigger: ao inserir mensagem -> calcula response_time + enfileira análise
-- ============================================================
CREATE OR REPLACE FUNCTION public.fn_messages_intelligence_enqueue()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_prev_at timestamptz;
  v_is_audio boolean;
  v_has_text boolean;
BEGIN
  -- response_time_seconds: tempo desde a última mensagem oposta na mesma thread
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

  -- Enfileira transcrição se for áudio
  IF v_is_audio THEN
    INSERT INTO public.intelligence_jobs (organization_id, target_action, payload, idempotency_key)
    VALUES (NEW.organization_id, 'intelligence.transcribe_audio',
            jsonb_build_object('message_id', NEW.id),
            'transcribe:' || NEW.id::text)
    ON CONFLICT (organization_id, idempotency_key) DO NOTHING;
  -- Caso contrário, se tem texto, enfileira análise direta
  ELSIF v_has_text THEN
    INSERT INTO public.intelligence_jobs (organization_id, target_action, payload, idempotency_key)
    VALUES (NEW.organization_id, 'intelligence.analyze_message',
            jsonb_build_object('message_id', NEW.id),
            'analyze:' || NEW.id::text)
    ON CONFLICT (organization_id, idempotency_key) DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_messages_intelligence_enqueue ON public.messages;
CREATE TRIGGER trg_messages_intelligence_enqueue
BEFORE INSERT ON public.messages
FOR EACH ROW
EXECUTE FUNCTION public.fn_messages_intelligence_enqueue();
