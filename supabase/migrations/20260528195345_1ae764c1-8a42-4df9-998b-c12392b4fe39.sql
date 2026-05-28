-- 1) contacts.attribution_path
ALTER TABLE public.contacts
  ADD COLUMN IF NOT EXISTS attribution_path text[] NOT NULL DEFAULT '{}';

ALTER TABLE public.contacts
  DROP CONSTRAINT IF EXISTS contacts_attribution_path_vocabulary_chk;

ALTER TABLE public.contacts
  ADD CONSTRAINT contacts_attribution_path_vocabulary_chk
  CHECK (
    attribution_path <@ ARRAY[
      'meta_lead_ads','meta_lead_ads_backfill','ctwa','whatsapp',
      'landing_page_viagi','manual','kommo','webhook','csv_import'
    ]::text[]
  );

CREATE INDEX IF NOT EXISTS idx_contacts_attribution_path_gin
  ON public.contacts USING GIN (attribution_path);

-- 2) admin_one_off_jobs
CREATE TABLE IF NOT EXISTS public.admin_one_off_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_key text NOT NULL,
  mode text NOT NULL CHECK (mode IN ('dry_run','apply')),
  status text NOT NULL DEFAULT 'running' CHECK (status IN ('running','succeeded','failed')),
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  confirm_token_used text,
  input_summary jsonb NOT NULL DEFAULT '{}'::jsonb,
  output_summary jsonb NOT NULL DEFAULT '{}'::jsonb,
  error text,
  consecutive_failures int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_admin_one_off_jobs_apply_per_key
  ON public.admin_one_off_jobs(job_key) WHERE mode='apply';

CREATE INDEX IF NOT EXISTS idx_admin_one_off_jobs_status
  ON public.admin_one_off_jobs(status, started_at DESC);

GRANT SELECT, INSERT, UPDATE ON public.admin_one_off_jobs TO authenticated;
GRANT ALL ON public.admin_one_off_jobs TO service_role;

ALTER TABLE public.admin_one_off_jobs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admin_one_off_jobs_admin_select" ON public.admin_one_off_jobs;
CREATE POLICY "admin_one_off_jobs_admin_select"
  ON public.admin_one_off_jobs FOR SELECT
  TO authenticated
  USING (public.is_admin_user());

DROP POLICY IF EXISTS "admin_one_off_jobs_service_role_all" ON public.admin_one_off_jobs;
CREATE POLICY "admin_one_off_jobs_service_role_all"
  ON public.admin_one_off_jobs FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);

-- 3) admin_one_off_job_items
CREATE TABLE IF NOT EXISTS public.admin_one_off_job_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES public.admin_one_off_jobs(id) ON DELETE CASCADE,
  item_type text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','claimed','sent','failed')),
  attempts int NOT NULL DEFAULT 0,
  claimed_at timestamptz,
  completed_at timestamptz,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_job_items_claim
  ON public.admin_one_off_job_items(job_id, status)
  WHERE status IN ('pending','claimed');

CREATE INDEX IF NOT EXISTS idx_job_items_stale
  ON public.admin_one_off_job_items(claimed_at)
  WHERE status='claimed';

GRANT SELECT, INSERT, UPDATE ON public.admin_one_off_job_items TO authenticated;
GRANT ALL ON public.admin_one_off_job_items TO service_role;

ALTER TABLE public.admin_one_off_job_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admin_one_off_job_items_admin_select" ON public.admin_one_off_job_items;
CREATE POLICY "admin_one_off_job_items_admin_select"
  ON public.admin_one_off_job_items FOR SELECT
  TO authenticated
  USING (public.is_admin_user());

DROP POLICY IF EXISTS "admin_one_off_job_items_service_role_all" ON public.admin_one_off_job_items;
CREATE POLICY "admin_one_off_job_items_service_role_all"
  ON public.admin_one_off_job_items FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);

-- 4) recover_stale_job_items
CREATE OR REPLACE FUNCTION public.recover_stale_job_items(_job_id uuid)
RETURNS TABLE(recovered int, exhausted int)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_recovered int := 0;
  v_exhausted int := 0;
BEGIN
  WITH e AS (
    UPDATE public.admin_one_off_job_items
       SET status='failed', completed_at=now(), last_error='max_attempts_exceeded'
     WHERE job_id=_job_id AND status='claimed'
       AND claimed_at < now() - interval '5 minutes' AND attempts >= 5
    RETURNING 1
  ) SELECT count(*) INTO v_exhausted FROM e;

  WITH r AS (
    UPDATE public.admin_one_off_job_items
       SET status='pending', claimed_at=NULL
     WHERE job_id=_job_id AND status='claimed'
       AND claimed_at < now() - interval '5 minutes' AND attempts < 5
    RETURNING 1
  ) SELECT count(*) INTO v_recovered FROM r;

  RETURN QUERY SELECT v_recovered, v_exhausted;
END;
$$;

GRANT EXECUTE ON FUNCTION public.recover_stale_job_items(uuid) TO service_role;

-- 5) backup snapshot
CREATE TABLE IF NOT EXISTS public.backup_meta_backfill_2026_05_28_contacts (
  contact_id uuid NOT NULL,
  organization_id uuid NOT NULL,
  source text,
  source_external_id text,
  attribution_path text[],
  phone text,
  email text,
  full_name text,
  metadata jsonb,
  snapshot_at timestamptz NOT NULL DEFAULT now(),
  job_id uuid REFERENCES public.admin_one_off_jobs(id) ON DELETE SET NULL,
  PRIMARY KEY (contact_id, snapshot_at)
);

GRANT SELECT, INSERT ON public.backup_meta_backfill_2026_05_28_contacts TO authenticated;
GRANT ALL ON public.backup_meta_backfill_2026_05_28_contacts TO service_role;

ALTER TABLE public.backup_meta_backfill_2026_05_28_contacts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "backup_meta_backfill_admin_select" ON public.backup_meta_backfill_2026_05_28_contacts;
CREATE POLICY "backup_meta_backfill_admin_select"
  ON public.backup_meta_backfill_2026_05_28_contacts FOR SELECT
  TO authenticated
  USING (public.is_admin_user());

DROP POLICY IF EXISTS "backup_meta_backfill_service_role_all" ON public.backup_meta_backfill_2026_05_28_contacts;
CREATE POLICY "backup_meta_backfill_service_role_all"
  ON public.backup_meta_backfill_2026_05_28_contacts FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);