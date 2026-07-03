
-- 1) Reclassificação blueviza
WITH targets(id, new_purpose, reason) AS (
  VALUES ('cbd7d08e-62e3-44cd-8948-cf77050d99df'::uuid, 'commercial',
          'blueviza +16898887076 — comercial confirmado pelo cliente (PR2)')
),
audited AS (
  INSERT INTO public.communication_endpoints_purpose_audit
    (endpoint_id, organization_id, old_purpose, new_purpose, reason, migration_version)
  SELECT e.id, e.organization_id, e.purpose, t.new_purpose, t.reason, 'pr2_v1_reclassify_blueviza'
    FROM (SELECT * FROM targets) t
    JOIN public.communication_endpoints e ON e.id = t.id
   WHERE e.purpose IS DISTINCT FROM t.new_purpose
  RETURNING endpoint_id, new_purpose
)
UPDATE public.communication_endpoints e SET purpose = a.new_purpose
  FROM audited a WHERE e.id = a.endpoint_id;

-- 2) Audit table para primary_endpoint_id
CREATE TABLE IF NOT EXISTS public.message_threads_primary_endpoint_backfill (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id uuid NOT NULL,
  organization_id uuid NOT NULL,
  old_primary_endpoint_id uuid,
  new_primary_endpoint_id uuid NOT NULL,
  method text NOT NULL,
  confidence_score numeric(3,2) NOT NULL,
  migration_version text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_pep_backfill_thread  ON public.message_threads_primary_endpoint_backfill(thread_id);
CREATE INDEX IF NOT EXISTS idx_pep_backfill_org     ON public.message_threads_primary_endpoint_backfill(organization_id);
CREATE INDEX IF NOT EXISTS idx_pep_backfill_version ON public.message_threads_primary_endpoint_backfill(migration_version);
GRANT SELECT ON public.message_threads_primary_endpoint_backfill TO authenticated;
GRANT ALL    ON public.message_threads_primary_endpoint_backfill TO service_role;
ALTER TABLE public.message_threads_primary_endpoint_backfill ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admins veem pep backfill da própria org" ON public.message_threads_primary_endpoint_backfill;
CREATE POLICY "Admins veem pep backfill da própria org"
  ON public.message_threads_primary_endpoint_backfill
  FOR SELECT TO authenticated
  USING (organization_id = ANY (public.current_user_org_ids()));

-- 3) PR2 — Propagação Método A (com filtro anti-conflito)
WITH null_threads AS (
  SELECT id, organization_id, contact_id, channel, status, created_at, business_context AS old_bc
    FROM public.message_threads
   WHERE primary_endpoint_id IS NULL
),
unique_ep AS (
  SELECT nt.id AS thread_id, nt.organization_id, nt.contact_id, nt.channel, nt.status,
         nt.created_at, nt.old_bc,
         (array_agg(DISTINCT m.endpoint_id) FILTER (WHERE m.endpoint_id IS NOT NULL))[1] AS ep_id
    FROM null_threads nt
    JOIN public.messages m ON m.thread_id = nt.id AND m.endpoint_id IS NOT NULL
   GROUP BY nt.id, nt.organization_id, nt.contact_id, nt.channel, nt.status, nt.created_at, nt.old_bc
  HAVING count(DISTINCT m.endpoint_id) = 1
),
valid_targets AS (
  SELECT u.*, e.purpose AS ep_purpose
    FROM unique_ep u
    JOIN public.communication_endpoints e ON e.id = u.ep_id
   WHERE e.organization_id = u.organization_id
     -- Anti-conflito com o índice único parcial:
     AND NOT (
       u.status IN ('open','awaiting_client','in_progress')
       AND EXISTS (
         SELECT 1 FROM public.message_threads t2
          WHERE t2.organization_id = u.organization_id
            AND t2.contact_id = u.contact_id
            AND t2.channel = u.channel
            AND t2.primary_endpoint_id = u.ep_id
            AND t2.status IN ('open','awaiting_client','in_progress')
            AND t2.id <> u.thread_id
       )
     )
),
computed AS (
  SELECT vt.*,
    CASE
      WHEN vt.ep_id = 'c09bd713-0225-4533-afe8-20ac07bd3a7c'
       AND vt.created_at < '2026-06-16 22:29:40+00' THEN 'sales'
      WHEN vt.ep_id = 'c09bd713-0225-4533-afe8-20ac07bd3a7c'
       AND vt.created_at >= '2026-06-16 22:29:40+00' THEN 'customer_service'
      WHEN lower(vt.ep_purpose) IN ('sales','commercial') THEN 'sales'
      WHEN lower(vt.ep_purpose) IN ('customer_service','support') THEN 'customer_service'
      ELSE 'other'
    END AS new_bc
  FROM valid_targets vt
),
log_ep AS (
  INSERT INTO public.message_threads_primary_endpoint_backfill
    (thread_id, organization_id, old_primary_endpoint_id, new_primary_endpoint_id,
     method, confidence_score, migration_version)
  SELECT thread_id, organization_id, NULL, ep_id,
         'pr2_v1_propagate_from_messages', 0.90, 'pr2_v1_propagate_from_messages'
    FROM computed
  RETURNING thread_id
),
log_bc AS (
  INSERT INTO public.message_threads_business_context_backfill
    (thread_id, organization_id, old_business_context, new_business_context, method,
     confidence_score, endpoint_id, endpoint_purpose_at_backfill, thread_created_at, migration_version)
  SELECT thread_id, organization_id, old_bc, new_bc,
         'pr2_v1_propagate_from_messages', 0.90, ep_id, ep_purpose, created_at,
         'pr2_v1_propagate_from_messages'
    FROM computed
  RETURNING thread_id
)
UPDATE public.message_threads mt
   SET primary_endpoint_id = c.ep_id,
       business_context    = c.new_bc
  FROM computed c
 WHERE mt.id = c.thread_id;

-- 4) Sweep: 12 threads novas com pep preenchido mas bc NULL
WITH targets AS (
  SELECT t.id AS thread_id, t.organization_id, t.primary_endpoint_id, t.created_at,
         e.purpose AS ep_purpose,
         CASE
           WHEN t.primary_endpoint_id = 'c09bd713-0225-4533-afe8-20ac07bd3a7c'
            AND t.created_at < '2026-06-16 22:29:40+00' THEN 'sales'
           WHEN t.primary_endpoint_id = 'c09bd713-0225-4533-afe8-20ac07bd3a7c'
            AND t.created_at >= '2026-06-16 22:29:40+00' THEN 'customer_service'
           WHEN lower(e.purpose) IN ('sales','commercial') THEN 'sales'
           WHEN lower(e.purpose) IN ('customer_service','support') THEN 'customer_service'
           ELSE 'other'
         END AS new_bc
    FROM public.message_threads t
    JOIN public.communication_endpoints e ON e.id = t.primary_endpoint_id
   WHERE t.business_context IS NULL AND t.primary_endpoint_id IS NOT NULL
),
logged AS (
  INSERT INTO public.message_threads_business_context_backfill
    (thread_id, organization_id, old_business_context, new_business_context, method,
     confidence_score, endpoint_id, endpoint_purpose_at_backfill, thread_created_at, migration_version)
  SELECT thread_id, organization_id, NULL, new_bc,
         'pr2_v1_sweep_new_threads', 0.90, primary_endpoint_id, ep_purpose, created_at,
         'pr2_v1_propagate_from_messages'
    FROM targets
  RETURNING thread_id, new_business_context
)
UPDATE public.message_threads mt SET business_context = l.new_business_context
  FROM logged l WHERE mt.id = l.thread_id;

-- 5) PR2.5 — Trigger BEFORE INSERT
CREATE OR REPLACE FUNCTION public.fn_message_threads_autofill_business_context()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_purpose text;
BEGIN
  IF NEW.business_context IS NOT NULL THEN RETURN NEW; END IF;
  IF NEW.primary_endpoint_id IS NULL THEN RETURN NEW; END IF;

  IF NEW.primary_endpoint_id = 'c09bd713-0225-4533-afe8-20ac07bd3a7c'::uuid THEN
    IF coalesce(NEW.created_at, now()) < '2026-06-16 22:29:40+00'::timestamptz THEN
      NEW.business_context := 'sales';
    ELSE
      NEW.business_context := 'customer_service';
    END IF;
    RETURN NEW;
  END IF;

  SELECT purpose INTO v_purpose
    FROM public.communication_endpoints
   WHERE id = NEW.primary_endpoint_id;

  IF lower(coalesce(v_purpose,'')) IN ('sales','commercial') THEN
    NEW.business_context := 'sales';
  ELSIF lower(coalesce(v_purpose,'')) IN ('customer_service','support') THEN
    NEW.business_context := 'customer_service';
  ELSIF v_purpose IS NOT NULL THEN
    NEW.business_context := 'other';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_message_threads_autofill_business_context ON public.message_threads;
CREATE TRIGGER trg_message_threads_autofill_business_context
  BEFORE INSERT ON public.message_threads
  FOR EACH ROW EXECUTE FUNCTION public.fn_message_threads_autofill_business_context();

COMMENT ON FUNCTION public.fn_message_threads_autofill_business_context() IS
  'PR2.5 — Preenche business_context em INSERT com base no primary_endpoint_id + cutoff Central 7027. Nunca altera linhas existentes; nunca sobrescreve valor explícito.';
