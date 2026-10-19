-- Comissões no Início: prevista × confirmada pela data do ganho; vendedor só vê as próprias; nada de números.
-- psql -d BANCO_DESCARTAVEL -v ON_ERROR_STOP=1 -f supabase/tests/process_classification_fixture.sql -f supabase/tests/process_classification_dashboard.sql
BEGIN;
CREATE FUNCTION pg_temp.assert(ok boolean, message text) RETURNS void LANGUAGE plpgsql AS $$BEGIN IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'FAIL: %',message; END IF; END$$;
CREATE FUNCTION pg_temp.as_user(u text) RETURNS text LANGUAGE sql AS $$SELECT set_config('test.user_id', u, true)$$;
CREATE FUNCTION pg_temp.dash(de text, ate text, vendedor text DEFAULT NULL) RETURNS jsonb LANGUAGE sql AS $$
  SELECT pc_dashboard_commissions('00000000-0000-0000-0000-0000000000c7', de::date, ate::date, vendedor::uuid)$$;
CREATE FUNCTION pg_temp.classify(opp text, vendedor text, faixa text, comissao numeric) RETURNS jsonb LANGUAGE sql AS $$
  SELECT pc_record_classification('00000000-0000-0000-0000-0000000000c7', opp::uuid, vendedor::uuid, 'dash-' || opp,
    (SELECT id FROM classification_calibration_versions WHERE organization_id='00000000-0000-0000-0000-0000000000c7' AND status='published'),
    '1.0.0', '{"salario":3000}', jsonb_build_object('faixa',faixa,'comissao',comissao,'score',61,'brutoTotal',90000))$$;
CREATE FUNCTION pg_temp.won(opp text, dia text) RETURNS void LANGUAGE sql AS $$UPDATE opportunities SET status = 'won', close_date = dia::date WHERE id = opp::uuid$$;
CREATE FUNCTION pg_temp.certify(opp text, faixa text, comissao numeric) RETURNS jsonb LANGUAGE sql AS $$
  SELECT pc_record_certification('00000000-0000-0000-0000-0000000000c7', opp::uuid, 'seialz', '00000000-0000-0000-0000-0000000000d1', NULL, NULL,
    '{"salario":2000}', ARRAY['salario'], jsonb_build_object('faixa',faixa,'comissao',comissao,'score',40), 'Entrevista: salário era 2 mil', false)$$;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA pg_temp TO authenticated;

INSERT INTO organization_widgets VALUES ('00000000-0000-0000-0000-0000000000c7','process_classification',true);
INSERT INTO contacts(id, organization_id, full_name) VALUES ('00000000-0000-0000-0000-00000000cc01','00000000-0000-0000-0000-0000000000c7','João Teste');
INSERT INTO users(id, full_name) VALUES ('00000000-0000-0000-0000-0000000000b1','Vera'),('00000000-0000-0000-0000-0000000000b2','Bruno'),
  ('00000000-0000-0000-0000-0000000000d1','Gestor'),('00000000-0000-0000-0000-0000000000a9','Sem permissão'),('00000000-0000-0000-0000-0000000000f1','Fora');
INSERT INTO permission_profiles(id, organization_id, is_system, permissions_v2) VALUES
  ('00000000-0000-0000-0000-00000000aa02','00000000-0000-0000-0000-0000000000c7',false,'{"dados":{"classificacoes":{"ver":"meus"}},"ferramentas":{"classificar":true}}'),
  ('00000000-0000-0000-0000-00000000aa03','00000000-0000-0000-0000-0000000000c7',false,'{"dados":{"classificacoes":{"ver":"todos"}},"ferramentas":{"certificar_classificacao":true}}'),
  ('00000000-0000-0000-0000-00000000aa06','00000000-0000-0000-0000-0000000000c7',false,'{}'),
  ('00000000-0000-0000-0000-00000000aa05','00000000-0000-0000-0000-0000000000b2',true,NULL);
INSERT INTO user_organizations VALUES
  ('00000000-0000-0000-0000-0000000000b1','00000000-0000-0000-0000-0000000000c7',true,'00000000-0000-0000-0000-00000000aa02'),
  ('00000000-0000-0000-0000-0000000000b2','00000000-0000-0000-0000-0000000000c7',true,'00000000-0000-0000-0000-00000000aa02'),
  ('00000000-0000-0000-0000-0000000000d1','00000000-0000-0000-0000-0000000000c7',true,'00000000-0000-0000-0000-00000000aa03'),
  ('00000000-0000-0000-0000-0000000000a9','00000000-0000-0000-0000-0000000000c7',true,'00000000-0000-0000-0000-00000000aa06'),
  ('00000000-0000-0000-0000-0000000000f1','00000000-0000-0000-0000-0000000000b2',true,'00000000-0000-0000-0000-00000000aa05');
-- 601 Vera ganha 10/10, certificada com redução (Ouro 250 → Prata 100)
-- 602 Vera ganha 15/09, aguardando entrevista (250)
-- 603 Vera aberta e classificada (não conta)
-- 604 Bruno ganha 12/10, aguardando entrevista (200)
-- 605 Vera ganha 11/10, certificada sem mudança (300)
INSERT INTO opportunities(id, organization_id, contact_id, owner_user_id, status, title)
SELECT ('00000000-0000-0000-0000-0000000006' || lpad(n::text, 2, '0'))::uuid, '00000000-0000-0000-0000-0000000000c7', '00000000-0000-0000-0000-00000000cc01',
       CASE WHEN n = 4 THEN '00000000-0000-0000-0000-0000000000b2' ELSE '00000000-0000-0000-0000-0000000000b1' END::uuid, 'open', 'Caso ' || n
  FROM generate_series(1, 5) n;
SELECT pg_temp.classify('00000000-0000-0000-0000-000000000601', '00000000-0000-0000-0000-0000000000b1', 'OURO', 250);
SELECT pg_temp.classify('00000000-0000-0000-0000-000000000602', '00000000-0000-0000-0000-0000000000b1', 'OURO', 250);
SELECT pg_temp.classify('00000000-0000-0000-0000-000000000603', '00000000-0000-0000-0000-0000000000b1', 'DIAMANTE', 500);
SELECT pg_temp.classify('00000000-0000-0000-0000-000000000604', '00000000-0000-0000-0000-0000000000b2', 'OURO', 200);
SELECT pg_temp.classify('00000000-0000-0000-0000-000000000605', '00000000-0000-0000-0000-0000000000b1', 'TITANIO', 300);
SELECT pg_temp.won('00000000-0000-0000-0000-000000000601', '2026-10-10');
SELECT pg_temp.won('00000000-0000-0000-0000-000000000602', '2026-09-15');
SELECT pg_temp.won('00000000-0000-0000-0000-000000000604', '2026-10-12');
SELECT pg_temp.won('00000000-0000-0000-0000-000000000605', '2026-10-11');
SELECT pg_temp.certify('00000000-0000-0000-0000-000000000601', 'PRATA', 100);
SELECT pg_temp.certify('00000000-0000-0000-0000-000000000605', 'TITANIO', 300);

SET LOCAL ROLE authenticated;
-- Vendedora: só as próprias, mesmo pedindo as do Bruno
SELECT pg_temp.as_user('00000000-0000-0000-0000-0000000000b1');
SELECT pg_temp.assert((pg_temp.dash('2026-10-01','2026-10-31')->>'visivel')::boolean AND (pg_temp.dash('2026-10-01','2026-10-31')->>'soMinhas')::boolean, 'vendedora vê o card, só as dela');
SELECT pg_temp.assert(pg_temp.dash('2026-10-01','2026-10-31')->'confirmada' = '{"total": 400, "quantidade": 2}', 'outubro: confirmada = 100 (reduzida) + 300');
SELECT pg_temp.assert(pg_temp.dash('2026-10-01','2026-10-31')->'prevista' = '{"total": 0, "quantidade": 0}', 'outubro: nada aguardando (a aberta não conta)');
SELECT pg_temp.assert(pg_temp.dash('2026-09-01','2026-09-30')->'prevista' = '{"total": 250, "quantidade": 1}', 'setembro (mês passado): prevista 250');
SELECT pg_temp.assert(pg_temp.dash('2026-10-01','2026-10-31','00000000-0000-0000-0000-0000000000b2')->'confirmada' = '{"total": 400, "quantidade": 2}'
  AND NOT (pg_temp.dash('2026-10-01','2026-10-31','00000000-0000-0000-0000-0000000000b2')->'linhas' @> '[{"vendedor":"Bruno"}]'), 'filtro de responsável não abre as do Bruno');
SELECT pg_temp.assert((SELECT l->'ajuste' = '{"faixa": "OURO", "comissao": 250, "motivo": "Entrevista: salário era 2 mil"}' AND l->>'faixa' = 'PRATA' AND (l->>'comissao')::numeric = 100
                         FROM jsonb_array_elements(pg_temp.dash('2026-10-01','2026-10-31')->'linhas') l WHERE l->>'oportunidade' = 'Caso 1'), 'linha reduzida: de → para, com motivo');
SELECT pg_temp.assert((SELECT l->'ajuste' = 'null'::jsonb AND l->>'situacao' = 'confirmada' AND l->>'contato' = 'João Teste' AND l->>'ganhaEm' = '2026-10-11'
                         FROM jsonb_array_elements(pg_temp.dash('2026-10-01','2026-10-31')->'linhas') l WHERE l->>'oportunidade' = 'Caso 5'), 'linha confirmada sem ajuste');
SELECT pg_temp.assert((SELECT bool_and(NOT (l ?| ARRAY['score','brutoTotal','bruto','esperado'])) FROM jsonb_array_elements(pg_temp.dash('2026-01-01','2026-12-31')->'linhas') l)
  AND pg_temp.dash('2026-01-01','2026-12-31')::text NOT LIKE '%90000%', 'sem score nem valores');
-- Gestor (ver todos): soma da equipe e filtro por responsável
SELECT pg_temp.as_user('00000000-0000-0000-0000-0000000000d1');
SELECT pg_temp.assert(pg_temp.dash('2026-10-01','2026-10-31')->'prevista' = '{"total": 200, "quantidade": 1}' AND NOT (pg_temp.dash('2026-10-01','2026-10-31')->>'soMinhas')::boolean, 'gestor: equipe');
SELECT pg_temp.assert(pg_temp.dash('2026-10-01','2026-10-31','00000000-0000-0000-0000-0000000000b2')->'confirmada' = '{"total": 0, "quantidade": 0}'
  AND pg_temp.dash('2026-10-01','2026-10-31','00000000-0000-0000-0000-0000000000b2')->'linhas' @> '[{"vendedor":"Bruno","situacao":"prevista"}]', 'gestor filtrando o Bruno');
-- Sem permissão / outra org / widget desligado: o card não aparece
SELECT pg_temp.as_user('00000000-0000-0000-0000-0000000000a9');
SELECT pg_temp.assert(pg_temp.dash('2026-10-01','2026-10-31') = '{"visivel": false}', 'perfil sem classificar nem ver: sem card');
SELECT pg_temp.as_user('00000000-0000-0000-0000-0000000000f1');
SELECT pg_temp.assert(pg_temp.dash('2026-10-01','2026-10-31') = '{"visivel": false}', 'outra org: sem card');
RESET ROLE;
UPDATE organization_widgets SET is_enabled = false;
SET LOCAL ROLE authenticated;
SELECT pg_temp.as_user('00000000-0000-0000-0000-0000000000b1');
SELECT pg_temp.assert(pg_temp.dash('2026-10-01','2026-10-31') = '{"visivel": false}', 'widget desligado: sem card');
RESET ROLE;
SELECT 'process_classification_dashboard: OK' AS resultado;
ROLLBACK;
