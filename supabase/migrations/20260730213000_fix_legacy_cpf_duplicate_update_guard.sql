-- Existing legacy CPF duplicates must not block unrelated contact edits.
-- Duplicate validation remains mandatory on INSERT and whenever CPF changes.

CREATE OR REPLACE FUNCTION public.fn_enforce_contact_regional_identity()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_country text;
  v_duplicate uuid;
  v_cpf_changed boolean;
BEGIN
  SELECT operating_country_code INTO v_country
  FROM public.organizations
  WHERE id = NEW.organization_id;

  -- Tenants not migrated yet retain their legacy write path.
  IF v_country IS NULL THEN
    RETURN NEW;
  END IF;

  NEW.full_name := regexp_replace(
    btrim(COALESCE(NEW.full_name, '')),
    '\s+',
    ' ',
    'g'
  );
  NEW.first_name := NULLIF(
    regexp_replace(btrim(COALESCE(NEW.first_name, '')), '\s+', ' ', 'g'),
    ''
  );
  NEW.last_name := NULLIF(
    regexp_replace(btrim(COALESCE(NEW.last_name, '')), '\s+', ' ', 'g'),
    ''
  );

  IF v_country = 'US' THEN
    IF NEW.first_name IS NULL OR NEW.last_name IS NULL THEN
      RAISE EXCEPTION 'name_parts_required'
        USING ERRCODE = '23514';
    END IF;
    NEW.full_name := NEW.first_name || ' ' || NEW.last_name;
  ELSIF NEW.full_name = '' THEN
    RAISE EXCEPTION 'full_name_required'
      USING ERRCODE = '23514';
  END IF;

  IF NEW.address_country_code IS NULL THEN
    NEW.address_country_code := v_country;
  END IF;

  IF NEW.cpf IS NOT NULL AND btrim(NEW.cpf) <> '' THEN
    NEW.cpf := public.normalize_identity_digits(NEW.cpf);
    v_cpf_changed := CASE
      WHEN TG_OP = 'INSERT' THEN true
      ELSE NEW.cpf IS DISTINCT FROM public.normalize_identity_digits(OLD.cpf)
    END;
    IF NEW.cpf !~ '^[0-9]{11}$' THEN
      RAISE EXCEPTION 'invalid_cpf_format'
        USING ERRCODE = '23514';
    END IF;
    IF NOT public.is_valid_cpf(NEW.cpf) THEN
      RAISE EXCEPTION 'invalid_cpf'
        USING ERRCODE = '23514';
    END IF;
    IF v_country <> 'BR' AND v_cpf_changed THEN
      RAISE EXCEPTION 'cpf_only_available_for_br'
        USING ERRCODE = '23514';
    END IF;

    IF v_cpf_changed THEN
      -- Serialize equal CPF writes inside the tenant, closing the race between
      -- the duplicate check and the row write.
      PERFORM pg_advisory_xact_lock(
        hashtextextended(NEW.organization_id::text || ':' || NEW.cpf, 0)
      );
      SELECT c.id INTO v_duplicate
      FROM public.contacts c
      WHERE c.organization_id = NEW.organization_id
        AND c.id <> NEW.id
        AND c.deleted_at IS NULL
        AND public.normalize_identity_digits(c.cpf) = NEW.cpf
      LIMIT 1;
      IF v_duplicate IS NOT NULL THEN
        RAISE EXCEPTION 'duplicate_cpf:%', v_duplicate
          USING ERRCODE = '23505';
      END IF;
    END IF;
  ELSE
    NEW.cpf := NULL;
  END IF;

  RETURN NEW;
END;
$$;
