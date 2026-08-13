-- =====================================================================
-- Ingestion V1 · Fase 0 — BASELINE de schema não-rastreado (drift-fix)
-- contacts.phone_normalized + normalize_phone_br + trigger + índice único
-- =====================================================================
-- Estes objetos JÁ EXISTEM em produção, aplicados fora das migrations
-- (out-of-band). O DDL abaixo é a captura FIEL do que roda hoje (extraído via
-- pg_get_functiondef / pg_indexes / pg_get_triggerdef), NÃO reconstrução por
-- suposição. São load-bearing: o dedup de contato depende do índice único
-- uniq_contacts_org_phone_normalized e da normalização phone_normalized.
--
-- Timestamp escolhido ANTES da 1ª referência rastreada a estes objetos
-- (normalize_phone_br em 20260528205052) para que `supabase db reset` do zero
-- os crie antes de qualquer migration que os use.
--
-- Idempotente (CREATE OR REPLACE / IF NOT EXISTS / DROP+CREATE): aplica sem
-- erro em produção (que já tem tudo) E reproduz num banco do zero. NÃO altera
-- comportamento nem dados.
-- =====================================================================

ALTER TABLE public.contacts
  ADD COLUMN IF NOT EXISTS phone_normalized text;

CREATE OR REPLACE FUNCTION public.normalize_phone_br(phone_input text)
 RETURNS text
 LANGUAGE plpgsql
 IMMUTABLE PARALLEL SAFE
AS $function$
DECLARE
  digits text;
  local_digits text;
  ddd text;
  rest text;
BEGIN
  -- Vazio ou nulo
  IF phone_input IS NULL OR length(trim(phone_input)) = 0 THEN
    RETURN NULL;
  END IF;

  -- Extrai só dígitos
  digits := regexp_replace(phone_input, '[^0-9]', '', 'g');

  -- Muito curto (menos de 10 dígitos): provavelmente lixo, retorna como veio
  IF length(digits) < 10 THEN
    RETURN digits;
  END IF;

  -- Remove código do país 55 se presente (BR)
  IF digits LIKE '55%' AND length(digits) >= 12 THEN
    local_digits := substring(digits FROM 3);
  ELSE
    -- Não é BR (ex: +1 EUA, +351 PT, etc.) — retorna só os dígitos
    RETURN digits;
  END IF;

  -- Sanity: depois de remover 55, deve ter 10 ou 11 dígitos
  IF length(local_digits) NOT IN (10, 11) THEN
    -- Formato BR esquisito, retorna como está pra não criar conflito artificial
    RETURN digits;
  END IF;

  ddd := substring(local_digits FROM 1 FOR 2);
  rest := substring(local_digits FROM 3);

  -- Caso 1: 11 dígitos com 9 na 3ª posição → já canônico
  IF length(local_digits) = 11 AND substring(rest FROM 1 FOR 1) = '9' THEN
    RETURN '55' || local_digits;
  END IF;

  -- Caso 2: 10 dígitos (sem 9º dígito) → adiciona 9 após DDD
  IF length(local_digits) = 10 THEN
    RETURN '55' || ddd || '9' || rest;
  END IF;

  -- Fallback: retorna como está
  RETURN '55' || local_digits;
END;
$function$;

CREATE OR REPLACE FUNCTION public.contacts_set_phone_normalized()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  NEW.phone_normalized := normalize_phone_br(NEW.phone);
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_contacts_normalize_phone ON public.contacts;
CREATE TRIGGER trg_contacts_normalize_phone
  BEFORE INSERT OR UPDATE OF phone ON public.contacts
  FOR EACH ROW EXECUTE FUNCTION public.contacts_set_phone_normalized();

CREATE UNIQUE INDEX IF NOT EXISTS uniq_contacts_org_phone_normalized
  ON public.contacts USING btree (organization_id, phone_normalized)
  WHERE ((phone_normalized IS NOT NULL) AND (deleted_at IS NULL));

CREATE INDEX IF NOT EXISTS idx_contacts_phone_normalized
  ON public.contacts USING btree (phone_normalized)
  WHERE (phone_normalized IS NOT NULL);
