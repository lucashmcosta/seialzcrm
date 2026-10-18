-- Run against the disposable process_classification_fixture.sql database. Transaction rolls back fixtures.
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
CREATE FUNCTION pg_temp.res(faixa text, comissao numeric, revisao boolean DEFAULT false) RETURNS jsonb LANGUAGE sql AS $$
  SELECT jsonb_build_object('faixa',faixa,'comissao',comissao,'emRevisao',revisao,'score',55,'brutoTotal',1000,'esperadoTotal',500,'valorComposto',700,'faixaPorValor',faixa)$$;
CREATE FUNCTION pg_temp.cal() RETURNS uuid LANGUAGE sql AS $$
  SELECT id FROM classification_calibration_versions WHERE organization_id='00000000-0000-0000-0000-0000000000c7' AND status='published'$$;
CREATE FUNCTION pg_temp.rec(opp text, seller text, k text, r jsonb DEFAULT NULL) RETURNS jsonb LANGUAGE sql AS $$
  SELECT pc_record_classification('00000000-0000-0000-0000-0000000000c7', opp::uuid, seller::uuid, k, pg_temp.cal(), '1.0.0',
    '{"teses":["fgts"]}', COALESCE(r, pg_temp.res('OURO',100)))$$;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA pg_temp TO authenticated;

-- Pessoas: a1 Admin (sistema) · b1/b2 vendedores · d1 gestor · e1 jurídico · f1 de outra org
INSERT INTO users(id) VALUES ('00000000-0000-0000-0000-0000000000a1'),('00000000-0000-0000-0000-0000000000b1'),('00000000-0000-0000-0000-0000000000b2'),
  ('00000000-0000-0000-0000-0000000000d1'),('00000000-0000-0000-0000-0000000000e1'),('00000000-0000-0000-0000-0000000000f1');
INSERT INTO permission_profiles(id, organization_id, is_system, permissions_v2) VALUES
  ('00000000-0000-0000-0000-00000000aa01','00000000-0000-0000-0000-0000000000c7',true,NULL),
  ('00000000-0000-0000-0000-00000000aa02','00000000-0000-0000-0000-0000000000c7',false,'{"dados":{"classificacoes":{"ver":"meus"}},"ferramentas":{"classificar":true}}'),
  ('00000000-0000-0000-0000-00000000aa03','00000000-0000-0000-0000-0000000000c7',false,'{"dados":{"classificacoes":{"ver":"todos"}},"ferramentas":{"liberar_correcao":true}}'),
  ('00000000-0000-0000-0000-00000000aa04','00000000-0000-0000-0000-0000000000c7',false,'{"dados":{"classificacoes":{"ver":"todos"}},"administracao":{"ver_numeros_classificacao":true}}'),
  ('00000000-0000-0000-0000-00000000aa05','00000000-0000-0000-0000-0000000000b2',true,NULL);
INSERT INTO user_organizations VALUES
  ('00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000000c7',true,'00000000-0000-0000-0000-00000000aa01'),
  ('00000000-0000-0000-0000-0000000000b1','00000000-0000-0000-0000-0000000000c7',true,'00000000-0000-0000-0000-00000000aa02'),
  ('00000000-0000-0000-0000-0000000000b2','00000000-0000-0000-0000-0000000000c7',true,'00000000-0000-0000-0000-00000000aa02'),
  ('00000000-0000-0000-0000-0000000000d1','00000000-0000-0000-0000-0000000000c7',true,'00000000-0000-0000-0000-00000000aa03'),
  ('00000000-0000-0000-0000-0000000000e1','00000000-0000-0000-0000-0000000000c7',true,'00000000-0000-0000-0000-00000000aa04'),
  ('00000000-0000-0000-0000-0000000000f1','00000000-0000-0000-0000-0000000000b2',true,'00000000-0000-0000-0000-00000000aa05');
INSERT INTO opportunities VALUES
  ('00000000-0000-0000-0000-000000000101','00000000-0000-0000-0000-0000000000c7','00000000-0000-0000-0000-00000000cc01','00000000-0000-0000-0000-0000000000b1','open',NULL),
  ('00000000-0000-0000-0000-000000000102','00000000-0000-0000-0000-0000000000c7','00000000-0000-0000-0000-00000000cc01','00000000-0000-0000-0000-0000000000b1','won',NULL),
  ('00000000-0000-0000-0000-000000000103','00000000-0000-0000-0000-0000000000c7','00000000-0000-0000-0000-00000000cc01','00000000-0000-0000-0000-0000000000b2','open',NULL),
  ('00000000-0000-0000-0000-000000000104','00000000-0000-0000-0000-0000000000c7',NULL,'00000000-0000-0000-0000-0000000000b1','open',NULL),
  ('00000000-0000-0000-0000-000000000105','00000000-0000-0000-0000-0000000000c7','00000000-0000-0000-0000-00000000cc01','00000000-0000-0000-0000-0000000000b1','open',NULL),
  ('00000000-0000-0000-0000-000000000106','00000000-0000-0000-0000-0000000000c7','00000000-0000-0000-0000-00000000cc01','00000000-0000-0000-0000-0000000000b1','open',NULL);

-- ===== Seed e imutabilidade da calibração (R10, §10.6) =====
SELECT pg_temp.assert((SELECT array_agg(number || ':' || status ORDER BY number) FROM classification_calibration_versions
  WHERE organization_id='00000000-0000-0000-0000-0000000000c7') = ARRAY['1:archived','2:published'], 'seed: v1 arquivada, v2 publicada');
SELECT pg_temp.assert((SELECT content->'_faixas'->'comissao' = '[50,100,200,300]' AND note = 'calibração validada com o Renan'
  FROM classification_calibration_versions WHERE number = 2), 'seed: v2 = export validado');
SELECT pg_temp.assert(NOT EXISTS (SELECT 1 FROM classification_calibration_versions WHERE organization_id='00000000-0000-0000-0000-0000000000b2'), 'seed só na Central Trabalhista');
SELECT pg_temp.expect_error($q$UPDATE classification_calibration_versions SET content = '{}' WHERE number = 2$q$, '%calibration_immutable%', 'publicada não muda');
SELECT pg_temp.expect_error($q$UPDATE classification_calibration_versions SET status = 'published' WHERE number = 1$q$, '%calibration_immutable%', 'arquivada não volta');
SELECT pg_temp.expect_error($q$DELETE FROM classification_calibration_versions WHERE number = 2$q$, '%calibration_immutable%', 'publicada não apaga');
SELECT pg_temp.expect_error($q$INSERT INTO classification_calibration_versions(organization_id, number, status, content, motor_version)
  VALUES ('00000000-0000-0000-0000-0000000000c7', 3, 'published', '{}', '1.0.0')$q$, '%ccv_published_has_note%', 'publicar exige nota');

-- ===== Gravar classificação =====
DO $$ DECLARE r jsonb; BEGIN
  r := pg_temp.rec('00000000-0000-0000-0000-000000000101','00000000-0000-0000-0000-0000000000b1','chave-0001');
  PERFORM pg_temp.assert(r->>'faixa' = 'OURO' AND (r->>'comissao')::numeric = 100 AND (r->>'replay')::boolean = false, 'grava e devolve só faixa/comissão');
  PERFORM pg_temp.assert(NOT (r ? 'score') AND NOT (r ? 'brutoTotal'), 'resposta sem números do caso');
  r := pg_temp.rec('00000000-0000-0000-0000-000000000101','00000000-0000-0000-0000-0000000000b1','chave-0001');
  PERFORM pg_temp.assert((r->>'replay')::boolean, 'mesma chave = mesmo resultado (idempotente)');
END $$;
SELECT pg_temp.assert((SELECT count(*) = 1 FROM process_classifications WHERE opportunity_id='00000000-0000-0000-0000-000000000101'), 'replay não grava de novo');
SELECT pg_temp.assert((SELECT score = 55 FROM process_classification_results), 'números vão para a tabela separada');
SELECT pg_temp.assert((SELECT amount = 100 AND user_id = '00000000-0000-0000-0000-0000000000b1' AND status = 'active'
  FROM opportunity_commissions WHERE source_type = 'process_classification'), 'comissão registrada no módulo de comissão');
SELECT pg_temp.expect_error($q$SELECT pg_temp.rec('00000000-0000-0000-0000-000000000101','00000000-0000-0000-0000-0000000000b1','chave-0002')$q$, 'pc:already_classified', 'uma ativa por oportunidade (§10.4)');
SELECT pg_temp.expect_error($q$INSERT INTO process_classifications(organization_id, opportunity_id, seller_user_id, calibration_version_id, motor_version, input, commission, idempotency_key)
  VALUES ('00000000-0000-0000-0000-0000000000c7','00000000-0000-0000-0000-000000000101','00000000-0000-0000-0000-0000000000b1', pg_temp.cal(), '1.0.0', '{}', 1, 'chave-direta')$q$,
  '%pc_one_active_per_opportunity%', 'o banco garante uma ativa, não só a função');
SELECT pg_temp.expect_error($q$SELECT pg_temp.rec('00000000-0000-0000-0000-000000000105','00000000-0000-0000-0000-0000000000b1','chave-0001')$q$, 'pc:idempotency_conflict', 'chave reaproveitada em outra oportunidade');
SELECT pg_temp.expect_error($q$SELECT pg_temp.rec('00000000-0000-0000-0000-000000000102','00000000-0000-0000-0000-0000000000b1','chave-0003')$q$, 'pc:opportunity_closed', 'oportunidade fechada não classifica (§10.5)');
SELECT pg_temp.expect_error($q$SELECT pg_temp.rec('00000000-0000-0000-0000-000000000103','00000000-0000-0000-0000-0000000000b1','chave-0004')$q$, 'pc:not_owner', 'só o dono classifica (R2a)');
SELECT pg_temp.expect_error($q$SELECT pg_temp.rec('00000000-0000-0000-0000-000000000104','00000000-0000-0000-0000-0000000000b1','chave-0005')$q$, 'pc:no_contact', 'exige contato vinculado (R2a)');
SELECT pg_temp.expect_error($q$SELECT pc_record_classification('00000000-0000-0000-0000-0000000000c7','00000000-0000-0000-0000-000000000105','00000000-0000-0000-0000-0000000000b1','chave-0006',
  (SELECT id FROM classification_calibration_versions WHERE number = 1), '1.0.0', '{}', pg_temp.res('OURO',1))$q$, 'pc:calibration_changed', 'só com a calibração publicada');

-- Em revisão: grava a classificação, sem comissão no módulo de comissão
SELECT pg_temp.rec('00000000-0000-0000-0000-000000000106','00000000-0000-0000-0000-0000000000b1','chave-0007', pg_temp.res('PRATA',0,true));
SELECT pg_temp.assert((SELECT in_review FROM process_classifications WHERE opportunity_id='00000000-0000-0000-0000-000000000106'), 'em revisão gravado');
SELECT pg_temp.assert(NOT EXISTS (SELECT 1 FROM opportunity_commissions WHERE opportunity_id='00000000-0000-0000-0000-000000000106'), 'em revisão não gera comissão');

-- ===== Correção liberada: a nova substitui a antiga (§6) =====
INSERT INTO classification_correction_requests(organization_id, classification_id, seller_user_id, status, decided_by, decided_at)
SELECT organization_id, id, seller_user_id, 'released', '00000000-0000-0000-0000-0000000000d1', now()
  FROM process_classifications WHERE opportunity_id='00000000-0000-0000-0000-000000000101';
SELECT pg_temp.rec('00000000-0000-0000-0000-000000000101','00000000-0000-0000-0000-0000000000b1','chave-0008', pg_temp.res('TITANIO',200));
SELECT pg_temp.assert((SELECT array_agg(status ORDER BY status = 'active') FROM process_classifications WHERE opportunity_id='00000000-0000-0000-0000-000000000101')
  = ARRAY['superseded','active'], 'antiga vira substituída');
SELECT pg_temp.assert((SELECT o.replaced_by_id = n.id AND n.replaces_id = o.id AND n.released_by = '00000000-0000-0000-0000-0000000000d1'
  FROM process_classifications o JOIN process_classifications n ON n.opportunity_id = o.opportunity_id
  WHERE o.opportunity_id='00000000-0000-0000-0000-000000000101' AND o.status='superseded' AND n.status='active'), 'antiga aponta para a nova');
SELECT pg_temp.assert((SELECT array_agg(status || ':' || amount ORDER BY status = 'active') FROM opportunity_commissions WHERE opportunity_id='00000000-0000-0000-0000-000000000101')
  = ARRAY['superseded:100.00','active:200.00'], 'comissão anterior substituída');
SELECT pg_temp.assert((SELECT replacement_id IS NOT NULL FROM classification_correction_requests), 'liberação consumida');
SELECT pg_temp.expect_error($q$SELECT pg_temp.rec('00000000-0000-0000-0000-000000000101','00000000-0000-0000-0000-0000000000b1','chave-0009')$q$, 'pc:already_classified', 'uma liberação = uma reclassificação');

-- ===== Limite diário por vendedor (R2c) =====
UPDATE process_classification_settings SET daily_limit_per_seller = 3 WHERE organization_id='00000000-0000-0000-0000-0000000000c7';
SELECT pg_temp.expect_error($q$SELECT pg_temp.rec('00000000-0000-0000-0000-000000000105','00000000-0000-0000-0000-0000000000b1','chave-0010')$q$, 'pc:daily_limit', 'limite diário');
UPDATE process_classification_settings SET daily_limit_per_seller = NULL;
SELECT pg_temp.rec('00000000-0000-0000-0000-000000000105','00000000-0000-0000-0000-0000000000b1','chave-0011');

-- ===== Oportunidade excluída → anulada, nunca apagada (R2b) =====
UPDATE opportunities SET deleted_at = now() WHERE id='00000000-0000-0000-0000-000000000105';
SELECT pg_temp.assert((SELECT status = 'voided' AND voided_reason = 'opportunity_deleted' FROM process_classifications WHERE opportunity_id='00000000-0000-0000-0000-000000000105'), 'soft delete anula');
SELECT pg_temp.assert((SELECT status = 'cancelled' FROM opportunity_commissions WHERE opportunity_id='00000000-0000-0000-0000-000000000105'), 'comissão cancelada');
DELETE FROM opportunities WHERE id='00000000-0000-0000-0000-000000000106';
SELECT pg_temp.assert((SELECT status = 'voided' FROM process_classifications WHERE opportunity_id='00000000-0000-0000-0000-000000000106'), 'delete físico anula e mantém o registro');

-- ===== RLS por papel e por tenant (R5, §10.3, §10.10) =====
INSERT INTO process_classifications(organization_id, opportunity_id, seller_user_id, calibration_version_id, motor_version, input, band, commission, idempotency_key)
VALUES ('00000000-0000-0000-0000-0000000000c7','00000000-0000-0000-0000-000000000103','00000000-0000-0000-0000-0000000000b2', pg_temp.cal(), '1.0.0', '{}', 'PRATA', 50, 'chave-b2-001');
SET LOCAL ROLE authenticated;
SELECT pg_temp.as_user('00000000-0000-0000-0000-0000000000b1');
SELECT pg_temp.assert((SELECT count(*) FROM process_classifications) = 4 AND (SELECT bool_and(seller_user_id = '00000000-0000-0000-0000-0000000000b1') FROM process_classifications), 'vendedor vê só as próprias');
SELECT pg_temp.assert((SELECT count(*) FROM process_classification_results) = 0, 'vendedor não vê números');
SELECT pg_temp.assert((SELECT count(*) FROM classification_calibration_versions) = 0, 'vendedor não vê calibração');
SELECT pg_temp.assert((SELECT count(*) FROM opportunity_commissions) > 0 AND (SELECT bool_and(user_id = '00000000-0000-0000-0000-0000000000b1') FROM opportunity_commissions), 'vendedor vê só a própria comissão');
SELECT pg_temp.expect_error($q$UPDATE process_classifications SET commission = 9999$q$, '%permission denied%', 'vendedor não altera classificação');
SELECT pg_temp.expect_error($q$INSERT INTO opportunity_commissions(organization_id, opportunity_id, user_id, amount, source_type) VALUES ('00000000-0000-0000-0000-0000000000c7','00000000-0000-0000-0000-000000000101','00000000-0000-0000-0000-0000000000b1', 9999, 'process_classification')$q$, '%permission denied%', 'vendedor não cria comissão');
SELECT pg_temp.expect_error($q$SELECT pc_record_classification(NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL)$q$, '%permission denied%', 'só o servidor grava classificação');
SELECT pg_temp.as_user('00000000-0000-0000-0000-0000000000d1');
SELECT pg_temp.assert((SELECT count(*) FROM process_classifications) = 5, 'gestor vê todas');
SELECT pg_temp.assert((SELECT count(*) FROM process_classification_results) = 0, 'gestor não vê números (R5)');
SELECT pg_temp.assert((SELECT count(*) FROM classification_correction_requests) = 1, 'gestor vê pedidos de correção');
SELECT pg_temp.as_user('00000000-0000-0000-0000-0000000000e1');
SELECT pg_temp.assert((SELECT count(*) FROM process_classification_results) > 0, 'jurídico vê números');
SELECT pg_temp.assert((SELECT count(*) FROM classification_calibration_versions) = 2, 'jurídico vê calibração');
SELECT pg_temp.as_user('00000000-0000-0000-0000-0000000000a1');
SELECT pg_temp.assert((SELECT count(*) FROM process_classification_results) > 0 AND (SELECT count(*) FROM opportunity_commissions) = 3, 'admin vê tudo da org');
SELECT pg_temp.as_user('00000000-0000-0000-0000-0000000000f1');
SELECT pg_temp.assert((SELECT count(*) FROM process_classifications) + (SELECT count(*) FROM process_classification_results)
  + (SELECT count(*) FROM classification_calibration_versions) + (SELECT count(*) FROM opportunity_commissions) = 0, 'admin de outra org não vê nada');
RESET ROLE;

-- ===== Módulo e permissão de sistema =====
SELECT pg_temp.assert(NOT org_widget_enabled('00000000-0000-0000-0000-0000000000c7','process_classification'), 'migração não liga o módulo');
SELECT pg_temp.assert((rbac_full_perms() #>> '{administracao,publicar_calibracao}')::boolean AND rbac_full_perms() #>> '{dados,classificacoes,ver}' = 'todos', 'Admin recebe as chaves novas');

SELECT pg_temp.assert(pc_user_perms('00000000-0000-0000-0000-0000000000c7','00000000-0000-0000-0000-0000000000b1') #>> '{ferramentas,classificar}' = 'true', 'servidor lê permissões do vendedor');
SET LOCAL ROLE authenticated;
SELECT pg_temp.expect_error($q$SELECT pc_user_perms('00000000-0000-0000-0000-0000000000c7','00000000-0000-0000-0000-0000000000b1')$q$, '%permission denied%', 'navegador não lê permissões alheias');
RESET ROLE;

SELECT 'process_classification: OK' AS resultado;
ROLLBACK;
