-- Fix B — Índices para /contacts (aditivo)

-- 1) Extensão pg_trgm em schema dedicado
CREATE SCHEMA IF NOT EXISTS extensions;
CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA extensions;

-- 2) Índice composto para a lista padrão de /contacts
--    WHERE organization_id=? AND deleted_at IS NULL ORDER BY created_at DESC
CREATE INDEX IF NOT EXISTS idx_contacts_org_created_active
  ON public.contacts (organization_id, created_at DESC)
  WHERE deleted_at IS NULL;

-- 3) Trigram para busca por nome (ILIKE '%x%')
CREATE INDEX IF NOT EXISTS idx_contacts_full_name_trgm
  ON public.contacts USING gin (full_name extensions.gin_trgm_ops)
  WHERE deleted_at IS NULL;

-- 4) Trigram para busca por email
CREATE INDEX IF NOT EXISTS idx_contacts_email_trgm
  ON public.contacts USING gin (email extensions.gin_trgm_ops)
  WHERE deleted_at IS NULL AND email IS NOT NULL;

-- 5) Trigram para busca por telefone
CREATE INDEX IF NOT EXISTS idx_contacts_phone_trgm
  ON public.contacts USING gin (phone extensions.gin_trgm_ops)
  WHERE deleted_at IS NULL AND phone IS NOT NULL;

-- 6) Índice parcial para lifecycle_stage='customer'
--    Beneficia /inbox (RPCs) e filtros por segmento customer em /contacts
CREATE INDEX IF NOT EXISTS idx_contacts_org_lifecycle_customer
  ON public.contacts (organization_id)
  WHERE lifecycle_stage = 'customer' AND deleted_at IS NULL;