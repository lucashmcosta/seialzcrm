-- Fase 5: relatórios (visibilidade por papel, números só com permissão, filtros, exportação por tese, detalhe).
-- psql -d BANCO_DESCARTAVEL -v ON_ERROR_STOP=1 -f supabase/tests/process_classification_fixture.sql -f supabase/tests/process_classification_reports.sql
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
CREATE FUNCTION pg_temp.rep(lim integer DEFAULT 50, off integer DEFAULT 0, banda text DEFAULT NULL) RETURNS jsonb LANGUAGE sql AS $$
  SELECT pc_report('00000000-0000-0000-0000-0000000000c7', now() - interval '1 day', now() + interval '1 day', NULL, banda, NULL, NULL, ARRAY['active'], lim, off)$$;
CREATE FUNCTION pg_temp.exp() RETURNS jsonb LANGUAGE sql AS $$
  SELECT pc_report_export('00000000-0000-0000-0000-0000000000c7', now() - interval '1 day', now() + interval '1 day')$$;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA pg_temp TO authenticated;

INSERT INTO users(id, full_name) VALUES ('00000000-0000-0000-0000-0000000000b1','Vera'),('00000000-0000-0000-0000-0000000000b2','Bruno'),
  ('00000000-0000-0000-0000-0000000000d1','Gestor'),('00000000-0000-0000-0000-0000000000e1','Jurídico'),('00000000-0000-0000-0000-0000000000f1','Fora');
INSERT INTO permission_profiles(id, organization_id, is_system, permissions_v2) VALUES
  ('00000000-0000-0000-0000-00000000aa02','00000000-0000-0000-0000-0000000000c7',false,'{"dados":{"classificacoes":{"ver":"meus"}},"ferramentas":{"classificar":true}}'),
  ('00000000-0000-0000-0000-00000000aa03','00000000-0000-0000-0000-0000000000c7',false,'{"dados":{"classificacoes":{"ver":"todos"}}}'),
  ('00000000-0000-0000-0000-00000000aa04','00000000-0000-0000-0000-0000000000c7',false,'{"dados":{"classificacoes":{"ver":"todos"}},"administracao":{"ver_numeros_classificacao":true}}'),
  ('00000000-0000-0000-0000-00000000aa05','00000000-0000-0000-0000-0000000000b2',true,NULL);
INSERT INTO user_organizations VALUES
  ('00000000-0000-0000-0000-0000000000b1','00000000-0000-0000-0000-0000000000c7',true,'00000000-0000-0000-0000-00000000aa02'),
  ('00000000-0000-0000-0000-0000000000b2','00000000-0000-0000-0000-0000000000c7',true,'00000000-0000-0000-0000-00000000aa02'),
  ('00000000-0000-0000-0000-0000000000d1','00000000-0000-0000-0000-0000000000c7',true,'00000000-0000-0000-0000-00000000aa03'),
  ('00000000-0000-0000-0000-0000000000e1','00000000-0000-0000-0000-0000000000c7',true,'00000000-0000-0000-0000-00000000aa04'),
  ('00000000-0000-0000-0000-0000000000f1','00000000-0000-0000-0000-0000000000b2',true,'00000000-0000-0000-0000-00000000aa05');
INSERT INTO opportunities(id, organization_id, contact_id, owner_user_id, status, title)
SELECT ('00000000-0000-0000-0000-0000000005' || lpad(n::text, 2, '0'))::uuid, '00000000-0000-0000-0000-0000000000c7', '00000000-0000-0000-0000-00000000cc01',
       CASE WHEN n <= 3 THEN '00000000-0000-0000-0000-0000000000b1' ELSE '00000000-0000-0000-0000-0000000000b2' END::uuid, 'open', 'Caso ' || n
  FROM generate_series(1, 5) n;
DO $$ DECLARE n int; BEGIN
  FOR n IN 1..5 LOOP
    PERFORM pc_record_classification('00000000-0000-0000-0000-0000000000c7', ('00000000-0000-0000-0000-0000000005' || lpad(n::text, 2, '0'))::uuid,
      CASE WHEN n <= 3 THEN '00000000-0000-0000-0000-0000000000b1' ELSE '00000000-0000-0000-0000-0000000000b2' END::uuid, 'rep-chave-' || n,
      (SELECT id FROM classification_calibration_versions WHERE status = 'published'), '1.0.0', '{"salario":3000}',
      jsonb_build_object('faixa', CASE WHEN n = 5 THEN 'DIAMANTE' ELSE 'OURO' END, 'comissao', 100 * n, 'score', 50 + n,
        'brutoTotal', 1000 * n, 'esperadoTotal', 500 * n, 'valorComposto', 700 * n,
        'teses', jsonb_build_array(jsonb_build_object('tese','fgts','prob',0.9,'probAuto',0.9,'bruto',1000,'esperado',900,'selo','forte','aviso','','excluida',false),
                                   jsonb_build_object('tese','horas_extras','prob',0.5,'probAuto',0.5,'bruto',2000,'esperado',1000,'selo','media','aviso','','excluida',false))));
  END LOOP;
END $$;

SET LOCAL ROLE authenticated;
-- Vendedora (escopo "meus"): NUNCA acessa o relatório; vê a dela só no widget (faixa e comissão)
SELECT pg_temp.as_user('00000000-0000-0000-0000-0000000000b1');
SELECT pg_temp.expect_error($q$SELECT pg_temp.rep()$q$, 'pc:forbidden', 'vendedora não abre o relatório (escada de faixas, versões)');
SELECT pg_temp.expect_error($q$SELECT pg_temp.exp()$q$, 'pc:forbidden', 'vendedora não exporta');
SELECT pg_temp.expect_error($q$SELECT pc_report_detail((SELECT id FROM process_classifications WHERE seller_user_id = '00000000-0000-0000-0000-0000000000b1' LIMIT 1))$q$, 'pc:not_found', 'nem o detalhe da própria');
SELECT pg_temp.assert((SELECT count(*) = 3 AND bool_and(seller_user_id = '00000000-0000-0000-0000-0000000000b1') FROM process_classifications), 'a própria classificação (faixa/comissão) segue legível para o widget');
SELECT pg_temp.assert((SELECT count(*) FROM process_classification_results) = 0, 'sem números');
-- Gestor: todas, sem números
SELECT pg_temp.as_user('00000000-0000-0000-0000-0000000000d1');
SELECT pg_temp.assert((pg_temp.rep()->>'total')::int = 5 AND (pg_temp.rep()->>'numeros')::boolean = false, 'gestor: 5, sem números');
SELECT pg_temp.assert((pg_temp.rep()->'linhas'->0->>'oportunidade') LIKE 'Caso %' AND pg_temp.rep()->'linhas'->0->>'score' IS NULL, 'linha com oportunidade, sem score');
SELECT pg_temp.assert(jsonb_array_length(pg_temp.exp()->'linhas') = 5 AND pg_temp.exp()->'linhas'->0->>'tese' IS NULL, 'exportação sem números: 1 linha por classificação');
SELECT pg_temp.assert((pg_temp.rep()->>'comissaoTotal')::numeric = 1500, 'comissão total');
SELECT pg_temp.assert(pg_temp.rep()->'porFaixa' = '{"OURO":4,"DIAMANTE":1}', 'por faixa');
SELECT pg_temp.assert((pg_temp.rep(50, 0, 'DIAMANTE')->>'total')::int = 1, 'filtro de faixa');
SELECT pg_temp.assert(jsonb_array_length(pg_temp.rep(2, 0)->'linhas') = 2 AND (pg_temp.rep(2, 4)->>'total')::int = 5 AND jsonb_array_length(pg_temp.rep(2, 4)->'linhas') = 1, 'paginação');
SELECT pg_temp.assert(jsonb_array_length(pg_temp.rep()->'vendedores') = 2, 'lista de vendedores para o filtro');
SELECT pg_temp.assert((SELECT pc_report_detail(id)->'resultado' FROM process_classifications LIMIT 1) = 'null'::jsonb, 'detalhe sem números para o gestor');
SELECT pg_temp.assert((SELECT pc_report_detail(id)->'entrada'->>'salario' FROM process_classifications LIMIT 1) = '3000', 'detalhe com as respostas');
-- Jurídico (ver números): score e exportação por tese
SELECT pg_temp.as_user('00000000-0000-0000-0000-0000000000e1');
SELECT pg_temp.assert((pg_temp.rep()->>'numeros')::boolean AND (pg_temp.rep()->'linhas'->0->>'score') IS NOT NULL, 'jurídico: com score');
SELECT pg_temp.assert(jsonb_array_length(pg_temp.exp()->'linhas') = 10, 'exportação com números: 5 classificações × 2 teses');
SELECT pg_temp.assert((SELECT bool_and((l->>'chance') IS NOT NULL AND l->>'tese' IN ('fgts','horas_extras')) FROM jsonb_array_elements(pg_temp.exp()->'linhas') l), 'chance e tese em cada linha');
SELECT pg_temp.assert((SELECT pc_report_detail(id)->'resultado'->>'score' FROM process_classifications LIMIT 1) IS NOT NULL, 'detalhe com números');
-- Outra org
SELECT pg_temp.as_user('00000000-0000-0000-0000-0000000000f1');
SELECT pg_temp.expect_error($q$SELECT pg_temp.rep()$q$, 'pc:forbidden', 'outra org não lê');
SELECT pg_temp.expect_error($q$SELECT pc_report_detail((SELECT id FROM process_classifications LIMIT 1))$q$, 'pc:not_found', 'outra org não abre detalhe');
RESET ROLE;
SELECT 'process_classification_reports: OK' AS resultado;
ROLLBACK;
