-- =====================================================================
-- Ingestion V1 · Fase 0 — BASELINE: meta_lead_pages + lead_forms
-- =====================================================================
-- Tabelas do Meta Lead Ads criadas out-of-band (nenhum CREATE nas migrations;
-- 1ª referência rastreada em 20260712031212). DDL capturado FIELMENTE de prod.
-- meta_lead_pages vem antes de lead_forms (FK). Idempotente; não altera dados.
-- =====================================================================

-- Função de trigger compartilhada (updated_at) — usada pelas duas tabelas
CREATE OR REPLACE FUNCTION public.set_updated_at_lead_forms()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_catalog'
AS $function$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$function$;

-- ---- meta_lead_pages (uma página Meta conectada) ----
CREATE TABLE IF NOT EXISTS public.meta_lead_pages (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  organization_integration_id uuid NOT NULL,
  meta_page_id text NOT NULL,
  meta_page_name text NOT NULL,
  meta_business_id text,
  meta_page_category text,
  page_access_token_encrypted text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  last_health_check_at timestamptz,
  last_health_check_status text,
  last_health_check_error text,
  discovered_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT meta_lead_pages_pkey PRIMARY KEY (id),
  CONSTRAINT meta_lead_pages_unique_per_integration UNIQUE (organization_integration_id, meta_page_id),
  CONSTRAINT meta_lead_pages_last_health_check_status_check
    CHECK ((last_health_check_status = ANY (ARRAY['ok'::text, 'expired'::text, 'revoked'::text, 'error'::text]))),
  CONSTRAINT meta_lead_pages_organization_id_fkey
    FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE,
  CONSTRAINT meta_lead_pages_organization_integration_id_fkey
    FOREIGN KEY (organization_integration_id) REFERENCES public.organization_integrations(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_meta_lead_pages_active
  ON public.meta_lead_pages USING btree (organization_id, is_active) WHERE (is_active = true);
CREATE INDEX IF NOT EXISTS idx_meta_lead_pages_integration_id
  ON public.meta_lead_pages USING btree (organization_integration_id);
CREATE INDEX IF NOT EXISTS idx_meta_lead_pages_organization_id
  ON public.meta_lead_pages USING btree (organization_id);

DROP TRIGGER IF EXISTS trg_meta_lead_pages_updated_at ON public.meta_lead_pages;
CREATE TRIGGER trg_meta_lead_pages_updated_at
  BEFORE UPDATE ON public.meta_lead_pages
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_lead_forms();

ALTER TABLE public.meta_lead_pages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admins can view all meta lead pages" ON public.meta_lead_pages;
CREATE POLICY "Admins can view all meta lead pages" ON public.meta_lead_pages
  FOR SELECT TO public USING (is_admin_user());
DROP POLICY IF EXISTS "Org members can manage meta lead pages" ON public.meta_lead_pages;
CREATE POLICY "Org members can manage meta lead pages" ON public.meta_lead_pages
  FOR ALL TO authenticated
  USING (user_has_org_access(organization_id)) WITH CHECK (user_has_org_access(organization_id));

-- ---- lead_forms (um formulário de lead) ----
CREATE TABLE IF NOT EXISTS public.lead_forms (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  provider text NOT NULL,
  provider_form_id text NOT NULL,
  provider_form_name text NOT NULL,
  provider_metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  meta_lead_page_id uuid,
  organization_integration_id uuid,
  is_monitored boolean NOT NULL DEFAULT false,
  last_synced_lead_created_time timestamptz,
  last_synced_lead_id text,
  last_synced_at timestamptz,
  last_sync_status text,
  last_sync_error text,
  consecutive_errors integer NOT NULL DEFAULT 0,
  total_synced_leads integer NOT NULL DEFAULT 0,
  questions_synced_at timestamptz,
  is_mapping_configured boolean NOT NULL DEFAULT false,
  discovered_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  has_phone_verification boolean NOT NULL DEFAULT false,
  CONSTRAINT lead_forms_pkey PRIMARY KEY (id),
  CONSTRAINT lead_forms_unique_per_org UNIQUE (organization_id, provider, provider_form_id),
  CONSTRAINT lead_forms_provider_check
    CHECK ((provider = ANY (ARRAY['meta_lead_ads'::text, 'webhook'::text, 'manual_import'::text]))),
  CONSTRAINT lead_forms_last_sync_status_check
    CHECK ((last_sync_status = ANY (ARRAY['pending'::text, 'running'::text, 'success'::text, 'error'::text]))),
  CONSTRAINT lead_forms_organization_id_fkey
    FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE,
  CONSTRAINT lead_forms_organization_integration_id_fkey
    FOREIGN KEY (organization_integration_id) REFERENCES public.organization_integrations(id) ON DELETE CASCADE,
  CONSTRAINT lead_forms_meta_lead_page_id_fkey
    FOREIGN KEY (meta_lead_page_id) REFERENCES public.meta_lead_pages(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_lead_forms_meta_page_id
  ON public.lead_forms USING btree (meta_lead_page_id) WHERE (meta_lead_page_id IS NOT NULL);
CREATE INDEX IF NOT EXISTS idx_lead_forms_monitored
  ON public.lead_forms USING btree (is_monitored, last_synced_at) WHERE (is_monitored = true);
CREATE INDEX IF NOT EXISTS idx_lead_forms_organization_id
  ON public.lead_forms USING btree (organization_id);
CREATE INDEX IF NOT EXISTS idx_lead_forms_provider
  ON public.lead_forms USING btree (organization_id, provider);

DROP TRIGGER IF EXISTS trg_lead_forms_updated_at ON public.lead_forms;
CREATE TRIGGER trg_lead_forms_updated_at
  BEFORE UPDATE ON public.lead_forms
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_lead_forms();

ALTER TABLE public.lead_forms ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admins can view all lead forms" ON public.lead_forms;
CREATE POLICY "Admins can view all lead forms" ON public.lead_forms
  FOR SELECT TO public USING (is_admin_user());
DROP POLICY IF EXISTS "Org members can manage lead forms" ON public.lead_forms;
CREATE POLICY "Org members can manage lead forms" ON public.lead_forms
  FOR ALL TO authenticated
  USING (user_has_org_access(organization_id)) WITH CHECK (user_has_org_access(organization_id));
