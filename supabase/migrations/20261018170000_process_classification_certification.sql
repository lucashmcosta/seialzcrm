-- Classificação de processos — Fase 3b: certificação pós-ganho.
-- Decisão do Lucas (18/10): o vendedor DECLARA; depois do ganho o Jurídico/Triagem entrevista o cliente e CERTIFICA.
-- O servidor recalcula com as respostas certificadas e a MESMA versão de calibração da classificação.
-- Só para baixo: comissão certificada menor → faixa e comissão passam a ser as certificadas; igual ou maior → nada muda.
-- Uma certificação ativa por classificação; refazer só o Admin. API-first: a mesma RPC servirá ao Nammux
-- (evento classification.certified no nammux-webhook-ingest; ver docs/classificacao-v1/IMPLEMENTACAO.md).
-- Rollback: supabase/rollback/20261018170000_process_classification_certification_DOWN.sql

ALTER TABLE public.opportunity_commissions ADD COLUMN note text;

CREATE TABLE public.process_classification_certifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  classification_id uuid NOT NULL REFERENCES public.process_classifications(id),
  opportunity_id uuid NOT NULL,
  seller_user_id uuid NOT NULL REFERENCES public.users(id),
  calibration_version_id uuid NOT NULL REFERENCES public.classification_calibration_versions(id),
  motor_version text NOT NULL,
  input jsonb NOT NULL,                       -- respostas certificadas (Entrada canônica)
  changed_fields text[] NOT NULL DEFAULT '{}', -- caminhos da Entrada que mudaram em relação ao vendedor
  original_band text, original_commission numeric(12,2) NOT NULL,
  certified_band text, certified_commission numeric(12,2) NOT NULL,
  final_band text, final_commission numeric(12,2) NOT NULL,
  outcome text NOT NULL CHECK (outcome IN ('reduced','confirmed')),
  note text NOT NULL CHECK (length(btrim(note)) > 0),
  source text NOT NULL DEFAULT 'seialz' CHECK (source IN ('seialz','nammux')),
  certified_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  external_actor text,                        -- quem certificou no Nammux (nome/e-mail), quando source = nammux
  external_event_id text,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','superseded')),
  superseded_by_id uuid REFERENCES public.process_classification_certifications(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pcc_actor CHECK (certified_by IS NOT NULL OR external_actor IS NOT NULL),
  CONSTRAINT pcc_final_never_up CHECK (final_commission <= original_commission)
);
CREATE UNIQUE INDEX pcc_one_active ON public.process_classification_certifications(classification_id) WHERE status = 'active';
CREATE UNIQUE INDEX pcc_external_event ON public.process_classification_certifications(organization_id, external_event_id) WHERE external_event_id IS NOT NULL;
CREATE INDEX pcc_org_created_idx ON public.process_classification_certifications(organization_id, created_at DESC);

-- Números completos do cálculo certificado (chances, valores): só quem vê os números.
CREATE TABLE public.process_classification_certification_results (
  certification_id uuid PRIMARY KEY REFERENCES public.process_classification_certifications(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  result jsonb NOT NULL
);

DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['process_classification_certifications','process_classification_certification_results'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC, anon, authenticated', t);
    EXECUTE format('GRANT SELECT ON public.%I TO authenticated', t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', t);
  END LOOP;
END $$;
CREATE POLICY pcc_select ON public.process_classification_certifications FOR SELECT TO authenticated USING (
  organization_id = ANY(public.current_user_org_ids()) AND (
    public.pc_can_view_classification(organization_id, seller_user_id)
    OR public.pc_has_flag(organization_id, '{ferramentas,certificar_classificacao}')));
CREATE POLICY pccr_select ON public.process_classification_certification_results FOR SELECT TO authenticated USING (
  organization_id = ANY(public.current_user_org_ids())
  AND public.pc_has_flag(organization_id, '{administracao,ver_numeros_classificacao}'));

-- Admin de sistema recebe a chave nova.
DO $$ DECLARE d text; n text; BEGIN
  d := pg_get_functiondef('public.rbac_full_perms()'::regprocedure);
  n := replace(d, '"classificar":true,"liberar_correcao":true}', '"classificar":true,"liberar_correcao":true,"certificar_classificacao":true}');
  IF n = d THEN RAISE EXCEPTION 'F3b: rbac_full_perms trecho não encontrado'; END IF;
  EXECUTE n;
END $$;

-- ===== Gravar certificação (só service_role: edge process-classification e, no futuro, nammux-webhook-ingest) =====
-- _result = ResultadoCaso do motor com as respostas certificadas e a calibração da classificação (a edge calcula).
-- _redo: só o Admin (a edge confere); substitui a certificação ativa. O mínimo é sempre contra a classificação original.
CREATE OR REPLACE FUNCTION public.pc_record_certification(
  _org uuid, _opp uuid, _source text, _actor uuid, _external_actor text, _external_event_id text,
  _input jsonb, _changed text[], _result jsonb, _note text, _redo boolean)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  o record; c record; prev uuid; v_id uuid; v_created timestamptz; existing record;
  v_cert_comm numeric := round(COALESCE((_result->>'comissao')::numeric, 0), 2);
  v_cert_band text := _result->>'faixa';
  v_reduced boolean; v_final_band text; v_final_comm numeric;
BEGIN
  IF _external_event_id IS NOT NULL THEN
    SELECT * INTO existing FROM public.process_classification_certifications
     WHERE organization_id = _org AND external_event_id = _external_event_id;
    IF FOUND THEN
      RETURN jsonb_build_object('id', existing.id, 'outcome', existing.outcome, 'finalBand', existing.final_band,
        'finalCommission', existing.final_commission, 'replay', true);
    END IF;
  END IF;
  IF length(btrim(COALESCE(_note, ''))) = 0 THEN RAISE EXCEPTION 'pc:note_required'; END IF;

  SELECT * INTO o FROM public.opportunities WHERE id = _opp AND organization_id = _org FOR UPDATE;
  IF NOT FOUND OR o.deleted_at IS NOT NULL THEN RAISE EXCEPTION 'pc:opportunity_not_found'; END IF;
  IF o.status::text <> 'won' THEN RAISE EXCEPTION 'pc:not_won'; END IF;
  SELECT * INTO c FROM public.process_classifications WHERE opportunity_id = _opp AND status = 'active' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'pc:not_classified'; END IF;
  SELECT id INTO prev FROM public.process_classification_certifications WHERE classification_id = c.id AND status = 'active';
  IF prev IS NOT NULL AND NOT COALESCE(_redo, false) THEN RAISE EXCEPTION 'pc:already_certified'; END IF;

  -- Só para baixo: decide pela comissão (o que o vendedor recebe).
  v_reduced := v_cert_comm < c.commission;
  v_final_band := CASE WHEN v_reduced THEN v_cert_band ELSE c.band END;
  v_final_comm := CASE WHEN v_reduced THEN v_cert_comm ELSE c.commission END;

  IF prev IS NOT NULL THEN
    UPDATE public.process_classification_certifications SET status = 'superseded' WHERE id = prev;
  END IF;
  INSERT INTO public.process_classification_certifications(organization_id, classification_id, opportunity_id, seller_user_id,
      calibration_version_id, motor_version, input, changed_fields, original_band, original_commission, certified_band,
      certified_commission, final_band, final_commission, outcome, note, source, certified_by, external_actor, external_event_id)
  VALUES (_org, c.id, _opp, c.seller_user_id, c.calibration_version_id, c.motor_version, _input, COALESCE(_changed, '{}'),
      c.band, c.commission, v_cert_band, v_cert_comm, v_final_band, v_final_comm,
      CASE WHEN v_reduced THEN 'reduced' ELSE 'confirmed' END, btrim(_note), _source, _actor, _external_actor, _external_event_id)
  RETURNING id, created_at INTO v_id, v_created;
  IF prev IS NOT NULL THEN
    UPDATE public.process_classification_certifications SET superseded_by_id = v_id WHERE id = prev;
  END IF;
  INSERT INTO public.process_classification_certification_results(certification_id, organization_id, result) VALUES (v_id, _org, _result);

  -- Comissão: a ativa da classificação passa a valer o valor final (refazer pode voltar para o valor original).
  IF NOT c.in_review AND EXISTS (SELECT 1 FROM public.opportunity_commissions
      WHERE opportunity_id = _opp AND source_type = 'process_classification' AND status = 'active' AND amount <> v_final_comm) THEN
    UPDATE public.opportunity_commissions SET status = 'superseded'
     WHERE opportunity_id = _opp AND source_type = 'process_classification' AND status = 'active';
    INSERT INTO public.opportunity_commissions(organization_id, opportunity_id, user_id, amount, currency, source_type, source_id, note)
    VALUES (_org, _opp, c.seller_user_id, v_final_comm, 'BRL', 'process_classification', c.id,
            CASE WHEN v_reduced THEN 'Certificação: ' || btrim(_note) ELSE 'Certificação confirmou a classificação' END);
  END IF;

  INSERT INTO public.notifications(organization_id, user_id, type, title, body, entity_type, entity_id)
  VALUES (_org, c.seller_user_id,
          CASE WHEN v_reduced THEN 'classification_certified_reduced' ELSE 'classification_certified_confirmed' END,
          CASE WHEN v_reduced THEN 'Classificação ajustada na certificação' ELSE 'Classificação certificada' END,
          CASE WHEN v_reduced THEN 'A entrevista não confirmou todas as respostas da oportunidade "' || COALESCE(o.title, '') || '". Motivo: ' || btrim(_note)
               ELSE 'A entrevista confirmou a classificação da oportunidade "' || COALESCE(o.title, '') || '".' END,
          'opportunity', _opp);

  RETURN jsonb_build_object('id', v_id, 'outcome', CASE WHEN v_reduced THEN 'reduced' ELSE 'confirmed' END,
    'finalBand', v_final_band, 'finalCommission', v_final_comm, 'certifiedAt', v_created, 'replay', false);
END $$;
REVOKE ALL ON FUNCTION public.pc_record_certification(uuid, uuid, text, uuid, text, text, jsonb, text[], jsonb, text, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pc_record_certification(uuid, uuid, text, uuid, text, text, jsonb, text[], jsonb, text, boolean) TO service_role;
