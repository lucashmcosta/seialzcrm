-- Classificação de processos — Fase 5: relatórios e exportação (SPEC §8.4).
-- Rollback: supabase/rollback/20261018210000_process_classification_reports_DOWN.sql
-- Só para quem vê classificações de OUTRAS pessoas (escopo equipe/todos ou Admin): o vendedor vê a dele só no widget
-- (faixa e comissão), nunca o relatório (que mostra a escada de faixas, versões etc.). Dentro disso, mesma visibilidade
-- da RLS (pc_can_view_classification: equipe / todas). Números do caso (score, valores,
-- chance por tese) só com administracao.ver_numeros_classificacao. Funções SECURITY DEFINER que filtram pelo usuário
-- atual: o navegador chama direto (authenticated), sem service_role.

CREATE OR REPLACE FUNCTION public.pc_report(
  _org uuid, _from timestamptz, _to timestamptz, _seller uuid DEFAULT NULL, _band text DEFAULT NULL, _version integer DEFAULT NULL,
  _in_review boolean DEFAULT NULL, _statuses text[] DEFAULT ARRAY['active'], _limit integer DEFAULT 50, _offset integer DEFAULT 0)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_num boolean; v_out jsonb;
BEGIN
  IF NOT (_org = ANY(public.current_user_org_ids())) OR NOT public.pc_pode_ver_outros(_org) THEN
    RAISE EXCEPTION 'pc:forbidden' USING ERRCODE = '42501';
  END IF;
  v_num := public.pc_has_flag(_org, '{administracao,ver_numeros_classificacao}');
  WITH base AS (
    SELECT c.*, v.number AS calibration_number
      FROM public.process_classifications c
      JOIN public.classification_calibration_versions v ON v.id = c.calibration_version_id
     WHERE c.organization_id = _org
       AND c.created_at >= _from AND c.created_at < _to
       AND c.status = ANY(_statuses)
       AND (_seller IS NULL OR c.seller_user_id = _seller)
       AND (_band IS NULL OR c.band = _band)
       AND (_version IS NULL OR v.number = _version)
       AND (_in_review IS NULL OR c.in_review = _in_review)
       AND public.pc_can_view_classification(_org, c.seller_user_id)
  ), pagina AS (
    SELECT b.* FROM base b ORDER BY b.created_at DESC LIMIT LEAST(GREATEST(_limit, 1), 500) OFFSET GREATEST(_offset, 0)
  )
  SELECT jsonb_build_object(
    'numeros', v_num,
    'total', (SELECT count(*) FROM base),
    'comissaoTotal', (SELECT COALESCE(sum(COALESCE(cert.final_commission, b.commission)), 0) FROM base b
                       LEFT JOIN public.process_classification_certifications cert ON cert.classification_id = b.id AND cert.status = 'active'
                      WHERE b.status = 'active'),
    'porFaixa', (SELECT COALESCE(jsonb_object_agg(COALESCE(band, 'REVISAO'), n), '{}') FROM (SELECT band, count(*) n FROM base GROUP BY band) x),
    'vendedores', (SELECT COALESCE(jsonb_agg(DISTINCT jsonb_build_object('id', u.id, 'nome', u.full_name)), '[]')
                     FROM public.process_classifications c JOIN public.users u ON u.id = c.seller_user_id
                    WHERE c.organization_id = _org AND public.pc_can_view_classification(_org, c.seller_user_id)),
    'versoes', (SELECT COALESCE(jsonb_agg(DISTINCT v.number), '[]') FROM public.process_classifications c
                  JOIN public.classification_calibration_versions v ON v.id = c.calibration_version_id WHERE c.organization_id = _org),
    'linhas', COALESCE((SELECT jsonb_agg(jsonb_build_object(
        'id', p.id, 'criadoEm', p.created_at, 'oportunidadeId', p.opportunity_id,
        'oportunidade', (SELECT o.title FROM public.opportunities o WHERE o.id = p.opportunity_id),
        'vendedorId', p.seller_user_id, 'vendedor', (SELECT u.full_name FROM public.users u WHERE u.id = p.seller_user_id),
        'faixa', p.band, 'comissao', p.commission, 'emRevisao', p.in_review, 'status', p.status,
        'versao', p.calibration_number, 'motor', p.motor_version,
        'certificacao', (SELECT jsonb_build_object('resultado', cert.outcome, 'faixa', cert.final_band, 'comissao', cert.final_commission)
                           FROM public.process_classification_certifications cert WHERE cert.classification_id = p.id AND cert.status = 'active'),
        'correcoes', (SELECT count(*) FROM public.classification_correction_requests r WHERE r.classification_id = p.id),
        'score', CASE WHEN v_num THEN r.score END, 'bruto', CASE WHEN v_num THEN r.gross_total END,
        'esperado', CASE WHEN v_num THEN r.expected_total END, 'composto', CASE WHEN v_num THEN r.composite_value END
      ) ORDER BY p.created_at DESC)
      FROM pagina p LEFT JOIN public.process_classification_results r ON r.classification_id = p.id), '[]')
  ) INTO v_out;
  RETURN v_out;
END $$;

-- Detalhe de uma classificação: respostas, histórico de correções, certificação; resultado completo só com números.
CREATE OR REPLACE FUNCTION public.pc_report_detail(_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE c record; v_num boolean;
BEGIN
  SELECT * INTO c FROM public.process_classifications WHERE id = _id;
  IF NOT FOUND OR NOT (c.organization_id = ANY(public.current_user_org_ids()))
     OR NOT public.pc_pode_ver_outros(c.organization_id)
     OR NOT public.pc_can_view_classification(c.organization_id, c.seller_user_id) THEN
    RAISE EXCEPTION 'pc:not_found';
  END IF;
  v_num := public.pc_has_flag(c.organization_id, '{administracao,ver_numeros_classificacao}');
  RETURN jsonb_build_object(
    'id', c.id, 'entrada', c.input, 'faixa', c.band, 'comissao', c.commission, 'status', c.status, 'criadoEm', c.created_at,
    'resultado', CASE WHEN v_num THEN (SELECT result FROM public.process_classification_results WHERE classification_id = c.id) END,
    'correcoes', COALESCE((SELECT jsonb_agg(jsonb_build_object('status', r.status, 'criadoEm', r.created_at, 'motivo', r.reason) ORDER BY r.created_at)
                  FROM public.classification_correction_requests r WHERE r.classification_id = c.id), '[]'),
    'certificacao', (SELECT jsonb_build_object('resultado', x.outcome, 'motivo', x.note, 'certificadoEm', x.created_at, 'origem', x.source,
                        'original', jsonb_build_object('faixa', x.original_band, 'comissao', x.original_commission),
                        'final', jsonb_build_object('faixa', x.final_band, 'comissao', x.final_commission), 'mudou', x.changed_fields)
                       FROM public.process_classification_certifications x WHERE x.classification_id = c.id AND x.status = 'active'));
END $$;

-- Exportação: com números → uma linha por classificação × tese (base da jurimetria, §8.4); sem números → uma
-- linha por classificação (faixa e comissão). Limite de 10 mil classificações por exportação.
CREATE OR REPLACE FUNCTION public.pc_report_export(
  _org uuid, _from timestamptz, _to timestamptz, _seller uuid DEFAULT NULL, _band text DEFAULT NULL, _version integer DEFAULT NULL,
  _in_review boolean DEFAULT NULL, _statuses text[] DEFAULT ARRAY['active'])
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_num boolean;
BEGIN
  IF NOT (_org = ANY(public.current_user_org_ids())) OR NOT public.pc_pode_ver_outros(_org) THEN
    RAISE EXCEPTION 'pc:forbidden' USING ERRCODE = '42501';
  END IF;
  v_num := public.pc_has_flag(_org, '{administracao,ver_numeros_classificacao}');
  RETURN jsonb_build_object('numeros', v_num, 'linhas', COALESCE((
    WITH base AS (
      SELECT c.*, v.number AS versao, u.full_name AS vendedor,
             cert.final_band AS faixa_cert, cert.final_commission AS comissao_cert, cert.outcome AS certificacao
        FROM public.process_classifications c
        JOIN public.classification_calibration_versions v ON v.id = c.calibration_version_id
        JOIN public.users u ON u.id = c.seller_user_id
        LEFT JOIN public.process_classification_certifications cert ON cert.classification_id = c.id AND cert.status = 'active'
       WHERE c.organization_id = _org AND c.created_at >= _from AND c.created_at < _to AND c.status = ANY(_statuses)
         AND (_seller IS NULL OR c.seller_user_id = _seller) AND (_band IS NULL OR c.band = _band)
         AND (_version IS NULL OR v.number = _version) AND (_in_review IS NULL OR c.in_review = _in_review)
         AND public.pc_can_view_classification(_org, c.seller_user_id)
       ORDER BY c.created_at DESC LIMIT 10000
    )
    SELECT jsonb_agg(l) FROM (
      SELECT jsonb_build_object(
          'classificacao_id', b.id, 'data', b.created_at, 'oportunidade_id', b.opportunity_id, 'vendedor', b.vendedor,
          'status', b.status, 'versao_calibracao', b.versao, 'versao_motor', b.motor_version,
          'faixa', b.band, 'comissao', b.commission, 'em_revisao', b.in_review,
          'certificacao', b.certificacao, 'faixa_certificada', b.faixa_cert, 'comissao_certificada', b.comissao_cert,
          'score', CASE WHEN v_num THEN r.score END,
          'tese', t->>'tese', 'chance', (t->>'prob')::numeric, 'chance_automatica', (t->>'probAuto')::numeric,
          'valor_bruto', (t->>'bruto')::numeric, 'valor_esperado', (t->>'esperado')::numeric,
          'selo', t->>'selo', 'aviso', t->>'aviso', 'excluida', (t->>'excluida')::boolean) AS l
        FROM base b
        LEFT JOIN public.process_classification_results r ON v_num AND r.classification_id = b.id
        LEFT JOIN LATERAL jsonb_array_elements(CASE WHEN v_num THEN r.result->'teses' ELSE NULL END) t ON true
    ) x), '[]'));
END $$;

DO $$ DECLARE f text; BEGIN
  FOREACH f IN ARRAY ARRAY[
    'pc_report(uuid, timestamptz, timestamptz, uuid, text, integer, boolean, text[], integer, integer)',
    'pc_report_detail(uuid)',
    'pc_report_export(uuid, timestamptz, timestamptz, uuid, text, integer, boolean, text[])'] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION public.%s FROM PUBLIC, anon', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION public.%s TO authenticated', f);
  END LOOP;
END $$;
