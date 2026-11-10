-- Regras gerais de perda por organização.
-- Tabela própria (e não opportunity_close_policies) porque cada UPDATE lá incrementa a versão da política de
-- ganho registrada em opportunity_close_attempts.
-- Org sem linha = padrão (motivo obrigatório: sim; detalhe: opcional). Nenhuma org precisa de backfill, e o
-- motivo obrigatório só é cobrado quando a org tem motivo ativo (ver 20261110120300).
-- Rollback: supabase/rollback/20261110120100_loss_settings_DOWN.sql


CREATE TABLE public.opportunity_loss_settings (
  organization_id uuid PRIMARY KEY REFERENCES public.organizations(id) ON DELETE CASCADE,
  reason_required boolean NOT NULL DEFAULT true,
  detail_mode text NOT NULL DEFAULT 'optional' CHECK (detail_mode IN ('off', 'optional', 'required')),
  created_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER trg_touch_opportunity_loss_settings
BEFORE INSERT OR UPDATE ON public.opportunity_loss_settings
FOR EACH ROW EXECUTE FUNCTION public.fn_touch_loss_catalog();

-- Regras efetivas (aplica o padrão quando a org não tem linha).
CREATE OR REPLACE FUNCTION public.loss_settings_internal_v1(_org uuid)
RETURNS TABLE (reason_required boolean, detail_mode text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(s.reason_required, true), COALESCE(s.detail_mode, 'optional')
  FROM (SELECT 1) one
  LEFT JOIN public.opportunity_loss_settings s ON s.organization_id = _org;
$$;
REVOKE ALL ON FUNCTION public.loss_settings_internal_v1(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.loss_settings_internal_v1(uuid) TO service_role;

ALTER TABLE public.opportunity_loss_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY opportunity_loss_settings_select ON public.opportunity_loss_settings
  FOR SELECT TO authenticated USING (organization_id = ANY(public.current_user_org_ids()));
CREATE POLICY opportunity_loss_settings_insert ON public.opportunity_loss_settings
  FOR INSERT TO authenticated WITH CHECK (public.can_manage_loss_reasons(organization_id));
CREATE POLICY opportunity_loss_settings_update ON public.opportunity_loss_settings
  FOR UPDATE TO authenticated
  USING (public.can_manage_loss_reasons(organization_id))
  WITH CHECK (public.can_manage_loss_reasons(organization_id));

REVOKE ALL ON public.opportunity_loss_settings FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE ON public.opportunity_loss_settings TO authenticated;
GRANT ALL ON public.opportunity_loss_settings TO service_role;

