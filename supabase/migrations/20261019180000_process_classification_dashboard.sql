-- Comissões no Início (widget Classificação do processo): vendas ganhas no período, separadas em
-- "prevista" (aguardando a entrevista/certificação) e "confirmada" (certificada; vale o valor final).
-- Só faixa e comissão, como no card da oportunidade: nunca score, valores ou a escada de faixas.
-- A data é a mesma do card "Ganhas" do Início (close_date, com won_at de reserva), para os números baterem.
CREATE OR REPLACE FUNCTION public.pc_dashboard_commissions(_org uuid, _from date, _to date, _seller uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_me uuid := public.current_user_id(); v_outros boolean; v_seller uuid; v_out jsonb;
BEGIN
  IF NOT (_org = ANY(public.current_user_org_ids())) OR NOT public.org_widget_enabled(_org, 'process_classification') THEN
    RETURN jsonb_build_object('visivel', false);
  END IF;
  v_outros := public.pc_pode_ver_outros(_org);
  IF NOT v_outros AND NOT public.pc_has_flag(_org, '{ferramentas,classificar}') THEN
    RETURN jsonb_build_object('visivel', false);
  END IF;
  -- Quem só vê as próprias recebe sempre as próprias, qualquer que seja o filtro de responsável.
  v_seller := CASE WHEN v_outros THEN _seller ELSE v_me END;
  WITH base AS (
    SELECT o.id AS opp_id, o.title, COALESCE(o.close_date, (o.won_at AT TIME ZONE 'America/Sao_Paulo')::date) AS ganha_em,
           (SELECT ct.full_name FROM public.contacts ct WHERE ct.id = o.contact_id) AS contato,
           (SELECT u.full_name FROM public.users u WHERE u.id = c.seller_user_id) AS vendedor,
           c.band, c.commission, cert.id IS NOT NULL AS confirmada, cert.outcome, cert.final_band, cert.final_commission, cert.note
      FROM public.process_classifications c
      JOIN public.opportunities o ON o.id = c.opportunity_id
      LEFT JOIN public.process_classification_certifications cert ON cert.classification_id = c.id AND cert.status = 'active'
     WHERE c.organization_id = _org AND c.status = 'active'
       AND o.status = 'won' AND o.deleted_at IS NULL
       AND COALESCE(o.close_date, (o.won_at AT TIME ZONE 'America/Sao_Paulo')::date) BETWEEN _from AND _to
       AND (v_seller IS NULL OR c.seller_user_id = v_seller)
       AND public.pc_can_view_classification(_org, c.seller_user_id)
  ), final AS (
    SELECT b.*, CASE WHEN b.confirmada THEN b.final_band ELSE b.band END AS faixa,
           CASE WHEN b.confirmada THEN b.final_commission ELSE b.commission END AS comissao
      FROM base b
  )
  SELECT jsonb_build_object(
    'visivel', true,
    'soMinhas', v_seller IS NOT DISTINCT FROM v_me,
    'prevista', (SELECT jsonb_build_object('total', COALESCE(sum(comissao), 0), 'quantidade', count(*)) FROM final WHERE NOT confirmada),
    'confirmada', (SELECT jsonb_build_object('total', COALESCE(sum(comissao), 0), 'quantidade', count(*)) FROM final WHERE confirmada),
    'linhas', COALESCE((SELECT jsonb_agg(jsonb_build_object(
        'oportunidadeId', f.opp_id, 'oportunidade', f.title, 'contato', f.contato, 'vendedor', f.vendedor, 'ganhaEm', f.ganha_em,
        'situacao', CASE WHEN f.confirmada THEN 'confirmada' ELSE 'prevista' END,
        'faixa', f.faixa, 'comissao', f.comissao,
        'ajuste', CASE WHEN f.outcome = 'reduced' THEN jsonb_build_object('faixa', f.band, 'comissao', f.commission, 'motivo', f.note) END
      ) ORDER BY f.ganha_em DESC, f.title)
      FROM (SELECT * FROM final ORDER BY ganha_em DESC LIMIT 500) f), '[]')
  ) INTO v_out;
  RETURN v_out;
END $$;
REVOKE EXECUTE ON FUNCTION public.pc_dashboard_commissions(uuid, date, date, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pc_dashboard_commissions(uuid, date, date, uuid) TO authenticated, service_role;
