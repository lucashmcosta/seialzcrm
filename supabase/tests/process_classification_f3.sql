-- Fase 3: bloqueio de "ganha", configurações do widget e pedidos de correção.
-- psql -d BANCO_DESCARTAVEL -v ON_ERROR_STOP=1 -f supabase/tests/process_classification_fixture.sql -f supabase/tests/process_classification_f3.sql
BEGIN;
CREATE FUNCTION pg_temp.assert(ok boolean, message text) RETURNS void LANGUAGE plpgsql AS $$BEGIN IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'FAIL: %',message; END IF; END$$;
CREATE FUNCTION pg_temp.expect_error(q text, pattern text, message text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  BEGIN EXECUTE q; EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE pattern THEN RETURN; END IF;
    RAISE EXCEPTION 'FAIL: % (erro inesperado: %)', message, SQLERRM;
  END;
  RAISE EXCEPTION 'FAIL: % (não deu erro)', message;
END$$;
CREATE FUNCTION pg_temp.as_user(u text) RETURNS text LANGUAGE sql AS $$SELECT set_config('test.user_id', u, true)$$;
CREATE FUNCTION pg_temp.ev(opp text) RETURNS jsonb LANGUAGE sql AS $$
  SELECT evaluate_opportunity_close_internal_v1('00000000-0000-0000-0000-0000000000c7', opp::uuid)$$;
CREATE FUNCTION pg_temp.item(opp text) RETURNS text LANGUAGE sql AS $$
  SELECT i->>'status' FROM jsonb_array_elements(pg_temp.ev(opp)->'items') i WHERE i->>'code' = 'process_classification'$$;
CREATE FUNCTION pg_temp.classify(opp text, k text) RETURNS jsonb LANGUAGE sql AS $$
  SELECT pc_record_classification('00000000-0000-0000-0000-0000000000c7', opp::uuid, '00000000-0000-0000-0000-0000000000b1', k,
    (SELECT id FROM classification_calibration_versions WHERE organization_id='00000000-0000-0000-0000-0000000000c7' AND status='published'),
    '1.0.0', '{}', '{"faixa":"OURO","comissao":100}')$$;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA pg_temp TO authenticated;

INSERT INTO users(id, full_name) VALUES ('00000000-0000-0000-0000-0000000000a1','Admin'),('00000000-0000-0000-0000-0000000000b1','Vera Vendedora'),
  ('00000000-0000-0000-0000-0000000000b2','Outro Vendedor'),('00000000-0000-0000-0000-0000000000d1','Gestor');
INSERT INTO permission_profiles(id, organization_id, is_system, permissions_v2) VALUES
  ('00000000-0000-0000-0000-00000000aa01','00000000-0000-0000-0000-0000000000c7',true,NULL),
  ('00000000-0000-0000-0000-00000000aa02','00000000-0000-0000-0000-0000000000c7',false,'{"dados":{"classificacoes":{"ver":"meus"}},"ferramentas":{"classificar":true}}'),
  ('00000000-0000-0000-0000-00000000aa03','00000000-0000-0000-0000-0000000000c7',false,'{"dados":{"classificacoes":{"ver":"todos"}},"ferramentas":{"liberar_correcao":true}}');
INSERT INTO user_organizations VALUES
  ('00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000000c7',true,'00000000-0000-0000-0000-00000000aa01'),
  ('00000000-0000-0000-0000-0000000000b1','00000000-0000-0000-0000-0000000000c7',true,'00000000-0000-0000-0000-00000000aa02'),
  ('00000000-0000-0000-0000-0000000000b2','00000000-0000-0000-0000-0000000000c7',true,'00000000-0000-0000-0000-00000000aa02'),
  ('00000000-0000-0000-0000-0000000000d1','00000000-0000-0000-0000-0000000000c7',true,'00000000-0000-0000-0000-00000000aa03');
INSERT INTO pipeline_stages VALUES
  ('00000000-0000-0000-0000-00000000f001','00000000-0000-0000-0000-0000000000c7','Novo','custom'),
  ('00000000-0000-0000-0000-00000000f002','00000000-0000-0000-0000-0000000000c7','Ganho','won'),
  ('00000000-0000-0000-0000-00000000f003','00000000-0000-0000-0000-0000000000b2','Ganho','won');
INSERT INTO opportunities(id, organization_id, contact_id, owner_user_id, status, title, pipeline_stage_id)
SELECT ('00000000-0000-0000-0000-0000000002' || lpad(n::text, 2, '0'))::uuid, '00000000-0000-0000-0000-0000000000c7',
       '00000000-0000-0000-0000-00000000cc01', '00000000-0000-0000-0000-0000000000b1', 'open', 'Caso ' || n, '00000000-0000-0000-0000-00000000f001'
  FROM generate_series(1, 9) n;
INSERT INTO opportunities(id, organization_id, contact_id, owner_user_id, status, title, pipeline_stage_id) VALUES
  ('00000000-0000-0000-0000-000000000290','00000000-0000-0000-0000-0000000000b2','00000000-0000-0000-0000-00000000cc02',NULL,'open','Outra org','00000000-0000-0000-0000-00000000f003');

-- ===== Módulo desligado: nada muda =====
SELECT pg_temp.assert(NOT pc_required_for_won('00000000-0000-0000-0000-0000000000c7'), 'sem módulo não exige');
SELECT pg_temp.assert(pg_temp.item('00000000-0000-0000-0000-000000000201') IS NULL, 'avaliador sem o item com módulo desligado');
UPDATE opportunities SET status = 'won' WHERE id = '00000000-0000-0000-0000-000000000209';
SELECT pg_temp.assert((SELECT status = 'won' FROM opportunities WHERE id = '00000000-0000-0000-0000-000000000209'), 'ganha sem classificação com módulo desligado');

-- ===== Módulo ligado: bloqueia ganhar sem classificação (§5.1, §10.5) =====
INSERT INTO organization_widgets VALUES ('00000000-0000-0000-0000-0000000000c7','process_classification',true);
SELECT pg_temp.assert(pc_required_for_won('00000000-0000-0000-0000-0000000000c7'), 'módulo + exigir + calibração = exige');
SELECT pg_temp.assert(pg_temp.item('00000000-0000-0000-0000-000000000201') = 'missing', 'avaliador mostra a pendência');
SELECT pg_temp.assert((pg_temp.ev('00000000-0000-0000-0000-000000000201')->>'can_close')::boolean = false, 'sem política (off) também barra');
INSERT INTO opportunity_close_policies(organization_id, mode, version) VALUES ('00000000-0000-0000-0000-0000000000c7','monitor',1);
SELECT pg_temp.assert((pg_temp.ev('00000000-0000-0000-0000-000000000201')->>'can_close')::boolean = false, 'modo monitor também barra (R6)');
SELECT pg_temp.assert(pg_temp.ev('00000000-0000-0000-0000-000000000201')->'missing_codes' ? 'process_classification', 'código na lista de pendências');
SELECT pg_temp.expect_error($q$UPDATE opportunities SET status = 'won' WHERE id = '00000000-0000-0000-0000-000000000201'$q$, 'classification_required', 'status → ganha barrado');
SELECT pg_temp.expect_error($q$UPDATE opportunities SET pipeline_stage_id = '00000000-0000-0000-0000-00000000f002' WHERE id = '00000000-0000-0000-0000-000000000201'$q$, 'classification_required', 'Kanban → etapa ganha barrado');
SELECT set_config('app.opportunity_close_authorized', '00000000-0000-0000-0000-000000000201', true);
SELECT pg_temp.expect_error($q$UPDATE opportunities SET status = 'won' WHERE id = '00000000-0000-0000-0000-000000000201'$q$, 'classification_required', 'override de admin da RPC não passa');
SELECT set_config('app.opportunity_close_authorized', '', true);
UPDATE opportunities SET status = 'lost' WHERE id = '00000000-0000-0000-0000-000000000208';
SELECT pg_temp.assert((SELECT status = 'lost' FROM opportunities WHERE id = '00000000-0000-0000-0000-000000000208'), 'perder não exige classificação');
UPDATE opportunities SET title = 'renomeada' WHERE id = '00000000-0000-0000-0000-000000000209';
SELECT pg_temp.assert(true, 'oportunidade já ganha continua editável');
INSERT INTO opportunities(id, organization_id, owner_user_id, status, title, pipeline_stage_id) VALUES
  ('00000000-0000-0000-0000-000000000299','00000000-0000-0000-0000-0000000000c7','00000000-0000-0000-0000-0000000000b1','won','Importada','00000000-0000-0000-0000-00000000f002');
SELECT pg_temp.assert(true, 'importação já ganha não é barrada');

-- Com classificação ativa: passa
SELECT pg_temp.classify('00000000-0000-0000-0000-000000000202', 'chave-f3-0001');
SELECT pg_temp.assert(pg_temp.item('00000000-0000-0000-0000-000000000202') = 'passed', 'item passa com classificação');
UPDATE opportunities SET status = 'won', pipeline_stage_id = '00000000-0000-0000-0000-00000000f002' WHERE id = '00000000-0000-0000-0000-000000000202';
SELECT pg_temp.assert((SELECT status = 'won' FROM opportunities WHERE id = '00000000-0000-0000-0000-000000000202'), 'ganha com classificação');

-- Outra org (sem o módulo) não é afetada
UPDATE opportunities SET status = 'won' WHERE id = '00000000-0000-0000-0000-000000000290';
SELECT pg_temp.assert((SELECT status = 'won' FROM opportunities WHERE id = '00000000-0000-0000-0000-000000000290'), 'outra org ganha normalmente');

-- ===== Configurações do widget =====
SET LOCAL ROLE authenticated;
SELECT pg_temp.as_user('00000000-0000-0000-0000-0000000000b1');
SELECT pg_temp.expect_error($q$SELECT pc_update_settings('00000000-0000-0000-0000-0000000000c7', false, NULL)$q$, 'pc:forbidden', 'vendedor não muda configurações');
SELECT pg_temp.assert((SELECT count(*) FROM process_classification_settings) = 0, 'vendedor não lê configurações');
SELECT pg_temp.as_user('00000000-0000-0000-0000-0000000000a1');
SELECT pg_temp.assert((pc_update_settings('00000000-0000-0000-0000-0000000000c7', false, 5)->>'daily_limit_per_seller')::int = 5, 'admin muda configurações');
SELECT pg_temp.assert((SELECT NOT require_classification_for_won FROM process_classification_settings), 'admin lê configurações');
SELECT pg_temp.expect_error($q$SELECT pc_update_settings('00000000-0000-0000-0000-0000000000c7', true, 0)$q$, 'pc:invalid_limit', 'limite precisa ser positivo');
RESET ROLE;
SELECT pg_temp.assert(NOT pc_required_for_won('00000000-0000-0000-0000-0000000000c7'), '"exigir" = não desliga o bloqueio');
UPDATE opportunities SET status = 'won' WHERE id = '00000000-0000-0000-0000-000000000207';
SELECT pg_temp.assert((SELECT status = 'won' FROM opportunities WHERE id = '00000000-0000-0000-0000-000000000207'), 'ganha sem classificação com "exigir" = não');
UPDATE process_classification_settings SET require_classification_for_won = true, daily_limit_per_seller = NULL;

-- ===== Pedido de correção (§6) =====
SELECT pg_temp.expect_error($q$SELECT pc_request_correction('00000000-0000-0000-0000-0000000000c7','00000000-0000-0000-0000-000000000203','00000000-0000-0000-0000-0000000000b1')$q$, 'pc:not_classified', 'sem classificação não pede correção');
SELECT pg_temp.classify('00000000-0000-0000-0000-000000000203', 'chave-f3-0002');
SELECT pg_temp.expect_error($q$SELECT pc_request_correction('00000000-0000-0000-0000-0000000000c7','00000000-0000-0000-0000-000000000203','00000000-0000-0000-0000-0000000000b2')$q$, 'pc:not_owner', 'só quem classificou pede');
SELECT pg_temp.assert((pc_request_correction('00000000-0000-0000-0000-0000000000c7','00000000-0000-0000-0000-000000000203','00000000-0000-0000-0000-0000000000b1')->>'notificados')::int = 2, 'avisa quem pode liberar (gestor + Admin)');
SELECT pg_temp.assert((SELECT array_agg(user_id ORDER BY user_id) FROM notifications WHERE type = 'classification_correction_requested')
  = ARRAY['00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000000d1']::uuid[], 'vendedor não se avisa; entity = oportunidade');
SELECT pg_temp.assert((SELECT bool_and(entity_type = 'opportunity' AND entity_id = '00000000-0000-0000-0000-000000000203' AND body LIKE 'Vera Vendedora pediu%') FROM notifications), 'texto e link da notificação');
SELECT pg_temp.expect_error($q$SELECT pc_request_correction('00000000-0000-0000-0000-0000000000c7','00000000-0000-0000-0000-000000000203','00000000-0000-0000-0000-0000000000b1')$q$, 'pc:request_open', 'um pedido pendente por vez');
SELECT pg_temp.expect_error($q$SELECT pc_decide_correction('00000000-0000-0000-0000-0000000000c7','00000000-0000-0000-0000-000000000203','00000000-0000-0000-0000-0000000000b1', true, NULL)$q$, 'pc:own_request', 'ninguém libera o próprio pedido');
SELECT pg_temp.expect_error($q$SELECT pc_decide_correction('00000000-0000-0000-0000-0000000000c7','00000000-0000-0000-0000-000000000203','00000000-0000-0000-0000-0000000000d1', false, '  ')$q$, 'pc:reason_required', 'recusar exige motivo');
SELECT pc_decide_correction('00000000-0000-0000-0000-0000000000c7','00000000-0000-0000-0000-000000000203','00000000-0000-0000-0000-0000000000d1', false, 'Respostas conferidas com o cliente');
SELECT pg_temp.assert((SELECT status = 'refused' AND reason = 'Respostas conferidas com o cliente' FROM classification_correction_requests), 'recusa grava o motivo');
SELECT pg_temp.assert((SELECT body = 'Motivo: Respostas conferidas com o cliente' FROM notifications WHERE type = 'classification_correction_refused' AND user_id = '00000000-0000-0000-0000-0000000000b1'), 'vendedor é avisado da recusa');
SELECT pc_request_correction('00000000-0000-0000-0000-0000000000c7','00000000-0000-0000-0000-000000000203','00000000-0000-0000-0000-0000000000b1');
SELECT pc_decide_correction('00000000-0000-0000-0000-0000000000c7','00000000-0000-0000-0000-000000000203','00000000-0000-0000-0000-0000000000d1', true, NULL);
SELECT pg_temp.assert((SELECT count(*) = 1 FROM notifications WHERE type = 'classification_correction_released'), 'vendedor é avisado da liberação');
SELECT pg_temp.assert(pg_temp.item('00000000-0000-0000-0000-000000000203') = 'passed', 'liberada: a classificação atual continua valendo');
SELECT pg_temp.expect_error($q$SELECT pc_request_correction('00000000-0000-0000-0000-0000000000c7','00000000-0000-0000-0000-000000000203','00000000-0000-0000-0000-0000000000b1')$q$, 'pc:request_open', 'não pede de novo com liberação em aberto');
SELECT pg_temp.classify('00000000-0000-0000-0000-000000000203', 'chave-f3-0003');
SELECT pg_temp.assert((SELECT count(*) FILTER (WHERE status = 'active') = 1 AND count(*) FILTER (WHERE status = 'superseded') = 1
  FROM process_classifications WHERE opportunity_id = '00000000-0000-0000-0000-000000000203'), 'nova substitui a antiga');

-- Oportunidade fechada: nada se mexe (§6.4, §10.5)
SELECT pg_temp.classify('00000000-0000-0000-0000-000000000204', 'chave-f3-0004');
SELECT pc_request_correction('00000000-0000-0000-0000-0000000000c7','00000000-0000-0000-0000-000000000204','00000000-0000-0000-0000-0000000000b1');
UPDATE opportunities SET status = 'lost' WHERE id = '00000000-0000-0000-0000-000000000204';
SELECT pg_temp.expect_error($q$SELECT pc_decide_correction('00000000-0000-0000-0000-0000000000c7','00000000-0000-0000-0000-000000000204','00000000-0000-0000-0000-0000000000d1', true, NULL)$q$, 'pc:opportunity_closed', 'fechada: não libera');
SELECT pg_temp.expect_error($q$SELECT pc_request_correction('00000000-0000-0000-0000-0000000000c7','00000000-0000-0000-0000-000000000202','00000000-0000-0000-0000-0000000000b1')$q$, 'pc:opportunity_closed', 'fechada: não pede correção');

-- Só o servidor chama as RPCs de correção
SET LOCAL ROLE authenticated;
SELECT pg_temp.expect_error($q$SELECT pc_request_correction(NULL,NULL,NULL)$q$, '%permission denied%', 'navegador não pede correção direto');
SELECT pg_temp.expect_error($q$SELECT pc_decide_correction(NULL,NULL,NULL,NULL,NULL)$q$, '%permission denied%', 'navegador não decide direto');
RESET ROLE;

-- ===== Sem calibração publicada, o bloqueio não vale (widget ligado por engano em outra org) =====
UPDATE classification_calibration_versions SET status = 'archived' WHERE status = 'published';
SELECT pg_temp.assert(NOT pc_required_for_won('00000000-0000-0000-0000-0000000000c7'), 'sem calibração publicada não exige');
UPDATE opportunities SET status = 'won' WHERE id = '00000000-0000-0000-0000-000000000205';
SELECT pg_temp.assert((SELECT status = 'won' FROM opportunities WHERE id = '00000000-0000-0000-0000-000000000205'), 'ganha normalmente sem calibração');

SELECT 'process_classification_f3: OK' AS resultado;
ROLLBACK;
