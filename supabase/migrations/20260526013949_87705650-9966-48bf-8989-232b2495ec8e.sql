
-- =========================================================
-- BYOK — Seialz Intelligence v2
-- 1) helper has_org_role
-- 2) coluna secret_payload em organization_integrations (service_role only)
-- 3) colunas em ai_usage_logs (provider, source, estimated_cost_usd, job_id)
-- 4) tabela provider_pricing + seed básico
-- 5) views: vw_org_provider_keys, vw_org_monthly_cost_managed, vw_org_monthly_cost_byok
-- =========================================================

-- 1) has_org_role(user_id_internal, org_id, role_name) -> bool
CREATE OR REPLACE FUNCTION public.has_org_role(_user_id uuid, _org_id uuid, _role text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
      FROM public.user_organizations uo
      JOIN public.permission_profiles pp ON pp.id = uo.permission_profile_id
     WHERE uo.user_id = _user_id
       AND uo.organization_id = _org_id
       AND uo.is_active = true
       AND lower(pp.name) = lower(_role)
  );
$$;

REVOKE ALL ON FUNCTION public.has_org_role(uuid, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.has_org_role(uuid, uuid, text) TO authenticated, service_role;

-- 2) secret_payload em organization_integrations
ALTER TABLE public.organization_integrations
  ADD COLUMN IF NOT EXISTS secret_payload jsonb;

COMMENT ON COLUMN public.organization_integrations.secret_payload IS
  'BYOK encrypted secrets (AES-GCM via _shared/crypto). NEVER expose to anon/authenticated. Service-role only.';

REVOKE SELECT (secret_payload) ON public.organization_integrations FROM PUBLIC;
REVOKE SELECT (secret_payload) ON public.organization_integrations FROM anon, authenticated;
GRANT  SELECT (secret_payload), UPDATE (secret_payload) ON public.organization_integrations TO service_role;

-- 3) ai_usage_logs: provider, source, cost, job_id
ALTER TABLE public.ai_usage_logs
  ADD COLUMN IF NOT EXISTS provider           text,
  ADD COLUMN IF NOT EXISTS source             text,
  ADD COLUMN IF NOT EXISTS estimated_cost_usd numeric(14,8),
  ADD COLUMN IF NOT EXISTS job_id             uuid;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ai_usage_logs_source_check'
  ) THEN
    ALTER TABLE public.ai_usage_logs
      ADD CONSTRAINT ai_usage_logs_source_check
      CHECK (source IS NULL OR source IN ('managed','customer_key','managed_fallback'));
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='intelligence_jobs')
     AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='ai_usage_logs_job_id_fkey') THEN
    ALTER TABLE public.ai_usage_logs
      ADD CONSTRAINT ai_usage_logs_job_id_fkey
      FOREIGN KEY (job_id) REFERENCES public.intelligence_jobs(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS ai_usage_logs_org_source_created_idx
  ON public.ai_usage_logs (organization_id, source, created_at DESC);

CREATE INDEX IF NOT EXISTS ai_usage_logs_job_idx
  ON public.ai_usage_logs (job_id) WHERE job_id IS NOT NULL;

-- 4) provider_pricing
CREATE TABLE IF NOT EXISTS public.provider_pricing (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider               text NOT NULL,
  model                  text NOT NULL,
  input_per_1k_usd       numeric(14,8),
  output_per_1k_usd      numeric(14,8),
  audio_per_minute_usd   numeric(14,8),
  effective_from         timestamptz NOT NULL DEFAULT now(),
  created_at             timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider, model, effective_from)
);

ALTER TABLE public.provider_pricing ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "provider_pricing_read_all_authenticated" ON public.provider_pricing;
CREATE POLICY "provider_pricing_read_all_authenticated"
  ON public.provider_pricing FOR SELECT
  TO authenticated
  USING (true);

-- escrita só service_role (sem policy de insert/update/delete para authenticated)

-- Seeds iniciais (idempotente via UNIQUE)
INSERT INTO public.provider_pricing (provider, model, input_per_1k_usd, output_per_1k_usd, audio_per_minute_usd)
VALUES
  ('openai',     'gpt-4o-mini',                 0.00015,  0.0006,   NULL),
  ('openai',     'gpt-4o',                      0.0025,   0.01,     NULL),
  ('openai',     'whisper-1',                   NULL,     NULL,     0.006),
  ('anthropic',  'claude-3-5-sonnet-20241022',  0.003,    0.015,    NULL),
  ('anthropic',  'claude-3-5-haiku-20241022',   0.001,    0.005,    NULL),
  ('gemini',     'gemini-2.5-flash',            0.00015,  0.0006,   NULL),
  ('gemini',     'gemini-2.5-pro',              0.00125,  0.005,    NULL),
  ('elevenlabs', 'scribe_v2',                   NULL,     NULL,     0.0044)
ON CONFLICT (provider, model, effective_from) DO NOTHING;

-- 5) Views
-- 5a) vw_org_provider_keys: status mascarado, sem ciphertext
CREATE OR REPLACE VIEW public.vw_org_provider_keys
WITH (security_invoker = true) AS
SELECT
  oi.organization_id,
  e.key AS provider,
  jsonb_build_object(
    'last4',       v->>'last4',
    'verified_at', v->>'verified_at',
    'is_active',   COALESCE((v->>'is_active')::bool, false),
    'rotated_at',  v->>'rotated_at',
    'has_error',   (v->>'last_error') IS NOT NULL,
    'fallback_to_managed',  COALESCE((v->>'fallback_to_managed')::bool, false),
    'monthly_budget_usd',   NULLIF(v->>'monthly_budget_usd','')::numeric
  ) AS info
FROM public.organization_integrations oi
CROSS JOIN LATERAL jsonb_each(COALESCE(oi.secret_payload, '{}'::jsonb)) AS e(key, v);

GRANT SELECT ON public.vw_org_provider_keys TO authenticated;

-- 5b/c) custos
CREATE OR REPLACE VIEW public.vw_org_monthly_cost_managed
WITH (security_invoker = true) AS
SELECT organization_id, provider,
       date_trunc('month', created_at) AS month,
       COALESCE(SUM(estimated_cost_usd), 0) AS cost_usd,
       COALESCE(SUM(total_tokens), 0)        AS tokens
  FROM public.ai_usage_logs
 WHERE source IN ('managed','managed_fallback')
 GROUP BY 1,2,3;

CREATE OR REPLACE VIEW public.vw_org_monthly_cost_byok
WITH (security_invoker = true) AS
SELECT organization_id, provider,
       date_trunc('month', created_at) AS month,
       COALESCE(SUM(estimated_cost_usd), 0) AS cost_usd,
       COALESCE(SUM(total_tokens), 0)        AS tokens
  FROM public.ai_usage_logs
 WHERE source = 'customer_key'
 GROUP BY 1,2,3;

GRANT SELECT ON public.vw_org_monthly_cost_managed, public.vw_org_monthly_cost_byok TO authenticated;
