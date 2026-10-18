-- Rollback de 20261018150000_process_classification_f3.sql.
-- Remove o bloqueio de "ganha" (trigger + item no avaliador), as RPCs de correção e a configuração "exigir".
-- Pedidos de correção e notificações já gravados ficam (são histórico).
BEGIN;
DROP TRIGGER IF EXISTS trg_guard_won_requires_classification ON public.opportunities;
DROP FUNCTION IF EXISTS public.fn_guard_won_requires_classification();
DROP FUNCTION IF EXISTS public.pc_request_correction(uuid, uuid, uuid);
DROP FUNCTION IF EXISTS public.pc_decide_correction(uuid, uuid, uuid, boolean, text);
DROP FUNCTION IF EXISTS public.pc_update_settings(uuid, boolean, integer);

-- Avaliador volta ao texto da e3d1 (desfaz exatamente o que a F3 injetou).
DO $$ DECLARE d text; n text; i int; j int; BEGIN
  d := pg_get_functiondef('public.evaluate_opportunity_close_internal_v1(uuid,uuid)'::regprocedure);
  n := replace(d, ' v_pc_block boolean := false;', '');
  i := position('  -- Classificação de processos (módulo por org)' in n);
  j := position($a$  return jsonb_build_object('organization_id',_organization_id,'opportunity_id',v_op.id,$a$ in n);
  IF i > 0 AND j > i THEN n := substr(n, 1, i - 1) || substr(n, j); END IF;
  n := replace(n, $a$'can_close',(coalesce(v_policy.mode,'off')<>'enforce' or cardinality(v_missing)=0) and not v_pc_block);$a$,
                  $b$'can_close',coalesce(v_policy.mode,'off')<>'enforce' or cardinality(v_missing)=0);$b$);
  IF position('v_pc_block' in n) > 0 OR position('pc_required_for_won' in n) > 0 THEN
    RAISE EXCEPTION 'DOWN F3: não consegui remover o trecho do avaliador';
  END IF;
  EXECUTE n;
END $$;
DROP FUNCTION IF EXISTS public.pc_required_for_won(uuid);

DROP POLICY IF EXISTS pcs_select ON public.process_classification_settings;
CREATE POLICY pcs_select ON public.process_classification_settings FOR SELECT TO authenticated USING (
  organization_id = ANY(public.current_user_org_ids())
  AND public.pc_has_flag(organization_id, '{administracao,calibrar_classificacao}'));
ALTER TABLE public.process_classification_settings DROP COLUMN IF EXISTS require_classification_for_won;
COMMIT;
