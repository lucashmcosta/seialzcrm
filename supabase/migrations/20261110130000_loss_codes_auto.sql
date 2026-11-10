-- Código de motivo e detalhe gerado pelo banco (some do formulário; continua visível na lista e é o que a
-- automação/API usa).
--   motivo:  letras em sequência na org — A, B, … Z, AA, AB, …
--   detalhe: código do motivo + número em sequência — A1, A2, …
-- Contadores próprios, que só sobem: código nunca é reaproveitado, nem de inativo nem de apagado.
-- Código já ocupado (ex.: cadastrado à mão antes desta migration) é pulado.
-- O código informado no INSERT é ignorado e nunca muda depois.
-- Rollback: supabase/rollback/20261110130000_loss_codes_auto_DOWN.sql

CREATE TABLE public.opportunity_loss_code_counters (
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  -- 'reason' para os motivos da org; 'detail:<reason_id>' para os detalhes de cada motivo
  scope text NOT NULL,
  last_value integer NOT NULL DEFAULT 0,
  PRIMARY KEY (organization_id, scope)
);
-- Só as funções de geração (SECURITY DEFINER) mexem aqui.
ALTER TABLE public.opportunity_loss_code_counters ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.opportunity_loss_code_counters FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.opportunity_loss_code_counters TO service_role;

-- Detalhes já cadastrados: o contador começa no maior número usado depois do código do motivo.
INSERT INTO public.opportunity_loss_code_counters (organization_id, scope, last_value)
SELECT r.organization_id, 'detail:' || r.id, max(substr(upper(d.code), length(r.code) + 1)::integer)
FROM public.opportunity_loss_reasons r
JOIN public.opportunity_loss_reason_details d ON d.reason_id = r.id
WHERE left(upper(d.code), length(r.code)) = upper(r.code)
  AND substr(upper(d.code), length(r.code) + 1) ~ '^[0-9]{1,9}$'
GROUP BY r.organization_id, r.id;

-- 1 → A, 26 → Z, 27 → AA, 28 → AB, 702 → ZZ, 703 → AAA
CREATE OR REPLACE FUNCTION public.loss_code_letters(_n integer)
RETURNS text LANGUAGE plpgsql IMMUTABLE STRICT SET search_path = public AS $$
DECLARE
  v_n integer := _n;
  v_code text := '';
BEGIN
  IF v_n < 1 THEN RAISE EXCEPTION 'loss_code_sequence_invalid' USING ERRCODE = '22023'; END IF;
  WHILE v_n > 0 LOOP
    v_n := v_n - 1;
    v_code := chr(65 + v_n % 26) || v_code;
    v_n := v_n / 26;
  END LOOP;
  RETURN v_code;
END $$;

-- Próximo valor do contador; o upsert trava a linha, então inserções simultâneas na mesma org não colidem.
CREATE OR REPLACE FUNCTION public.fn_next_loss_code_seq(_org uuid, _scope text)
RETURNS integer LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  INSERT INTO public.opportunity_loss_code_counters AS c (organization_id, scope, last_value)
  VALUES (_org, _scope, 1)
  ON CONFLICT (organization_id, scope) DO UPDATE SET last_value = c.last_value + 1
  RETURNING last_value;
$$;

CREATE OR REPLACE FUNCTION public.fn_assign_loss_reason_code()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_code text;
BEGIN
  LOOP
    v_code := public.loss_code_letters(public.fn_next_loss_code_seq(NEW.organization_id, 'reason'));
    EXIT WHEN NOT EXISTS (
      SELECT 1 FROM public.opportunity_loss_reasons
      WHERE organization_id = NEW.organization_id AND upper(code) = v_code
    );
  END LOOP;
  NEW.code := v_code;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.fn_assign_loss_detail_code()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_reason_code text;
  v_code text;
BEGIN
  SELECT upper(code) INTO v_reason_code FROM public.opportunity_loss_reasons
  WHERE id = NEW.reason_id AND organization_id = NEW.organization_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'loss_reason_not_found' USING ERRCODE = 'P0002'; END IF;
  LOOP
    v_code := v_reason_code || public.fn_next_loss_code_seq(NEW.organization_id, 'detail:' || NEW.reason_id);
    IF length(v_code) > 20 THEN RAISE EXCEPTION 'loss_code_too_long' USING ERRCODE = '22001'; END IF;
    EXIT WHEN NOT EXISTS (
      SELECT 1 FROM public.opportunity_loss_reason_details
      WHERE organization_id = NEW.organization_id AND upper(code) = v_code
    );
  END LOOP;
  NEW.code := v_code;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.fn_guard_loss_code_immutable()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF upper(NEW.code) IS DISTINCT FROM upper(OLD.code) THEN
    RAISE EXCEPTION 'loss_code_immutable' USING ERRCODE = '23514',
      HINT = 'O código é gerado automaticamente e não muda.';
  END IF;
  RETURN NEW;
END $$;

REVOKE EXECUTE ON FUNCTION public.fn_next_loss_code_seq(uuid, text), public.fn_assign_loss_reason_code(),
  public.fn_assign_loss_detail_code(), public.fn_guard_loss_code_immutable() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.loss_code_letters(integer) TO authenticated, service_role;

CREATE TRIGGER trg_assign_loss_reason_code
BEFORE INSERT ON public.opportunity_loss_reasons
FOR EACH ROW EXECUTE FUNCTION public.fn_assign_loss_reason_code();
CREATE TRIGGER trg_assign_loss_detail_code
BEFORE INSERT ON public.opportunity_loss_reason_details
FOR EACH ROW EXECUTE FUNCTION public.fn_assign_loss_detail_code();
CREATE TRIGGER trg_guard_loss_reason_code_immutable
BEFORE UPDATE OF code ON public.opportunity_loss_reasons
FOR EACH ROW EXECUTE FUNCTION public.fn_guard_loss_code_immutable();
CREATE TRIGGER trg_guard_loss_detail_code_immutable
BEFORE UPDATE OF code ON public.opportunity_loss_reason_details
FOR EACH ROW EXECUTE FUNCTION public.fn_guard_loss_code_immutable();

-- O trigger sempre preenche; o default só deixa o código opcional no INSERT (e nos tipos gerados).
ALTER TABLE public.opportunity_loss_reasons ALTER COLUMN code SET DEFAULT '';
ALTER TABLE public.opportunity_loss_reason_details ALTER COLUMN code SET DEFAULT '';

SELECT pg_notify('pgrst', 'reload schema');
