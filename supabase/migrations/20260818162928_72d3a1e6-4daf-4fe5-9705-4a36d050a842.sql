-- ============================================================
-- Fase 2 — Autorização de resposta por endpoint (contrato aprovado)
--   • endpoint comercial      → qualquer usuário do Comercial da org
--   • endpoint vendor_personal→ SOMENTE communication_endpoints.assigned_user_id
--   • user_reply_endpoints NÃO participa do modelo de números pessoais
-- ============================================================

CREATE OR REPLACE FUNCTION public.fn_can_user_use_reply_endpoint(
  _organization_id uuid,
  _user_id uuid,
  _endpoint_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT
    _organization_id IS NOT NULL
    AND _user_id IS NOT NULL
    AND _endpoint_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.user_organizations uo
      WHERE uo.user_id = _user_id
        AND uo.organization_id = _organization_id
    )
    AND public.fn_is_sales_eligible_endpoint(_organization_id, _endpoint_id)
    AND EXISTS (
      SELECT 1
      FROM public.communication_endpoints ce
      WHERE ce.id = _endpoint_id
        AND ce.organization_id = _organization_id
        AND (
          lower(coalesce(ce.purpose, '')) <> 'vendor_personal'
          OR ce.assigned_user_id = _user_id
        )
    );
$function$;

-- Guard: nenhum grant manual pode existir para endpoint pessoal.
CREATE OR REPLACE FUNCTION public.fn_guard_user_reply_endpoint()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.user_organizations uo
    WHERE uo.user_id = NEW.user_id AND uo.organization_id = NEW.organization_id
  ) THEN
    RAISE EXCEPTION 'MANUAL_REPLY_ENDPOINT_CROSS_ORG: user % não pertence à org %',
      NEW.user_id, NEW.organization_id;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.communication_endpoints ce
    WHERE ce.id = NEW.endpoint_id
      AND ce.organization_id = NEW.organization_id
      AND ce.channel = 'whatsapp'
  ) THEN
    RAISE EXCEPTION 'MANUAL_REPLY_ENDPOINT_CROSS_ORG: endpoint % inválido para org % (ou não é whatsapp)',
      NEW.endpoint_id, NEW.organization_id;
  END IF;

  -- Hardening 1: endpoint de Atendimento / outra Route nunca entra aqui.
  IF NOT public.fn_is_sales_eligible_endpoint(NEW.organization_id, NEW.endpoint_id) THEN
    RAISE EXCEPTION 'MANUAL_REPLY_ENDPOINT_NOT_SALES: endpoint % não é elegível ao Comercial da org %',
      NEW.endpoint_id, NEW.organization_id;
  END IF;

  -- Fase 2: número pessoal NÃO usa grants. Autorização vem exclusivamente de
  -- communication_endpoints.assigned_user_id.
  IF EXISTS (
    SELECT 1 FROM public.communication_endpoints ce
    WHERE ce.id = NEW.endpoint_id
      AND lower(coalesce(ce.purpose, '')) = 'vendor_personal'
  ) THEN
    RAISE EXCEPTION 'REPLY_ENDPOINT_PERSONAL_FORBIDDEN: endpoint % é pessoal; grants não são aceitos (autorização é assigned_user_id)',
      NEW.endpoint_id;
  END IF;

  RETURN NEW;
END;
$function$;