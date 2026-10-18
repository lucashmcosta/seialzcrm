-- Rollback de 20261018150000_process_classification_f3.sql.
-- Remove a exigência no avaliador, a coluna na política de fechamento e as RPCs de correção/configuração.
-- Pedidos de correção e notificações já gravados ficam (são histórico).
BEGIN;
DROP FUNCTION IF EXISTS public.pc_request_correction(uuid, uuid, uuid);
DROP FUNCTION IF EXISTS public.pc_decide_correction(uuid, uuid, uuid, boolean, text);
DROP FUNCTION IF EXISTS public.pc_update_settings(uuid, integer);

-- Avaliador volta ao texto da e3d1 (desfaz exatamente o que a F3 injetou).
DO $$ DECLARE d text; n text; i int; j int; BEGIN
  d := pg_get_functiondef('public.evaluate_opportunity_close_internal_v1(uuid,uuid)'::regprocedure);
  i := position('  -- Classificação de processos (requisito da política' in d);
  j := position($a$  return jsonb_build_object('organization_id',_organization_id,'opportunity_id',v_op.id,$a$ in d);
  n := CASE WHEN i > 0 AND j > i THEN substr(d, 1, i - 1) || substr(d, j) ELSE d END;
  IF position('pc_required_for_won' in n) > 0 THEN
    RAISE EXCEPTION 'DOWN F3: não consegui remover o trecho do avaliador';
  END IF;
  EXECUTE n;
END $$;
DROP FUNCTION IF EXISTS public.pc_required_for_won(uuid);

DROP POLICY IF EXISTS pcs_select ON public.process_classification_settings;
CREATE POLICY pcs_select ON public.process_classification_settings FOR SELECT TO authenticated USING (
  organization_id = ANY(public.current_user_org_ids())
  AND public.pc_has_flag(organization_id, '{administracao,calibrar_classificacao}'));
ALTER TABLE public.opportunity_close_policies DROP COLUMN IF EXISTS require_process_classification;
COMMIT;
