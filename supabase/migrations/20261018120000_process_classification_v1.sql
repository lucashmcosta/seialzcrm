-- Classificação de processos v1 (módulo por tenant, widget_key 'process_classification').
-- Spec: docs/classificacao-v1/SPEC.md · Motor: packages/motor-classificacao (intocável).
-- Rollback: supabase/rollback/20261018120000_process_classification_v1_DOWN.sql
--
-- Regras de segurança (ver plano, riscos R1–R10):
--   * Navegador só LÊ (RLS). Toda escrita passa pela edge function process-classification (service_role).
--   * Números do caso (chances, valores, score) ficam em process_classification_results, que só quem tem
--     administracao.ver_numeros_classificacao lê. O gestor vê faixa, comissão e respostas.
--   * Calibração: só quem calibra/publica/vê números lê. Publicada e arquivada são imutáveis.
--   * Uma classificação ativa por oportunidade (índice único) + idempotency_key por org.

-- ===== Helpers =====
CREATE OR REPLACE FUNCTION public.org_widget_enabled(_org uuid, _key text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE((SELECT is_enabled FROM public.organization_widgets
                   WHERE organization_id = _org AND widget_key = _key), false)
$$;
REVOKE EXECUTE ON FUNCTION public.org_widget_enabled(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.org_widget_enabled(uuid, text) TO authenticated, service_role;

-- Flag booleana do RBAC v2 para o usuário atual (ex.: '{administracao,calibrar_classificacao}').
CREATE OR REPLACE FUNCTION public.pc_has_flag(_org uuid, _path text[])
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.is_org_system_admin(_org)
      OR COALESCE((public.my_perms_v2(_org) #>> _path)::boolean, false)
$$;
REVOKE EXECUTE ON FUNCTION public.pc_has_flag(uuid, text[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pc_has_flag(uuid, text[]) TO authenticated, service_role;

-- Pode ver classificações do vendedor _seller (escopo dados.classificacoes.ver: meus/equipe/todos).
CREATE OR REPLACE FUNCTION public.pc_can_view_classification(_org uuid, _seller uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT _seller = public.current_user_id()
      OR public.is_org_system_admin(_org)
      OR public.rbac_check(public.rbac_ctx(), _org, 'classificacoes', 'ver', ARRAY[_seller])
$$;
REVOKE EXECUTE ON FUNCTION public.pc_can_view_classification(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pc_can_view_classification(uuid, uuid) TO authenticated, service_role;

-- Permissões efetivas de um usuário, para a edge function (service_role). perms_v2_for_user não é exposta.
CREATE OR REPLACE FUNCTION public.pc_user_perms(_org uuid, _user uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.perms_v2_for_user(_org, _user)
$$;
REVOKE EXECUTE ON FUNCTION public.pc_user_perms(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pc_user_perms(uuid, uuid) TO service_role;

-- Admin de sistema recebe as chaves novas (rbac_full_perms é a fonte do perfil Admin).
CREATE OR REPLACE FUNCTION public.rbac_full_perms() RETURNS jsonb LANGUAGE sql IMMUTABLE SET search_path=public AS $$
  SELECT jsonb_build_object('dados', jsonb_build_object(
    'contatos', '{"ver":"todos","criar":true,"editar":"todos","excluir":"todos","exportar":"todos","atribuir":"todos","sem_responsavel":true}'::jsonb,
    'oportunidades', '{"ver":"todos","criar":true,"editar":"todos","excluir":"todos","exportar":"todos","atribuir":"todos","sem_responsavel":true}'::jsonb,
    'conversas_comerciais', '{"ver":"todos","editar":"todos","excluir":"todos","atribuir":"todos","sem_responsavel":true}'::jsonb,
    'atendimentos', '{"ver":"todos","editar":"todos","excluir":"todos","atribuir":"todos","sem_responsavel":true}'::jsonb,
    'chamadas', '{"ver":"todos","exportar":"todos"}'::jsonb,
    'tarefas', '{"ver":"todos","criar":true,"editar":"todos","excluir":"todos","atribuir":"todos"}'::jsonb,
    'classificacoes', '{"ver":"todos"}'::jsonb),
   'ferramentas', '{"tel_realizar":true,"tel_receber":true,"tel_transferir":true,"rodizio":true,"wa_enviar":true,"wa_ativa":true,"importar":true,"marketing":true,"relatorios":true,"ia":true,"classificar":true,"liberar_correcao":true}'::jsonb,
   'administracao', '{"usuarios":true,"config":true,"distribuicao":true,"config_atendimento":true,"integracoes":true,"telefonia":true,"cobranca":true,"auditoria":true,"ver_numeros_classificacao":true,"calibrar_classificacao":true,"publicar_calibracao":true}'::jsonb)
$$;

-- ===== Versões de calibração =====
CREATE TABLE public.classification_calibration_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  number integer NOT NULL CHECK (number > 0),
  status text NOT NULL CHECK (status IN ('draft','published','archived')),
  content jsonb NOT NULL CHECK (jsonb_typeof(content) = 'object'),
  motor_version text NOT NULL,
  based_on_id uuid REFERENCES public.classification_calibration_versions(id),
  note text,
  created_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  published_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  published_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ccv_org_number_uniq UNIQUE (organization_id, number),
  CONSTRAINT ccv_published_has_note CHECK (status = 'draft' OR (published_at IS NOT NULL AND length(btrim(COALESCE(note,''))) > 0))
);
CREATE UNIQUE INDEX ccv_one_published ON public.classification_calibration_versions(organization_id) WHERE status = 'published';
CREATE UNIQUE INDEX ccv_one_draft ON public.classification_calibration_versions(organization_id) WHERE status = 'draft';

-- Publicada/arquivada não muda: só publicada → arquivada (quando outra é publicada). Não apaga.
CREATE OR REPLACE FUNCTION public.fn_ccv_immutable()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.status <> 'draft' THEN RAISE EXCEPTION 'calibration_immutable' USING ERRCODE = '42501'; END IF;
    RETURN OLD;
  END IF;
  IF OLD.status <> 'draft' THEN
    IF NOT (OLD.status = 'published' AND NEW.status = 'archived'
            AND (to_jsonb(NEW) - 'status' - 'updated_at') = (to_jsonb(OLD) - 'status' - 'updated_at')) THEN
      RAISE EXCEPTION 'calibration_immutable' USING ERRCODE = '42501';
    END IF;
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END $$;
CREATE TRIGGER trg_ccv_immutable BEFORE UPDATE OR DELETE ON public.classification_calibration_versions
  FOR EACH ROW EXECUTE FUNCTION public.fn_ccv_immutable();

-- ===== Configuração do módulo por tenant =====
CREATE TABLE public.process_classification_settings (
  organization_id uuid PRIMARY KEY REFERENCES public.organizations(id) ON DELETE CASCADE,
  daily_limit_per_seller integer CHECK (daily_limit_per_seller IS NULL OR daily_limit_per_seller > 0), -- NULL = sem limite
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ===== Classificações =====
-- opportunity_id sem FK de propósito: a classificação é registro de auditoria/comissão e não pode sumir
-- com a oportunidade. Ao excluir a oportunidade, a classificação ativa vira 'voided' (trigger abaixo).
CREATE TABLE public.process_classifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  opportunity_id uuid NOT NULL,
  seller_user_id uuid NOT NULL REFERENCES public.users(id),
  calibration_version_id uuid NOT NULL REFERENCES public.classification_calibration_versions(id),
  motor_version text NOT NULL,
  input jsonb NOT NULL,                 -- Entrada canônica, exatamente como foi calculada
  band text CHECK (band IN ('PRATA','OURO','TITANIO','DIAMANTE')),
  commission numeric(12,2) NOT NULL CHECK (commission >= 0),
  in_review boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','superseded','voided')),
  replaces_id uuid REFERENCES public.process_classifications(id),
  replaced_by_id uuid REFERENCES public.process_classifications(id),
  released_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  voided_at timestamptz,
  voided_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  voided_reason text,
  idempotency_key text NOT NULL CHECK (length(idempotency_key) BETWEEN 8 AND 100),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pc_org_idem_uniq UNIQUE (organization_id, idempotency_key)
);
CREATE UNIQUE INDEX pc_one_active_per_opportunity ON public.process_classifications(opportunity_id) WHERE status = 'active';
CREATE INDEX pc_org_created_idx ON public.process_classifications(organization_id, created_at DESC);
CREATE INDEX pc_seller_created_idx ON public.process_classifications(seller_user_id, created_at DESC);

-- Números do caso (só jurídico/admin).
CREATE TABLE public.process_classification_results (
  classification_id uuid PRIMARY KEY REFERENCES public.process_classifications(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  result jsonb NOT NULL,                -- ResultadoCaso completo
  score numeric,
  gross_total numeric,
  expected_total numeric,
  composite_value numeric,
  band_by_value text
);

-- ===== Pedidos de correção =====
CREATE TABLE public.classification_correction_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  classification_id uuid NOT NULL REFERENCES public.process_classifications(id),
  seller_user_id uuid NOT NULL REFERENCES public.users(id),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','released','refused')),
  decided_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  decided_at timestamptz,
  reason text,
  replacement_id uuid REFERENCES public.process_classifications(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ccr_refused_has_reason CHECK (status <> 'refused' OR length(btrim(COALESCE(reason,''))) > 0)
);
CREATE UNIQUE INDEX ccr_one_pending ON public.classification_correction_requests(classification_id) WHERE status = 'pending';
CREATE UNIQUE INDEX ccr_one_open_release ON public.classification_correction_requests(classification_id)
  WHERE status = 'released' AND replacement_id IS NULL;

-- ===== Desfecho (preparo da jurimetria; cadastro fica para a v2) =====
CREATE TABLE public.classification_outcomes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  opportunity_id uuid NOT NULL,
  cnj_number text,
  thesis text NOT NULL,
  result text NOT NULL CHECK (result IN ('procedente','parcial','improcedente','acordo')),
  amount numeric(14,2),
  decided_on date,
  source text,
  created_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX co_org_opp_idx ON public.classification_outcomes(organization_id, opportunity_id);

-- ===== Comissões (módulo agnóstico: a classificação é só uma das fontes) =====
CREATE TABLE public.opportunity_commissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  opportunity_id uuid NOT NULL,
  user_id uuid NOT NULL REFERENCES public.users(id),
  amount numeric(12,2) NOT NULL CHECK (amount >= 0),
  currency text NOT NULL DEFAULT 'BRL',
  source_type text NOT NULL CHECK (source_type ~ '^[a-z][a-z0-9_]{1,63}$'),
  source_id uuid,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','superseded','cancelled')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX oc_one_active_per_source ON public.opportunity_commissions(opportunity_id, source_type) WHERE status = 'active';
CREATE INDEX oc_org_user_idx ON public.opportunity_commissions(organization_id, user_id, created_at DESC);
CREATE TRIGGER trg_opportunity_commissions_updated_at BEFORE UPDATE ON public.opportunity_commissions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ===== Grants + RLS: navegador só lê; escrita só service_role =====
DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['classification_calibration_versions','process_classification_settings','process_classifications',
    'process_classification_results','classification_correction_requests','classification_outcomes','opportunity_commissions'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC, anon, authenticated', t);
    EXECUTE format('GRANT SELECT ON public.%I TO authenticated', t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', t);
  END LOOP;
END $$;

CREATE POLICY ccv_select ON public.classification_calibration_versions FOR SELECT TO authenticated USING (
  organization_id = ANY(public.current_user_org_ids()) AND (
    public.pc_has_flag(organization_id, '{administracao,calibrar_classificacao}')
    OR public.pc_has_flag(organization_id, '{administracao,publicar_calibracao}')
    OR public.pc_has_flag(organization_id, '{administracao,ver_numeros_classificacao}')));

CREATE POLICY pcs_select ON public.process_classification_settings FOR SELECT TO authenticated USING (
  organization_id = ANY(public.current_user_org_ids())
  AND public.pc_has_flag(organization_id, '{administracao,calibrar_classificacao}'));

CREATE POLICY pc_select ON public.process_classifications FOR SELECT TO authenticated USING (
  organization_id = ANY(public.current_user_org_ids())
  AND public.pc_can_view_classification(organization_id, seller_user_id));

CREATE POLICY pcr_select ON public.process_classification_results FOR SELECT TO authenticated USING (
  organization_id = ANY(public.current_user_org_ids())
  AND public.pc_has_flag(organization_id, '{administracao,ver_numeros_classificacao}'));

CREATE POLICY ccr_select ON public.classification_correction_requests FOR SELECT TO authenticated USING (
  organization_id = ANY(public.current_user_org_ids()) AND (
    public.pc_has_flag(organization_id, '{ferramentas,liberar_correcao}')
    OR public.pc_can_view_classification(organization_id, seller_user_id)));

CREATE POLICY co_select ON public.classification_outcomes FOR SELECT TO authenticated USING (
  organization_id = ANY(public.current_user_org_ids())
  AND public.pc_has_flag(organization_id, '{administracao,ver_numeros_classificacao}'));

-- Cada fonte de comissão define quem vê as comissões dos outros; a própria pessoa sempre vê as suas.
CREATE POLICY oc_select ON public.opportunity_commissions FOR SELECT TO authenticated USING (
  organization_id = ANY(public.current_user_org_ids()) AND (
    user_id = public.current_user_id()
    OR public.is_org_system_admin(organization_id)
    OR (source_type = 'process_classification' AND public.pc_can_view_classification(organization_id, user_id))));

-- ===== Oportunidade excluída → classificação anulada (nunca apagada) =====
CREATE OR REPLACE FUNCTION public.fn_pc_void_on_opportunity_delete()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_opp uuid := COALESCE(NEW.id, OLD.id);
BEGIN
  IF TG_OP = 'UPDATE' AND NOT (OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL) THEN RETURN NEW; END IF;
  WITH v AS (
    UPDATE public.process_classifications
       SET status = 'voided', voided_at = now(), voided_by = public.current_user_id(), voided_reason = 'opportunity_deleted'
     WHERE opportunity_id = v_opp AND status = 'active'
     RETURNING id)
  UPDATE public.opportunity_commissions SET status = 'cancelled'
   WHERE source_type = 'process_classification' AND status = 'active' AND source_id IN (SELECT id FROM v);
  UPDATE public.classification_correction_requests
     SET status = 'refused', decided_at = now(), reason = 'Oportunidade excluída'
   WHERE status = 'pending' AND classification_id IN
         (SELECT id FROM public.process_classifications WHERE opportunity_id = v_opp);
  RETURN COALESCE(NEW, OLD);
END $$;
REVOKE ALL ON FUNCTION public.fn_pc_void_on_opportunity_delete() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER trg_pc_void_on_soft_delete AFTER UPDATE OF deleted_at ON public.opportunities
  FOR EACH ROW EXECUTE FUNCTION public.fn_pc_void_on_opportunity_delete();
CREATE TRIGGER trg_pc_void_on_delete BEFORE DELETE ON public.opportunities
  FOR EACH ROW EXECUTE FUNCTION public.fn_pc_void_on_opportunity_delete();

-- ===== Gravar classificação (só service_role; chamada pela edge depois do motor) =====
-- Trava a oportunidade (FOR UPDATE): duas abas/dois cliques ficam em fila. Mesma idempotency_key devolve o
-- resultado já gravado; outra chave com classificação ativa e sem correção liberada é recusada.
CREATE OR REPLACE FUNCTION public.pc_record_classification(
  _org uuid, _opp uuid, _seller uuid, _key text, _calibration_id uuid, _motor_version text, _input jsonb, _result jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  o record; c record; lim integer; v_id uuid;
  v_active uuid; v_rq uuid; v_released_by uuid;
  v_review boolean := COALESCE((_result->>'emRevisao')::boolean, false);
  v_commission numeric := round(COALESCE((_result->>'comissao')::numeric, 0), 2);
BEGIN
  SELECT * INTO o FROM public.opportunities WHERE id = _opp AND organization_id = _org FOR UPDATE;
  IF NOT FOUND OR o.deleted_at IS NOT NULL THEN RAISE EXCEPTION 'pc:opportunity_not_found'; END IF;

  SELECT * INTO c FROM public.process_classifications WHERE organization_id = _org AND idempotency_key = _key;
  IF FOUND THEN
    IF c.opportunity_id <> _opp OR c.seller_user_id <> _seller THEN RAISE EXCEPTION 'pc:idempotency_conflict'; END IF;
    RETURN jsonb_build_object('id', c.id, 'faixa', c.band, 'comissao', c.commission, 'emRevisao', c.in_review,
                              'classificadoEm', c.created_at, 'replay', true);
  END IF;

  IF o.status <> 'open' THEN RAISE EXCEPTION 'pc:opportunity_closed'; END IF;
  IF o.owner_user_id IS DISTINCT FROM _seller THEN RAISE EXCEPTION 'pc:not_owner'; END IF;
  IF o.contact_id IS NULL THEN RAISE EXCEPTION 'pc:no_contact'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.classification_calibration_versions
                 WHERE id = _calibration_id AND organization_id = _org AND status = 'published') THEN
    RAISE EXCEPTION 'pc:calibration_changed';
  END IF;

  SELECT id INTO v_active FROM public.process_classifications WHERE opportunity_id = _opp AND status = 'active';
  IF v_active IS NOT NULL THEN
    SELECT id, decided_by INTO v_rq, v_released_by FROM public.classification_correction_requests
     WHERE classification_id = v_active AND status = 'released' AND replacement_id IS NULL FOR UPDATE;
    IF v_rq IS NULL THEN RAISE EXCEPTION 'pc:already_classified'; END IF;
  END IF;

  SELECT daily_limit_per_seller INTO lim FROM public.process_classification_settings WHERE organization_id = _org;
  IF lim IS NOT NULL AND (SELECT count(*) FROM public.process_classifications
                          WHERE organization_id = _org AND seller_user_id = _seller
                            AND created_at > now() - interval '24 hours') >= lim THEN
    RAISE EXCEPTION 'pc:daily_limit';
  END IF;

  IF v_active IS NOT NULL THEN
    UPDATE public.process_classifications SET status = 'superseded' WHERE id = v_active;
    UPDATE public.opportunity_commissions SET status = 'superseded'
     WHERE source_type = 'process_classification' AND source_id = v_active AND status = 'active';
  END IF;

  INSERT INTO public.process_classifications(organization_id, opportunity_id, seller_user_id, calibration_version_id,
      motor_version, input, band, commission, in_review, replaces_id, released_by, idempotency_key)
  VALUES (_org, _opp, _seller, _calibration_id, _motor_version, _input, _result->>'faixa', v_commission, v_review,
      v_active, v_released_by, _key)
  RETURNING * INTO c;
  v_id := c.id;

  INSERT INTO public.process_classification_results(classification_id, organization_id, result, score, gross_total,
      expected_total, composite_value, band_by_value)
  VALUES (v_id, _org, _result, (_result->>'score')::numeric, (_result->>'brutoTotal')::numeric,
      (_result->>'esperadoTotal')::numeric, (_result->>'valorComposto')::numeric, _result->>'faixaPorValor');

  IF v_active IS NOT NULL THEN
    UPDATE public.process_classifications SET replaced_by_id = v_id WHERE id = v_active;
    UPDATE public.classification_correction_requests SET replacement_id = v_id WHERE id = v_rq;
  END IF;

  -- Em revisão: a comissão é definida depois da revisão do jurídico (não entra no módulo de comissão ainda).
  IF NOT v_review THEN
    INSERT INTO public.opportunity_commissions(organization_id, opportunity_id, user_id, amount, currency, source_type, source_id)
    VALUES (_org, _opp, _seller, v_commission, 'BRL', 'process_classification', v_id);
  END IF;

  RETURN jsonb_build_object('id', v_id, 'faixa', c.band, 'comissao', c.commission, 'emRevisao', c.in_review,
                            'classificadoEm', c.created_at, 'replay', false);
END $$;
REVOKE ALL ON FUNCTION public.pc_record_classification(uuid, uuid, uuid, text, uuid, text, jsonb, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pc_record_classification(uuid, uuid, uuid, text, uuid, text, jsonb, jsonb) TO service_role;

-- ===== Seed: Central Trabalhista recebe v1 (semente, arquivada) e v2 (export validado, publicada) =====
-- JSONs gerados com o próprio pacote: v1 = CALIBRACAO_V1; v2 = mesclarCalibracao(export 16/10, CALIBRACAO_V1)
-- (0 ignorados; conferirCalibracao vazio nas duas). O módulo NÃO é ligado aqui (organization_widgets).
DO $$
DECLARE v_org uuid; v1 uuid;
BEGIN
  SELECT id INTO v_org FROM public.organizations WHERE name = 'Central Trabalhista' LIMIT 1;
  IF v_org IS NULL THEN RAISE NOTICE 'Central Trabalhista não encontrada: seed pulado'; RETURN; END IF;
  IF EXISTS (SELECT 1 FROM public.classification_calibration_versions WHERE organization_id = v_org) THEN RETURN; END IF;

  INSERT INTO public.classification_calibration_versions(organization_id, number, status, content, motor_version, note, published_at)
  VALUES (v_org, 1, 'published', '{"_versao":2,"_motor":"1.0.0","horas_extras":{"probs":{"forte_sem_ponto":85,"forte_sem_ponto_test":95,"sem_ponto_peq":22,"sem_ponto_peq_test":75,"ponto_real_nao_pagou":90,"fraude_sem_test":12,"fraude_com_test":78,"externo_sem_test":10,"externo_test":70}},"intrajornada":{"probs":{"pre_sem_test":12,"pre_test":78,"ponto_real_suprimido":90,"interno_sem_reg_test":80,"interno_sem_reg":65,"peq_sem_reg_test":75,"peq_sem_reg":22,"externo_test":70,"externo_sem_test":10}},"noturno":{"probs":{"ponto_real":90,"grande_sem_ponto":80,"grande_sem_ponto_test":92,"peq_sem_ponto":20,"peq_sem_ponto_test":72,"fraude_sem_test":12,"fraude_com_test":75,"externo_sem_test":15,"externo_test":68,"pagou_a_menor":78}},"insalubridade":{"probs":{"reforco_test":6,"ja_recebe":78,"agravante":5},"agentes":{"biologico":{"grau":0.4,"prob":65,"prob_epi":50},"frio":{"grau":0.2,"prob":65,"prob_epi":35},"calor":{"grau":0.2,"prob":50,"prob_epi":45},"quimico":{"grau":0.2,"prob":50,"prob_epi":25},"umidade":{"grau":0.2,"prob":55,"prob_epi":25},"ruido":{"grau":0.2,"prob":45,"prob_epi":15,"prob_fora":10},"poeira":{"grau":0.2,"prob":45,"prob_epi":15,"prob_fora":5}}},"periculosidade":{"probs":{"reforco_test":6,"enquadra_claro":72,"enquadra_duvidoso":50,"ja_recebe":80}},"verbas_rescisorias":{"probs":{"documental":92,"multa477_guias":70,"ri_doc":85,"ri_verbas":60,"ri_conduta":20,"ri_conduta_test":70,"ri_reforco_test":5,"vinc_admite":75,"vinc_admite_test":85,"vinc_nega_nada":10,"vinc_nega_doc":60,"vinc_nega_test":70,"vinc_nega_doc_test":85,"jc_sem_prova":70,"jc_sem_prova_test":82,"jc_com_prova":20,"jc_com_prova_test":40}},"fgts":{"probs":{"com_extrato":92,"sem_extrato":70}},"equiparacao":{"probs":{"paradigma_test":65,"paradigma_sem_test":40,"sem_paradigma":12}},"por_fora":{"probs":{"pix":85,"recibo":75,"dinheiro_test":60,"dinheiro_sem":15}},"acidente":{"probs":{"dm_culpa":70,"dm_risco":75,"dm_sem_culpa":35,"dm_trajeto":10,"dm_trajeto_transp":60,"sem_doc":25,"reforco_test":8,"estab_b91":88,"estab_b31":65,"estab_pedido":55,"estab_pedido_sind":10,"materiais":40},"valores":{"dm_leve":20000,"dm_medio":30000,"dm_grave":50000,"materiais_sal":12}},"doenca":{"probs":{"dm_b91":70,"dm_laudo":50,"dm_sem_laudo":20,"degenerativa":25,"reforco_test":6,"estab_b91":85,"estab_nexo_t125":50,"estab_sem_laudo":15,"estab_pedido":55,"estab_pedido_sind":10,"materiais":35},"valores":{"dm_leve":20000,"dm_medio":30000,"dm_grave":50000,"materiais_sal":12}},"gestante":{"probs":{"dispensa":90,"temporaria_2026":55,"pedido_sem_sind":80,"pedido_com_sind":10,"pedido_com_sind_test":30,"sem_exame":30,"dm":40},"valores":{"dm":10000}},"dano_moral":{"probs":{"reforco_doc_test":10},"situacoes":{"assedio":{"valor":20000,"prob":60},"sexual":{"valor":25000,"prob":55},"sem_banheiro":{"valor":15000,"prob":65},"restricao_banheiro":{"valor":10000,"prob":55},"refeicao":{"valor":18000,"prob":60},"degradante":{"valor":18000,"prob":60},"atraso":{"valor":10000,"prob":75},"jc_improbidade":{"valor":10000,"prob":55},"informalidade":{"valor":15000,"prob":60}}},"_faixas":{"limites":[40000,90000,200000],"comissao":[50,110,180,300],"peso_tamanho":40,"base_faixa":"composto","score_faixas":[{"score":"0–9%","mover_faixa":0,"pct_comissao":100},{"score":"10–19%","mover_faixa":0,"pct_comissao":100},{"score":"20–29%","mover_faixa":0,"pct_comissao":100},{"score":"30–39%","mover_faixa":0,"pct_comissao":100},{"score":"40–49%","mover_faixa":0,"pct_comissao":100},{"score":"50–59%","mover_faixa":0,"pct_comissao":100},{"score":"60–69%","mover_faixa":0,"pct_comissao":100},{"score":"70–79%","mover_faixa":0,"pct_comissao":100},{"score":"80–89%","mover_faixa":0,"pct_comissao":100},{"score":"90–100%","mover_faixa":0,"pct_comissao":100}]},"_pesos_tese":{"horas_extras":1,"intrajornada":1,"noturno":1,"insalubridade":1,"periculosidade":1,"verbas_rescisorias":1,"fgts":1,"equiparacao":1,"por_fora":1,"acidente":1,"doenca":1,"gestante":1,"dano_moral":1},"_geral":{"selo_forte":65,"selo_media":40,"sm":1621,"reflexo":1.37}}'::jsonb, '1.0.0', 'Semente do pacote (calibracao-v1.json)', now() - interval '1 second')
  RETURNING id INTO v1;
  UPDATE public.classification_calibration_versions SET status = 'archived' WHERE id = v1;
  INSERT INTO public.classification_calibration_versions(organization_id, number, status, content, motor_version, based_on_id, note, published_at)
  VALUES (v_org, 2, 'published', '{"_versao":2,"_motor":"1.0.0","horas_extras":{"probs":{"forte_sem_ponto":85,"forte_sem_ponto_test":95,"sem_ponto_peq":22,"sem_ponto_peq_test":75,"ponto_real_nao_pagou":90,"fraude_sem_test":12,"fraude_com_test":78,"externo_sem_test":10,"externo_test":70}},"intrajornada":{"probs":{"pre_sem_test":12,"pre_test":78,"ponto_real_suprimido":90,"interno_sem_reg_test":80,"interno_sem_reg":65,"peq_sem_reg_test":75,"peq_sem_reg":22,"externo_test":70,"externo_sem_test":10}},"noturno":{"probs":{"ponto_real":90,"grande_sem_ponto":80,"grande_sem_ponto_test":92,"peq_sem_ponto":20,"peq_sem_ponto_test":72,"fraude_sem_test":12,"fraude_com_test":75,"externo_sem_test":15,"externo_test":68,"pagou_a_menor":78}},"insalubridade":{"probs":{"reforco_test":6,"ja_recebe":78,"agravante":5},"agentes":{"biologico":{"grau":0.4,"prob":65,"prob_epi":50},"frio":{"grau":0.2,"prob":65,"prob_epi":35},"calor":{"grau":0.2,"prob":50,"prob_epi":45},"quimico":{"grau":0.2,"prob":50,"prob_epi":25},"umidade":{"grau":0.2,"prob":55,"prob_epi":25},"ruido":{"grau":0.2,"prob":45,"prob_epi":15,"prob_fora":10},"poeira":{"grau":0.2,"prob":45,"prob_epi":15,"prob_fora":5}}},"periculosidade":{"probs":{"reforco_test":6,"enquadra_claro":72,"enquadra_duvidoso":50,"ja_recebe":80}},"verbas_rescisorias":{"probs":{"documental":92,"multa477_guias":70,"ri_doc":85,"ri_verbas":60,"ri_conduta":20,"ri_conduta_test":70,"ri_reforco_test":5,"vinc_admite":75,"vinc_admite_test":85,"vinc_nega_nada":10,"vinc_nega_doc":60,"vinc_nega_test":70,"vinc_nega_doc_test":85,"jc_sem_prova":70,"jc_sem_prova_test":82,"jc_com_prova":20,"jc_com_prova_test":40}},"fgts":{"probs":{"com_extrato":92,"sem_extrato":70}},"equiparacao":{"probs":{"paradigma_test":65,"paradigma_sem_test":40,"sem_paradigma":12}},"por_fora":{"probs":{"pix":85,"recibo":75,"dinheiro_test":60,"dinheiro_sem":15}},"acidente":{"probs":{"dm_culpa":50,"dm_risco":75,"dm_sem_culpa":35,"dm_trajeto":20,"dm_trajeto_transp":40,"sem_doc":25,"reforco_test":15,"estab_b91":88,"estab_b31":65,"estab_pedido":55,"estab_pedido_sind":10,"materiais":10},"valores":{"dm_leve":10000,"dm_medio":15000,"dm_grave":30000,"materiais_sal":4}},"doenca":{"probs":{"dm_b91":70,"dm_laudo":30,"dm_sem_laudo":5,"degenerativa":15,"reforco_test":15,"estab_b91":85,"estab_nexo_t125":50,"estab_sem_laudo":15,"estab_pedido":25,"estab_pedido_sind":10,"materiais":25},"valores":{"dm_leve":10000,"dm_medio":15000,"dm_grave":30000,"materiais_sal":6}},"gestante":{"probs":{"dispensa":95,"temporaria_2026":55,"pedido_sem_sind":90,"pedido_com_sind":5,"pedido_com_sind_test":30,"sem_exame":30,"dm":30},"valores":{"dm":5000}},"dano_moral":{"probs":{"reforco_doc_test":10},"situacoes":{"assedio":{"valor":20000,"prob":60},"sexual":{"valor":25000,"prob":55},"sem_banheiro":{"valor":15000,"prob":65},"restricao_banheiro":{"valor":10000,"prob":55},"refeicao":{"valor":18000,"prob":60},"degradante":{"valor":18000,"prob":60},"atraso":{"valor":10000,"prob":75},"jc_improbidade":{"valor":10000,"prob":55},"informalidade":{"valor":15000,"prob":60}}},"_faixas":{"limites":[30000,90000,200000],"comissao":[50,100,200,300],"peso_tamanho":50,"base_faixa":"composto","score_faixas":[{"score":"0–9%","mover_faixa":0,"pct_comissao":100},{"score":"10–19%","mover_faixa":0,"pct_comissao":100},{"score":"20–29%","mover_faixa":0,"pct_comissao":100},{"score":"30–39%","mover_faixa":0,"pct_comissao":100},{"score":"40–49%","mover_faixa":0,"pct_comissao":100},{"score":"50–59%","mover_faixa":0,"pct_comissao":125},{"score":"60–69%","mover_faixa":0,"pct_comissao":150},{"score":"70–79%","mover_faixa":0,"pct_comissao":175},{"score":"80–89%","mover_faixa":0,"pct_comissao":200},{"score":"90–100%","mover_faixa":0,"pct_comissao":250}]},"_pesos_tese":{"horas_extras":1,"intrajornada":1,"noturno":1,"insalubridade":1,"periculosidade":1,"verbas_rescisorias":1.5,"fgts":1.5,"equiparacao":1,"por_fora":1,"acidente":1.25,"doenca":1,"gestante":1.5,"dano_moral":1},"_geral":{"selo_forte":65,"selo_media":40,"sm":1621,"reflexo":1.37}}'::jsonb, '1.0.0', v1, 'calibração validada com o Renan', now());
  INSERT INTO public.process_classification_settings(organization_id) VALUES (v_org) ON CONFLICT DO NOTHING;
END $$;
