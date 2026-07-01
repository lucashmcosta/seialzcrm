-- ============================================================
-- contacts search normalization: unaccent + phone digits
-- ============================================================

-- 0) Garantir schema extensions (idempotente)
CREATE SCHEMA IF NOT EXISTS extensions;

-- 1) Extensão unaccent no schema extensions
CREATE EXTENSION IF NOT EXISTS unaccent WITH SCHEMA extensions;

-- 2) Wrapper IMMUTABLE de unaccent (necessário para GENERATED e índices).
--    search_path fixo previne hijack e satisfaz o linter do Supabase.
CREATE OR REPLACE FUNCTION public.f_unaccent(text)
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
STRICT
SET search_path = public, extensions
AS $$
  SELECT extensions.unaccent('extensions.unaccent', $1)
$$;

-- 3) Colunas geradas STORED
ALTER TABLE public.contacts
  ADD COLUMN search_name text
    GENERATED ALWAYS AS (public.f_unaccent(lower(coalesce(full_name, '')))) STORED,
  ADD COLUMN search_email text
    GENERATED ALWAYS AS (lower(coalesce(email, ''))) STORED,
  ADD COLUMN phone_digits text
    GENERATED ALWAYS AS (regexp_replace(coalesce(phone, ''), '\D', '', 'g')) STORED;

-- 4) Índices GIN trigram (respeitando soft delete). Índices antigos ficam
--    de propósito para permitir rollback trivial; podem ser dropados numa
--    segunda migration após validação em produção.
CREATE INDEX IF NOT EXISTS idx_contacts_search_name_trgm
  ON public.contacts USING gin (search_name extensions.gin_trgm_ops)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_contacts_search_email_trgm
  ON public.contacts USING gin (search_email extensions.gin_trgm_ops)
  WHERE deleted_at IS NULL AND search_email <> '';

CREATE INDEX IF NOT EXISTS idx_contacts_phone_digits_trgm
  ON public.contacts USING gin (phone_digits extensions.gin_trgm_ops)
  WHERE deleted_at IS NULL AND phone_digits <> '';