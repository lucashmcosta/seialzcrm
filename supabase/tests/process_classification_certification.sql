-- Fase 3b: certificação pós-ganho (só para baixo; mesma calibração; refazer só Admin; idempotência do Nammux).
-- psql -d BANCO_DESCARTAVEL -v ON_ERROR_STOP=1 -f supabase/tests/process_classification_fixture.sql -f supabase/tests/process_classification_certification.sql
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
CREATE FUNCTION pg_temp.classify(opp text, k text, faixa text, comissao numeric) RETURNS jsonb LANGUAGE sql AS $$
  SELECT pc_record_classification('00000000-0000-0000-0000-0000000000c7', opp::uuid, '00000000-0000-0000-0000-0000000000b1', k,
    (SELECT id FROM classification_calibration_versions WHERE organization_id='00000000-0000-0000-0000-0000000000c7' AND status='published'),
    '1.0.0', '{"salario":3000}', jsonb_build_object('faixa',faixa,'comissao',comissao))$$;
CREATE FUNCTION pg_temp.certify(opp text, faixa text, comissao numeric, redo boolean DEFAULT false, ev text DEFAULT NULL) RETURNS jsonb LANGUAGE sql AS $$
  SELECT pc_record_certification('00000000-0000-0000-0000-0000000000c7', opp::uuid,
    CASE WHEN ev IS NULL THEN 'seialz' ELSE 'nammux' END,
    CASE WHEN ev IS NULL THEN '00000000-0000-0000-0000-0000000000e1'::uuid END,
    CASE WHEN ev IS NOT NULL THEN 'entrevistadora@nammux' END, ev,
    '{"salario":2000}', ARRAY['salario'], jsonb_build_object('faixa',faixa,'comissao',comissao,'score',40), 'Entrevista: salário era 2 mil', redo)$$;
CREATE FUNCTION pg_temp.won(opp text) RETURNS void LANGUAGE sql AS $$UPDATE opportunities SET status = 'won' WHERE id = opp::uuid$$;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA pg_temp TO authenticated;

INSERT INTO users(id, full_name) VALUES ('00000000-0000-0000-0000-0000000000a1','Admin'),('00000000-0000-0000-0000-0000000000b1','Vera Vendedora'),
  ('00000000-0000-0000-0000-0000000000e1','Juliana Jurídico');
INSERT INTO permission_profiles(id, organization_id, is_system, permissions_v2) VALUES
  ('00000000-0000-0000-0000-00000000aa01','00000000-0000-0000-0000-0000000000c7',true,NULL),
  ('00000000-0000-0000-0000-00000000aa02','00000000-0000-0000-0000-0000000000c7',false,'{"dados":{"classificacoes":{"ver":"meus"}},"ferramentas":{"classificar":true}}'),
  ('00000000-0000-0000-0000-00000000aa04','00000000-0000-0000-0000-0000000000c7',false,'{"dados":{"classificacoes":{"ver":"todos"}},"ferramentas":{"certificar_classificacao":true}}');
INSERT INTO user_organizations VALUES
  ('00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000000c7',true,'00000000-0000-0000-0000-00000000aa01'),
  ('00000000-0000-0000-0000-0000000000b1','00000000-0000-0000-0000-0000000000c7',true,'00000000-0000-0000-0000-00000000aa02'),
  ('00000000-0000-0000-0000-0000000000e1','00000000-0000-0000-0000-0000000000c7',true,'00000000-0000-0000-0000-00000000aa04');
INSERT INTO opportunities(id, organization_id, contact_id, owner_user_id, status, title)
SELECT ('00000000-0000-0000-0000-0000000004' || lpad(n::text, 2, '0'))::uuid, '00000000-0000-0000-0000-0000000000c7',
       '00000000-0000-0000-0000-00000000cc01', '00000000-0000-0000-0000-0000000000b1', 'open', 'Caso ' || n FROM generate_series(1, 6) n;

SELECT pg_temp.assert((rbac_full_perms() #>> '{ferramentas,certificar_classificacao}')::boolean, 'Admin recebe certificar');

-- ===== Só depois de ganha =====
SELECT pg_temp.classify('00000000-0000-0000-0000-000000000401', 'cert-chave-01', 'OURO', 200);
SELECT pg_temp.expect_error($q$SELECT pg_temp.certify('00000000-0000-0000-0000-000000000401','PRATA',100)$q$, 'pc:not_won', 'aberta: não certifica');
SELECT pg_temp.won('00000000-0000-0000-0000-000000000401');
SELECT pg_temp.expect_error($q$SELECT pc_record_certification('00000000-0000-0000-0000-0000000000c7','00000000-0000-0000-0000-000000000401','seialz','00000000-0000-0000-0000-0000000000e1',NULL,NULL,'{}','{}','{"faixa":"PRATA","comissao":100}','  ',false)$q$, 'pc:note_required', 'nota obrigatória');
SELECT pg_temp.won('00000000-0000-0000-0000-000000000402');
SELECT pg_temp.expect_error($q$SELECT pg_temp.certify('00000000-0000-0000-0000-000000000402','PRATA',100)$q$, 'pc:not_classified', 'ganha sem classificação: nada a certificar');

-- ===== Reduz: comissão certificada menor =====
DO $$ DECLARE r jsonb; BEGIN
  r := pg_temp.certify('00000000-0000-0000-0000-000000000401', 'PRATA', 100);
  PERFORM pg_temp.assert(r->>'outcome' = 'reduced' AND r->>'finalBand' = 'PRATA' AND (r->>'finalCommission')::numeric = 100, 'reduz para a certificada');
END $$;
SELECT pg_temp.assert((SELECT original_band = 'OURO' AND original_commission = 200 AND certified_commission = 100 AND final_commission = 100
  AND changed_fields = ARRAY['salario'] AND certified_by = '00000000-0000-0000-0000-0000000000e1' FROM process_classification_certifications), 'registro: declarado × certificado × final');
SELECT pg_temp.assert((SELECT band = 'OURO' AND commission = 200 AND status = 'active' FROM process_classifications WHERE opportunity_id = '00000000-0000-0000-0000-000000000401'), 'classificação original não muda');
SELECT pg_temp.assert((SELECT array_agg(status || ':' || amount ORDER BY status) FROM opportunity_commissions WHERE opportunity_id = '00000000-0000-0000-0000-000000000401')
  = ARRAY['active:100.00','superseded:200.00'], 'comissão reduzida; a original fica como histórico');
SELECT pg_temp.assert((SELECT note LIKE 'Certificação: %' FROM opportunity_commissions WHERE opportunity_id = '00000000-0000-0000-0000-000000000401' AND status = 'active'), 'motivo na comissão');
SELECT pg_temp.assert((SELECT count(*) = 1 FROM notifications WHERE type = 'classification_certified_reduced' AND user_id = '00000000-0000-0000-0000-0000000000b1'), 'vendedor avisado');
SELECT pg_temp.expect_error($q$SELECT pg_temp.certify('00000000-0000-0000-0000-000000000401','PRATA',50)$q$, 'pc:already_certified', 'uma certificação por classificação');

-- ===== Refazer (Admin): o mínimo é sempre contra a original =====
SELECT pg_temp.certify('00000000-0000-0000-0000-000000000401', 'DIAMANTE', 900, true);
SELECT pg_temp.assert((SELECT outcome = 'confirmed' AND final_commission = 200 FROM process_classification_certifications WHERE status = 'active'), 'refazer com resultado maior volta à original (não sobe além)');
SELECT pg_temp.assert((SELECT array_agg(status || ':' || amount ORDER BY created_at, status) FROM opportunity_commissions WHERE opportunity_id = '00000000-0000-0000-0000-000000000401' AND status = 'active')
  = ARRAY['active:200.00'], 'comissão volta para a original');
SELECT pg_temp.assert((SELECT count(*) = 2 AND count(*) FILTER (WHERE status = 'superseded' AND superseded_by_id IS NOT NULL) = 1 FROM process_classification_certifications), 'histórico das certificações');

-- ===== Confirma: igual ou maior não muda nada =====
SELECT pg_temp.classify('00000000-0000-0000-0000-000000000403', 'cert-chave-03', 'OURO', 200);
SELECT pg_temp.won('00000000-0000-0000-0000-000000000403');
SELECT pg_temp.assert(pg_temp.certify('00000000-0000-0000-0000-000000000403', 'TITANIO', 400)->>'outcome' = 'confirmed', 'subir não muda');
SELECT pg_temp.assert((SELECT count(*) = 1 AND bool_and(status = 'active' AND amount = 200) FROM opportunity_commissions WHERE opportunity_id = '00000000-0000-0000-0000-000000000403'), 'comissão intacta');
SELECT pg_temp.assert((SELECT certified_commission = 400 AND final_commission = 200 FROM process_classification_certifications WHERE opportunity_id = '00000000-0000-0000-0000-000000000403'), 'guarda o certificado mesmo sem mudar');
SELECT pg_temp.expect_error($q$INSERT INTO process_classification_certifications(organization_id, classification_id, opportunity_id, seller_user_id, calibration_version_id, motor_version, input,
  original_commission, certified_commission, final_commission, outcome, note, certified_by, status)
  SELECT organization_id, id, opportunity_id, seller_user_id, calibration_version_id, '1.0.0', '{}', 200, 400, 400, 'confirmed', 'x', seller_user_id, 'superseded'
  FROM process_classifications WHERE opportunity_id = '00000000-0000-0000-0000-000000000403'$q$, '%pcc_final_never_up%', 'o banco impede comissão final acima da original');

-- ===== Em revisão (comissão 0): nada a reduzir =====
SELECT pc_record_classification('00000000-0000-0000-0000-0000000000c7','00000000-0000-0000-0000-000000000404','00000000-0000-0000-0000-0000000000b1','cert-chave-04',
  (SELECT id FROM classification_calibration_versions WHERE status='published'), '1.0.0', '{}', '{"faixa":"PRATA","comissao":0,"emRevisao":true}');
SELECT pg_temp.won('00000000-0000-0000-0000-000000000404');
SELECT pg_temp.assert(pg_temp.certify('00000000-0000-0000-0000-000000000404', 'OURO', 100)->>'outcome' = 'confirmed', 'em revisão: não sobe');
SELECT pg_temp.assert(NOT EXISTS (SELECT 1 FROM opportunity_commissions WHERE opportunity_id = '00000000-0000-0000-0000-000000000404'), 'em revisão: sem comissão criada');

-- ===== Nammux (API futura): idempotente pelo id do evento =====
SELECT pg_temp.classify('00000000-0000-0000-0000-000000000406', 'cert-chave-06', 'OURO', 200);
SELECT pg_temp.won('00000000-0000-0000-0000-000000000406');
SELECT pg_temp.assert((pg_temp.certify('00000000-0000-0000-0000-000000000406', 'PRATA', 100, false, 'evt-123')->>'replay')::boolean = false, 'evento do Nammux grava');
SELECT pg_temp.assert((pg_temp.certify('00000000-0000-0000-0000-000000000406', 'PRATA', 100, false, 'evt-123')->>'replay')::boolean, 'mesmo evento = replay');
SELECT pg_temp.assert((SELECT source = 'nammux' AND external_actor = 'entrevistadora@nammux' AND certified_by IS NULL FROM process_classification_certifications WHERE opportunity_id = '00000000-0000-0000-0000-000000000406'), 'origem e ator externo');

-- ===== RLS =====
SET LOCAL ROLE authenticated;
SELECT pg_temp.as_user('00000000-0000-0000-0000-0000000000b1');
SELECT pg_temp.assert((SELECT count(*) FROM process_classification_certifications) = 0, 'vendedor NÃO lê a certificação direto (faixa/comissão certificadas ensinariam a regra)');
SELECT pg_temp.assert((SELECT count(*) FROM opportunity_commissions) > 0, 'vendedor continua vendo a própria comissão');
SELECT pg_temp.assert((SELECT count(*) FROM process_classification_certification_results) = 0, 'vendedor não vê os números');
SELECT pg_temp.expect_error($q$SELECT pc_record_certification(NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL)$q$, '%permission denied%', 'só o servidor certifica');
SELECT pg_temp.as_user('00000000-0000-0000-0000-0000000000e1');
SELECT pg_temp.assert((SELECT count(*) FROM process_classification_certifications) = 5, 'jurídico vê todas (inclusive a substituída)');
SELECT pg_temp.as_user('00000000-0000-0000-0000-0000000000a1');
SELECT pg_temp.assert((SELECT count(*) FROM process_classification_certification_results) = 5, 'admin vê os números');
RESET ROLE;

SELECT 'process_classification_certification: OK' AS resultado;
ROLLBACK;
