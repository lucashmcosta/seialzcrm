
CREATE TABLE IF NOT EXISTS public.communication_endpoints_purpose_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  endpoint_id uuid NOT NULL,
  organization_id uuid NOT NULL,
  old_purpose text,
  new_purpose text NOT NULL,
  reason text NOT NULL,
  migration_version text NOT NULL,
  changed_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cep_audit_endpoint ON public.communication_endpoints_purpose_audit(endpoint_id);
CREATE INDEX IF NOT EXISTS idx_cep_audit_org      ON public.communication_endpoints_purpose_audit(organization_id);
CREATE INDEX IF NOT EXISTS idx_cep_audit_version  ON public.communication_endpoints_purpose_audit(migration_version);

GRANT SELECT ON public.communication_endpoints_purpose_audit TO authenticated;
GRANT ALL    ON public.communication_endpoints_purpose_audit TO service_role;

ALTER TABLE public.communication_endpoints_purpose_audit ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins veem purpose audit da própria org" ON public.communication_endpoints_purpose_audit;
CREATE POLICY "Admins veem purpose audit da própria org"
  ON public.communication_endpoints_purpose_audit
  FOR SELECT TO authenticated
  USING (organization_id = ANY (public.current_user_org_ids()));

-- Reclassificar endpoints (purpose usa vocabulário 'commercial')
WITH targets(id, new_purpose, reason) AS (
  VALUES
    ('672a0845-0930-4f97-be6f-7b0d9fb2107f'::uuid, 'commercial', 'Viagi +551150265098 — comercial confirmado pelo cliente'),
    ('b303253e-a7f3-49b7-b92f-efdeb12071f4'::uuid, 'commercial', 'Central Trabalhista +551150287067 — sempre foi comercial'),
    ('bcf3139a-8898-485b-9c35-935e796502fe'::uuid, 'commercial', '+18783132544 — impacto residual (1 thread)')
),
audited AS (
  INSERT INTO public.communication_endpoints_purpose_audit
    (endpoint_id, organization_id, old_purpose, new_purpose, reason, migration_version)
  SELECT e.id, e.organization_id, e.purpose, t.new_purpose, t.reason, 'pr1_5_v1_reclassify_other'
    FROM (SELECT * FROM targets) t
    JOIN public.communication_endpoints e ON e.id = t.id
   WHERE e.purpose IS DISTINCT FROM t.new_purpose
  RETURNING endpoint_id, new_purpose
)
UPDATE public.communication_endpoints e
   SET purpose = a.new_purpose
  FROM audited a
 WHERE e.id = a.endpoint_id;

-- Re-backfill business_context (vocabulário 'sales')
WITH targets AS (
  SELECT t.id AS thread_id, t.organization_id, t.primary_endpoint_id, t.created_at
    FROM public.message_threads t
   WHERE t.business_context = 'other'
     AND t.primary_endpoint_id IN (
       '672a0845-0930-4f97-be6f-7b0d9fb2107f',
       'b303253e-a7f3-49b7-b92f-efdeb12071f4',
       'bcf3139a-8898-485b-9c35-935e796502fe'
     )
),
logged AS (
  INSERT INTO public.message_threads_business_context_backfill
    (thread_id, organization_id, old_business_context, new_business_context, method,
     confidence_score, endpoint_id, endpoint_purpose_at_backfill, thread_created_at, migration_version)
  SELECT thread_id, organization_id, 'other', 'sales',
         'pr1_5_v1_reclassify_from_other_to_sales',
         0.95, primary_endpoint_id,
         (SELECT purpose FROM public.communication_endpoints WHERE id = primary_endpoint_id),
         created_at, 'pr1_5_v1_reclassify_other'
    FROM targets
  RETURNING thread_id
)
UPDATE public.message_threads mt SET business_context = 'sales'
  FROM logged l WHERE mt.id = l.thread_id;
