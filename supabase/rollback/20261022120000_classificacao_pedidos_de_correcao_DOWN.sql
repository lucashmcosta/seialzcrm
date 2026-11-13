-- Rollback de 20261022120000_classificacao_pedidos_de_correcao.sql.
-- Tira do avaliador o item do pedido de correção (e a variável) e remove a lista de pedidos. Pedidos gravados ficam.
BEGIN;
DROP FUNCTION IF EXISTS public.pc_pending_corrections(uuid);

DO $$ DECLARE d text; n text; i int; j int; BEGIN
  d := pg_get_functiondef('public.evaluate_opportunity_close_internal_v1(uuid,uuid)'::regprocedure);
  i := position(E'\n  -- Pedido de correção em aberto: decidir antes de ganhar' in d);
  j := position($a$  return jsonb_build_object('organization_id',_organization_id,'opportunity_id',v_op.id,$a$ in d);
  n := CASE WHEN i > 0 AND j > i THEN substr(d, 1, i) || substr(d, j) ELSE d END;
  n := replace(n, E'  v_pc_pedido text;\n', '');
  IF position('process_classification_correction' in n) > 0 OR position('v_pc_pedido' in n) > 0 THEN
    RAISE EXCEPTION 'DOWN pedidos de correção: não consegui remover o trecho do avaliador';
  END IF;
  EXECUTE n;
END $$;
COMMIT;
