
-- ============================================================
-- KOMMO EXPANSION v3 — Migration SQL
-- ============================================================

-- 1. Tabela kommo_user_mappings
CREATE TABLE IF NOT EXISTS public.kommo_user_mappings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  kommo_user_id INTEGER NOT NULL,
  kommo_user_name TEXT,
  kommo_user_email TEXT,
  seialz_user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(organization_id, kommo_user_id)
);

ALTER TABLE public.kommo_user_mappings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members can manage kommo user mappings"
  ON public.kommo_user_mappings
  FOR ALL TO authenticated
  USING (public.user_has_org_access(organization_id))
  WITH CHECK (public.user_has_org_access(organization_id));

-- 2. Novas colunas em companies
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS source TEXT;
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS source_external_id TEXT;

-- 3. Nova coluna em tasks
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS source_external_id TEXT;

-- 4. Novas colunas em activities
ALTER TABLE public.activities ADD COLUMN IF NOT EXISTS source_external_id TEXT;
ALTER TABLE public.activities ADD COLUMN IF NOT EXISTS media_source_url TEXT;
ALTER TABLE public.activities ADD COLUMN IF NOT EXISTS media_status TEXT DEFAULT 'none';
ALTER TABLE public.activities ADD COLUMN IF NOT EXISTS media_storage_url TEXT;

-- 5. Nova coluna em custom_field_definitions
ALTER TABLE public.custom_field_definitions ADD COLUMN IF NOT EXISTS source_external_id TEXT;

-- 6. Novas colunas em import_logs
ALTER TABLE public.import_logs ADD COLUMN IF NOT EXISTS total_companies INTEGER DEFAULT 0;
ALTER TABLE public.import_logs ADD COLUMN IF NOT EXISTS imported_companies INTEGER DEFAULT 0;
ALTER TABLE public.import_logs ADD COLUMN IF NOT EXISTS total_tasks INTEGER DEFAULT 0;
ALTER TABLE public.import_logs ADD COLUMN IF NOT EXISTS imported_tasks INTEGER DEFAULT 0;
ALTER TABLE public.import_logs ADD COLUMN IF NOT EXISTS total_notes INTEGER DEFAULT 0;
ALTER TABLE public.import_logs ADD COLUMN IF NOT EXISTS imported_notes INTEGER DEFAULT 0;
ALTER TABLE public.import_logs ADD COLUMN IF NOT EXISTS total_events INTEGER DEFAULT 0;
ALTER TABLE public.import_logs ADD COLUMN IF NOT EXISTS imported_events INTEGER DEFAULT 0;
ALTER TABLE public.import_logs ADD COLUMN IF NOT EXISTS total_custom_fields INTEGER DEFAULT 0;
ALTER TABLE public.import_logs ADD COLUMN IF NOT EXISTS imported_custom_fields INTEGER DEFAULT 0;
ALTER TABLE public.import_logs ADD COLUMN IF NOT EXISTS imported_company_ids UUID[] DEFAULT '{}';
ALTER TABLE public.import_logs ADD COLUMN IF NOT EXISTS imported_task_ids UUID[] DEFAULT '{}';
ALTER TABLE public.import_logs ADD COLUMN IF NOT EXISTS imported_activity_ids UUID[] DEFAULT '{}';

-- 7. Indexes em source_external_id para performance de upsert
CREATE INDEX IF NOT EXISTS idx_companies_source_external_id
  ON public.companies(organization_id, source_external_id)
  WHERE source_external_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_tasks_source_external_id
  ON public.tasks(organization_id, source_external_id)
  WHERE source_external_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_activities_source_external_id
  ON public.activities(organization_id, source_external_id)
  WHERE source_external_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_custom_field_definitions_source_external_id
  ON public.custom_field_definitions(organization_id, source_external_id)
  WHERE source_external_id IS NOT NULL;

-- Index para media_status pending (usado pelo kommo-media-download)
CREATE INDEX IF NOT EXISTS idx_activities_media_pending
  ON public.activities(organization_id, media_status)
  WHERE media_status = 'pending';

-- 8. Unique constraints para deduplicacao
CREATE UNIQUE INDEX IF NOT EXISTS uq_companies_source_external_id
  ON public.companies(organization_id, source_external_id)
  WHERE source_external_id IS NOT NULL AND deleted_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_tasks_source_external_id
  ON public.tasks(organization_id, source_external_id)
  WHERE source_external_id IS NOT NULL AND deleted_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_activities_source_external_id
  ON public.activities(organization_id, source_external_id)
  WHERE source_external_id IS NOT NULL AND deleted_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_custom_field_definitions_source_external_id
  ON public.custom_field_definitions(organization_id, source_external_id)
  WHERE source_external_id IS NOT NULL;

-- 9. Storage bucket para midia importada
INSERT INTO storage.buckets (id, name, public)
VALUES ('kommo-media', 'kommo-media', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Allow public read on kommo-media"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'kommo-media');

CREATE POLICY "Allow service role upload on kommo-media"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'kommo-media');
