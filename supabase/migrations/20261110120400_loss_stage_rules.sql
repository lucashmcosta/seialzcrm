-- Regra por etapa: qual detalhe é gravado quando a oportunidade para naquela etapa sem resposta.
-- Aqui ficam o cadastro, a validação e a lista de pendências; a execução automática é da integração (Lucas),
-- que lê o detalhe com loss_stage_rule_detail_v1 (devolve NULL quando a regra não deve gerar perda).
-- Etapa sem regra não gera perda automática.
-- Rollback: supabase/rollback/20261110120400_loss_stage_rules_DOWN.sql


CREATE TABLE public.opportunity_loss_stage_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  stage_id uuid NOT NULL REFERENCES public.pipeline_stages(id) ON DELETE CASCADE,
  detail_id uuid NOT NULL,
  created_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  -- sem ON DELETE: detalhe usado numa regra não é apagado (tira-se a regra antes)
  CONSTRAINT opportunity_loss_stage_rules_detail_fkey
    FOREIGN KEY (detail_id, organization_id) REFERENCES public.opportunity_loss_reason_details (id, organization_id),
  CONSTRAINT opportunity_loss_stage_rules_stage_key UNIQUE (stage_id)
);
CREATE INDEX opportunity_loss_stage_rules_org_idx ON public.opportunity_loss_stage_rules (organization_id);
CREATE INDEX opportunity_loss_stage_rules_detail_idx ON public.opportunity_loss_stage_rules (detail_id);

CREATE TRIGGER trg_touch_opportunity_loss_stage_rules
BEFORE INSERT OR UPDATE ON public.opportunity_loss_stage_rules
FOR EACH ROW EXECUTE FUNCTION public.fn_touch_loss_catalog();

-- Ao criar/alterar: etapa aberta da própria org e detalhe ativo (de motivo ativo).
CREATE OR REPLACE FUNCTION public.fn_validate_loss_stage_rule_v1()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.pipeline_stages s
    WHERE s.id = NEW.stage_id AND s.organization_id = NEW.organization_id
      AND coalesce(s.type::text, 'custom') = 'custom'
  ) THEN
    RAISE EXCEPTION 'loss_rule_stage_invalid' USING ERRCODE = '23514',
      HINT = 'A regra só vale para etapas abertas do funil da organização.';
  END IF;
  IF TG_OP = 'INSERT' OR NEW.detail_id IS DISTINCT FROM OLD.detail_id THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.opportunity_loss_reason_details d
      JOIN public.opportunity_loss_reasons r ON r.id = d.reason_id
      WHERE d.id = NEW.detail_id AND d.is_active AND r.is_active
    ) THEN
      RAISE EXCEPTION 'loss_detail_inactive' USING ERRCODE = '23514',
        HINT = 'Escolha um detalhe ativo de um motivo ativo.';
    END IF;
  END IF;
  RETURN NEW;
END $$;
REVOKE EXECUTE ON FUNCTION public.fn_validate_loss_stage_rule_v1() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER trg_validate_loss_stage_rule_v1
BEFORE INSERT OR UPDATE ON public.opportunity_loss_stage_rules
FOR EACH ROW EXECUTE FUNCTION public.fn_validate_loss_stage_rule_v1();

-- Para a execução automática: o detalhe a gravar na etapa, ou NULL se não há regra ou ela está pendente.
CREATE OR REPLACE FUNCTION public.loss_stage_rule_detail_v1(_stage_id uuid)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT d.id
  FROM public.opportunity_loss_stage_rules sr
  JOIN public.pipeline_stages s ON s.id = sr.stage_id AND coalesce(s.type::text, 'custom') = 'custom'
  JOIN public.opportunity_loss_reason_details d ON d.id = sr.detail_id AND d.is_active
  JOIN public.opportunity_loss_reasons r ON r.id = d.reason_id AND r.is_active
  WHERE sr.stage_id = _stage_id;
$$;
REVOKE ALL ON FUNCTION public.loss_stage_rule_detail_v1(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.loss_stage_rule_detail_v1(uuid) TO service_role;

-- Pendências para quem administra: regra que deixou de gerar perda.
CREATE OR REPLACE FUNCTION public.list_loss_stage_rule_issues_v1(_organization_id uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.role() <> 'service_role' AND NOT public.can_manage_loss_reasons(_organization_id) THEN
    RAISE EXCEPTION 'forbidden_manage_loss_reasons' USING ERRCODE = '42501';
  END IF;
  RETURN coalesce((
    SELECT jsonb_agg(jsonb_build_object(
      'rule_id', sr.id, 'stage_id', s.id, 'stage_name', s.name,
      'detail_id', d.id, 'detail_code', d.code, 'detail_name', d.name,
      'issue', CASE
        WHEN coalesce(s.type::text, 'custom') <> 'custom' THEN 'stage_not_open'
        WHEN NOT r.is_active THEN 'reason_inactive'
        ELSE 'detail_inactive' END
    ) ORDER BY s.order_index)
    FROM public.opportunity_loss_stage_rules sr
    JOIN public.pipeline_stages s ON s.id = sr.stage_id
    JOIN public.opportunity_loss_reason_details d ON d.id = sr.detail_id
    JOIN public.opportunity_loss_reasons r ON r.id = d.reason_id
    WHERE sr.organization_id = _organization_id
      AND (coalesce(s.type::text, 'custom') <> 'custom' OR NOT d.is_active OR NOT r.is_active)
  ), '[]'::jsonb);
END $$;
REVOKE ALL ON FUNCTION public.list_loss_stage_rule_issues_v1(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_loss_stage_rule_issues_v1(uuid) TO authenticated, service_role;

ALTER TABLE public.opportunity_loss_stage_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY opportunity_loss_stage_rules_select ON public.opportunity_loss_stage_rules
  FOR SELECT TO authenticated USING (organization_id = ANY(public.current_user_org_ids()));
CREATE POLICY opportunity_loss_stage_rules_insert ON public.opportunity_loss_stage_rules
  FOR INSERT TO authenticated WITH CHECK (public.can_manage_loss_reasons(organization_id));
CREATE POLICY opportunity_loss_stage_rules_update ON public.opportunity_loss_stage_rules
  FOR UPDATE TO authenticated
  USING (public.can_manage_loss_reasons(organization_id))
  WITH CHECK (public.can_manage_loss_reasons(organization_id));
CREATE POLICY opportunity_loss_stage_rules_delete ON public.opportunity_loss_stage_rules
  FOR DELETE TO authenticated USING (public.can_manage_loss_reasons(organization_id));

REVOKE ALL ON public.opportunity_loss_stage_rules FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.opportunity_loss_stage_rules TO authenticated;
GRANT ALL ON public.opportunity_loss_stage_rules TO service_role;

SELECT pg_notify('pgrst', 'reload schema');

