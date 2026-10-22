-- Pedido de correção em aberto bloqueia o ganho; lista dos pedidos para quem pode liberar.
-- psql -d BANCO_DESCARTAVEL -v ON_ERROR_STOP=1 -f supabase/tests/process_classification_fixture.sql -f supabase/tests/process_classification_pedidos_correcao.sql
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
CREATE FUNCTION pg_temp.pedido(opp text) RETURNS jsonb LANGUAGE sql AS $$
  SELECT i FROM jsonb_array_elements(pg_temp.ev(opp)->'items') i WHERE i->>'code' = 'process_classification_correction'$$;
CREATE FUNCTION pg_temp.classify(opp text, k text) RETURNS jsonb LANGUAGE sql AS $$
  SELECT pc_record_classification('00000000-0000-0000-0000-0000000000c7', opp::uuid, '00000000-0000-0000-0000-0000000000b1', k,
    (SELECT id FROM classification_calibration_versions WHERE organization_id='00000000-0000-0000-0000-0000000000c7' AND status='published'),
    '1.0.0', '{}', '{"faixa":"OURO","comissao":100}')$$;
CREATE FUNCTION pg_temp.pedir(opp text) RETURNS jsonb LANGUAGE sql AS $$
  SELECT pc_request_correction('00000000-0000-0000-0000-0000000000c7', opp::uuid, '00000000-0000-0000-0000-0000000000b1')$$;
CREATE FUNCTION pg_temp.decidir(opp text, liberar boolean) RETURNS jsonb LANGUAGE sql AS $$
  SELECT pc_decide_correction('00000000-0000-0000-0000-0000000000c7', opp::uuid, '00000000-0000-0000-0000-0000000000d1', liberar, 'Conferido')$$;
CREATE FUNCTION pg_temp.lista() RETURNS jsonb LANGUAGE sql AS $$SELECT pc_pending_corrections('00000000-0000-0000-0000-0000000000c7')$$;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA pg_temp TO authenticated;

INSERT INTO users(id, full_name) VALUES ('00000000-0000-0000-0000-0000000000a1','Admin'),('00000000-0000-0000-0000-0000000000b1','Vera Vendedora'),
  ('00000000-0000-0000-0000-0000000000d1','Gestor'),('00000000-0000-0000-0000-0000000000e1','Jurídico');
INSERT INTO permission_profiles(id, organization_id, is_system, permissions_v2) VALUES
  ('00000000-0000-0000-0000-00000000aa01','00000000-0000-0000-0000-0000000000c7',true,NULL),
  ('00000000-0000-0000-0000-00000000aa02','00000000-0000-0000-0000-0000000000c7',false,'{"dados":{"classificacoes":{"ver":"meus"}},"ferramentas":{"classificar":true}}'),
  ('00000000-0000-0000-0000-00000000aa03','00000000-0000-0000-0000-0000000000c7',false,'{"dados":{"classificacoes":{"ver":"todos"}},"ferramentas":{"liberar_correcao":true}}'),
  ('00000000-0000-0000-0000-00000000aa04','00000000-0000-0000-0000-0000000000c7',false,'{"dados":{"classificacoes":{"ver":"todos"}}}');
INSERT INTO user_organizations VALUES
  ('00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000000c7',true,'00000000-0000-0000-0000-00000000aa01'),
  ('00000000-0000-0000-0000-0000000000b1','00000000-0000-0000-0000-0000000000c7',true,'00000000-0000-0000-0000-00000000aa02'),
  ('00000000-0000-0000-0000-0000000000d1','00000000-0000-0000-0000-0000000000c7',true,'00000000-0000-0000-0000-00000000aa03'),
  ('00000000-0000-0000-0000-0000000000e1','00000000-0000-0000-0000-0000000000c7',true,'00000000-0000-0000-0000-00000000aa04');
INSERT INTO pipeline_stages VALUES
  ('00000000-0000-0000-0000-00000000f001','00000000-0000-0000-0000-0000000000c7','Novo','custom'),
  ('00000000-0000-0000-0000-00000000f002','00000000-0000-0000-0000-0000000000c7','Ganho','won');
INSERT INTO opportunities(id, organization_id, contact_id, owner_user_id, status, title, pipeline_stage_id)
SELECT ('00000000-0000-0000-0000-0000000003' || lpad(n::text, 2, '0'))::uuid, '00000000-0000-0000-0000-0000000000c7',
       '00000000-0000-0000-0000-00000000cc01', '00000000-0000-0000-0000-0000000000b1', 'open', 'Caso ' || n, '00000000-0000-0000-0000-00000000f001'
  FROM generate_series(1, 5) n;
-- Política em enforce SEM "exigir classificação": o pedido em aberto bloqueia mesmo assim (é o caso que travou).
INSERT INTO opportunity_close_policies(organization_id, mode, version) VALUES ('00000000-0000-0000-0000-0000000000c7','enforce',1);
INSERT INTO organization_widgets VALUES ('00000000-0000-0000-0000-0000000000c7','process_classification',true);

-- ===== Sem pedido: nenhum item novo, ganha normalmente =====
SELECT pg_temp.classify('00000000-0000-0000-0000-000000000301', 'chave-pc-0001');
SELECT pg_temp.assert(pg_temp.pedido('00000000-0000-0000-0000-000000000301') IS NULL, 'sem pedido: sem o item');
SELECT pg_temp.assert((pg_temp.ev('00000000-0000-0000-0000-000000000301')->>'can_close')::boolean, 'sem pedido: pode fechar');

-- ===== Pedido pendente: bloqueia o ganho (enforce) =====
SELECT pg_temp.classify('00000000-0000-0000-0000-000000000302', 'chave-pc-0002');
SELECT pg_temp.pedir('00000000-0000-0000-0000-000000000302');
SELECT pg_temp.assert(pg_temp.pedido('00000000-0000-0000-0000-000000000302') @> '{"status":"missing","action":"decide_correction"}', 'pendente: item aguardando o gestor');
SELECT pg_temp.assert(pg_temp.ev('00000000-0000-0000-0000-000000000302')->'missing_codes' ? 'process_classification_correction', 'código na lista de pendências');
SELECT pg_temp.assert((pg_temp.ev('00000000-0000-0000-0000-000000000302')->>'can_close')::boolean = false, 'pendente: não pode fechar');
SELECT pg_temp.expect_error($q$UPDATE opportunities SET status = 'won' WHERE id = '00000000-0000-0000-0000-000000000302'$q$, 'closing_requirements_missing', 'pendente: status → ganha barrado');
SELECT pg_temp.expect_error($q$UPDATE opportunities SET pipeline_stage_id = '00000000-0000-0000-0000-00000000f002' WHERE id = '00000000-0000-0000-0000-000000000302'$q$, 'closing_requirements_missing', 'pendente: Kanban → etapa ganha barrado');
UPDATE opportunities SET status = 'lost' WHERE id = '00000000-0000-0000-0000-000000000305';
SELECT pg_temp.assert((SELECT status = 'lost' FROM opportunities WHERE id = '00000000-0000-0000-0000-000000000305'), 'perder não depende do pedido');

-- ===== Liberado e ainda sem a nova classificação: continua bloqueando =====
SELECT pg_temp.decidir('00000000-0000-0000-0000-000000000302', true);
SELECT pg_temp.assert(pg_temp.pedido('00000000-0000-0000-0000-000000000302') @> '{"status":"missing","action":"classify","label":"Correção liberada: refaça a classificação"}', 'liberada: pede para refazer');
SELECT pg_temp.expect_error($q$UPDATE opportunities SET status = 'won' WHERE id = '00000000-0000-0000-0000-000000000302'$q$, 'closing_requirements_missing', 'liberada sem refazer: ganho barrado');
-- refez: libera o ganho
SELECT pg_temp.classify('00000000-0000-0000-0000-000000000302', 'chave-pc-0003');
SELECT pg_temp.assert(pg_temp.pedido('00000000-0000-0000-0000-000000000302') IS NULL, 'refez: sem o item');
UPDATE opportunities SET status = 'won', pipeline_stage_id = '00000000-0000-0000-0000-00000000f002' WHERE id = '00000000-0000-0000-0000-000000000302';
SELECT pg_temp.assert((SELECT status = 'won' FROM opportunities WHERE id = '00000000-0000-0000-0000-000000000302'), 'refez: ganha');

-- ===== Recusado: não bloqueia =====
SELECT pg_temp.classify('00000000-0000-0000-0000-000000000303', 'chave-pc-0004');
SELECT pg_temp.pedir('00000000-0000-0000-0000-000000000303');
SELECT pg_temp.decidir('00000000-0000-0000-0000-000000000303', false);
SELECT pg_temp.assert(pg_temp.pedido('00000000-0000-0000-0000-000000000303') IS NULL, 'recusado: sem o item');
UPDATE opportunities SET status = 'won' WHERE id = '00000000-0000-0000-0000-000000000303';
SELECT pg_temp.assert((SELECT status = 'won' FROM opportunities WHERE id = '00000000-0000-0000-0000-000000000303'), 'recusado: ganha');

-- ===== Monitor: só avisa =====
SELECT pg_temp.classify('00000000-0000-0000-0000-000000000304', 'chave-pc-0005');
SELECT pg_temp.pedir('00000000-0000-0000-0000-000000000304');
UPDATE opportunity_close_policies SET mode = 'monitor';
SELECT pg_temp.assert(pg_temp.pedido('00000000-0000-0000-0000-000000000304') IS NOT NULL, 'monitor: mostra o item');
SELECT pg_temp.assert((pg_temp.ev('00000000-0000-0000-0000-000000000304')->>'can_close')::boolean, 'monitor: pode fechar');
UPDATE opportunity_close_policies SET mode = 'enforce';

-- ===== Widget desligado: avaliador igual ao de antes =====
UPDATE organization_widgets SET is_enabled = false;
SELECT pg_temp.assert(pg_temp.pedido('00000000-0000-0000-0000-000000000304') IS NULL, 'widget desligado: sem o item');
UPDATE organization_widgets SET is_enabled = true;

-- ===== Lista dos pedidos em aberto =====
SET LOCAL ROLE authenticated;
SELECT pg_temp.as_user('00000000-0000-0000-0000-0000000000b1');
SELECT pg_temp.expect_error($q$SELECT pg_temp.lista()$q$, 'pc:forbidden', 'vendedor não vê a lista');
SELECT pg_temp.as_user('00000000-0000-0000-0000-0000000000e1');
SELECT pg_temp.expect_error($q$SELECT pg_temp.lista()$q$, 'pc:forbidden', 'ver todas sem liberar correção: não vê a lista');
SELECT pg_temp.as_user('00000000-0000-0000-0000-0000000000d1');
SELECT pg_temp.assert(jsonb_array_length(pg_temp.lista()) = 1, 'gestor vê só o pedido em aberto (sem recusados nem refeitos)');
SELECT pg_temp.assert(pg_temp.lista()->0 @> '{"status":"pending","oportunidade":"Caso 4","vendedor":"Vera Vendedora","proprio":false}', 'linha com oportunidade e vendedor');
SELECT pg_temp.assert(NOT (pg_temp.lista()->0 ? 'faixa') AND NOT (pg_temp.lista()->0 ? 'comissao'), 'lista sem faixa nem comissão');
SELECT pg_temp.as_user('00000000-0000-0000-0000-0000000000a1');
SELECT pg_temp.assert(jsonb_array_length(pg_temp.lista()) = 1, 'Admin do sistema vê a lista');
SELECT pg_temp.as_user('00000000-0000-0000-0000-0000000000f9');
SELECT pg_temp.expect_error($q$SELECT pg_temp.lista()$q$, 'pc:forbidden', 'fora da org: não vê');
RESET ROLE;
SET LOCAL ROLE anon;
SELECT pg_temp.expect_error($q$SELECT pc_pending_corrections('00000000-0000-0000-0000-0000000000c7')$q$, '%permission denied%', 'anon não chama');
RESET ROLE;

SELECT 'process_classification_pedidos_correcao: OK' AS resultado;
ROLLBACK;
