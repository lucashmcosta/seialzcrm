
ALTER TABLE public.message_threads
  ADD COLUMN IF NOT EXISTS business_context text;

ALTER TABLE public.message_threads
  DROP CONSTRAINT IF EXISTS message_threads_business_context_chk;

ALTER TABLE public.message_threads
  ADD CONSTRAINT message_threads_business_context_chk
  CHECK (business_context IS NULL OR business_context IN ('sales','customer_service','other'))
  NOT VALID;

COMMENT ON COLUMN public.message_threads.business_context IS
  'Contexto operacional histórico da thread (sales/customer_service/other). Snapshot no momento da criação — não muda se o purpose do endpoint mudar depois. Shadow em PR1; UI passa a ler em PR posterior.';

CREATE INDEX IF NOT EXISTS idx_threads_org_bizctx_lastmsg
  ON public.message_threads (organization_id, business_context, last_message_at DESC NULLS LAST);

CREATE TABLE IF NOT EXISTS public.message_threads_business_context_backfill (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id uuid NOT NULL,
  organization_id uuid NOT NULL,
  old_business_context text,
  new_business_context text NOT NULL,
  method text NOT NULL,
  confidence_score numeric(3,2) NOT NULL,
  endpoint_id uuid,
  endpoint_purpose_at_backfill text,
  thread_created_at timestamptz,
  migration_version text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_bizctx_backfill_thread ON public.message_threads_business_context_backfill(thread_id);
CREATE INDEX IF NOT EXISTS idx_bizctx_backfill_org    ON public.message_threads_business_context_backfill(organization_id);
CREATE INDEX IF NOT EXISTS idx_bizctx_backfill_method ON public.message_threads_business_context_backfill(method);

GRANT SELECT ON public.message_threads_business_context_backfill TO authenticated;
GRANT ALL    ON public.message_threads_business_context_backfill TO service_role;

ALTER TABLE public.message_threads_business_context_backfill ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins veem backfill da própria org" ON public.message_threads_business_context_backfill;
CREATE POLICY "Admins veem backfill da própria org"
  ON public.message_threads_business_context_backfill
  FOR SELECT
  TO authenticated
  USING (organization_id = ANY (public.current_user_org_ids()));
