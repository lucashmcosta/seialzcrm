-- Classificação de processos: pedido de correção em aberto bloqueia o ganho, e o gestor ganha uma lista dos pedidos.
-- Rollback: supabase/rollback/20261022120000_classificacao_pedidos_de_correcao_DOWN.sql
-- Por quê: o pedido só pode ser decidido com a oportunidade aberta (pc_decide_correction). Uma oportunidade ganha
-- com o pedido pendente deixava o pedido travado para sempre (caso real em 22/10). Agora o pedido em aberto vira um
-- item do avaliador, como os documentos: no modo enforce o ganho espera o gestor decidir; no monitor, só avisa.
-- "Em aberto" = pendente, ou liberado e ainda sem a nova classificação (a mesma regra de pc_request_correction).

-- ===== Item no avaliador de fechamento (mesmo método da F3: injeta e confere que entrou) =====
DO $$ DECLARE d text; n text; BEGIN
  d := pg_get_functiondef('public.evaluate_opportunity_close_internal_v1(uuid,uuid)'::regprocedure);
  n := replace(d, $a$    if not v_ok then v_missing := array_append(v_missing, 'process_classification'); end if;
  end if;
$a$, $b$    if not v_ok then v_missing := array_append(v_missing, 'process_classification'); end if;
  end if;

  -- Pedido de correção em aberto: decidir antes de ganhar (depois do ganho ninguém mais consegue decidir).
  if public.org_widget_enabled(_organization_id, 'process_classification') then
    select r.status into v_pc_pedido
      from public.classification_correction_requests r
      join public.process_classifications c on c.id = r.classification_id
     where c.opportunity_id = v_op.id and c.status = 'active'
       and (r.status = 'pending' or (r.status = 'released' and r.replacement_id is null))
     order by r.created_at desc limit 1;
    if v_pc_pedido is not null then
      v_items := v_items || jsonb_build_array(jsonb_build_object('code','process_classification_correction',
        'label', case when v_pc_pedido = 'pending' then 'Pedido de correção da classificação aguardando o gestor'
                      else 'Correção liberada: refaça a classificação' end,
        'status','missing', 'action', case when v_pc_pedido = 'pending' then 'decide_correction' else 'classify' end));
      v_missing := array_append(v_missing, 'process_classification_correction');
    end if;
  end if;
$b$);
  -- variável nova no DECLARE da função
  n := regexp_replace(n, '(\ndeclare\s*\n)', E'\\1  v_pc_pedido text;\n', 'i');
  IF position('process_classification_correction' in n) = 0 OR position('v_pc_pedido text;' in n) = 0 THEN
    RAISE EXCEPTION 'pedidos de correção: trecho do avaliador não encontrado';
  END IF;
  EXECUTE n;
END $$;

-- ===== Lista dos pedidos em aberto, para quem pode liberar correção =====
-- O vendedor nunca chega aqui (exige ferramentas.liberar_correcao ou o Admin do sistema). Sem faixa nem comissão:
-- a decisão é tomada no card da oportunidade, que já mostra as respostas.
CREATE OR REPLACE FUNCTION public.pc_pending_corrections(_org uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT (_org = ANY(public.current_user_org_ids())) OR NOT public.pc_has_flag(_org, '{ferramentas,liberar_correcao}') THEN
    RAISE EXCEPTION 'pc:forbidden' USING ERRCODE = '42501';
  END IF;
  RETURN COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
        'id', r.id, 'status', r.status, 'criadoEm', r.created_at,
        'oportunidadeId', o.id, 'oportunidade', o.title, 'oportunidadeStatus', o.status,
        'vendedorId', r.seller_user_id, 'vendedor', u.full_name,
        'proprio', r.seller_user_id = public.current_user_id()
      ) ORDER BY r.created_at)
      FROM public.classification_correction_requests r
      JOIN public.process_classifications c ON c.id = r.classification_id AND c.status = 'active'
      JOIN public.opportunities o ON o.id = c.opportunity_id AND o.deleted_at IS NULL
      LEFT JOIN public.users u ON u.id = r.seller_user_id
     WHERE r.organization_id = _org
       AND (r.status = 'pending' OR (r.status = 'released' AND r.replacement_id IS NULL))), '[]');
END $$;
REVOKE ALL ON FUNCTION public.pc_pending_corrections(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pc_pending_corrections(uuid) TO authenticated;
