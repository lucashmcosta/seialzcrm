-- Fase 4: rascunho (1 por org, concorrência), descartar, publicar (transacional, nota, imutável, número sequencial).
-- psql -d BANCO_DESCARTAVEL -v ON_ERROR_STOP=1 -f supabase/tests/process_classification_fixture.sql -f supabase/tests/process_classification_calibration.sql
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
CREATE TEMP TABLE t(k text PRIMARY KEY, v jsonb);
\set org '00000000-0000-0000-0000-0000000000c7'
INSERT INTO users(id) VALUES ('00000000-0000-0000-0000-0000000000a1');

-- Criar rascunho: número seguinte, baseado na publicada
INSERT INTO t SELECT 'd1', pc_save_draft(:'org', (SELECT content FROM classification_calibration_versions WHERE status='published') || '{"_geral":{"selo_forte":70,"selo_media":40,"sm":1621,"reflexo":1.37}}', '00000000-0000-0000-0000-0000000000a1', NULL, '1.0.0');
SELECT pg_temp.assert((SELECT (v->>'number')::int = 3 FROM t WHERE k='d1'), 'rascunho vira o nº 3');
SELECT pg_temp.assert((SELECT based_on_id = (SELECT id FROM classification_calibration_versions WHERE status='published') FROM classification_calibration_versions WHERE status='draft'), 'baseado na publicada');
SELECT pg_temp.expect_error($q$SELECT pc_save_draft('00000000-0000-0000-0000-0000000000c7', '{}', NULL, NULL, '1.0.0')$q$, 'pc:draft_conflict', 'segundo rascunho sem versão esperada = conflito');

-- Salvar com a versão certa; versão velha = conflito (dois admins)
SELECT pg_sleep(0.01);
INSERT INTO t SELECT 'd2', pc_save_draft(:'org', (SELECT content FROM classification_calibration_versions WHERE status='draft'), NULL, (SELECT (v->>'updatedAt')::timestamptz FROM t WHERE k='d1'), '1.0.0');
SELECT pg_temp.assert((SELECT (v->>'updatedAt') <> (SELECT v->>'updatedAt' FROM t WHERE k='d1') FROM t WHERE k='d2'), 'salvar atualiza o carimbo');
SELECT pg_temp.expect_error(format($q$SELECT pc_save_draft('00000000-0000-0000-0000-0000000000c7', '{}', NULL, %L, '1.0.0')$q$, (SELECT v->>'updatedAt' FROM t WHERE k='d1')), 'pc:draft_conflict', 'versão velha não sobrescreve');

-- Publicar: nota obrigatória, versão esperada, transação
SELECT pg_temp.expect_error(format($q$SELECT pc_publish_calibration('00000000-0000-0000-0000-0000000000c7', NULL, '  ', %L)$q$, (SELECT v->>'updatedAt' FROM t WHERE k='d2')), 'pc:note_required', 'publicar exige nota');
SELECT pg_temp.expect_error(format($q$SELECT pc_publish_calibration('00000000-0000-0000-0000-0000000000c7', NULL, 'x', %L)$q$, (SELECT v->>'updatedAt' FROM t WHERE k='d1')), 'pc:draft_conflict', 'publica só o rascunho conferido');
SELECT pc_publish_calibration(:'org', '00000000-0000-0000-0000-0000000000a1', 'Selo forte 70', (SELECT (v->>'updatedAt')::timestamptz FROM t WHERE k='d2'));
SELECT pg_temp.assert((SELECT array_agg(number || ':' || status ORDER BY number) FROM classification_calibration_versions WHERE organization_id = :'org')
  = ARRAY['1:archived','2:archived','3:published'], 'v3 publicada, v2 arquivada');
SELECT pg_temp.assert((SELECT note = 'Selo forte 70' AND published_by = '00000000-0000-0000-0000-0000000000a1' AND (content->'_geral'->>'selo_forte')::int = 70
  FROM classification_calibration_versions WHERE number = 3), 'publicada com nota, autor e conteúdo');
SELECT pg_temp.expect_error($q$UPDATE classification_calibration_versions SET content = '{}' WHERE number = 3$q$, '%calibration_immutable%', 'publicada não muda (§10.6)');
SELECT pg_temp.expect_error(format($q$SELECT pc_publish_calibration('00000000-0000-0000-0000-0000000000c7', NULL, 'x', %L)$q$, now()), 'pc:no_draft', 'sem rascunho não publica');

-- Restaurar = novo rascunho a partir de uma versão antiga (v1), número seguinte; descartar apaga só o rascunho
SELECT pc_save_draft(:'org', (SELECT content FROM classification_calibration_versions WHERE number = 1), NULL, NULL, '1.0.0');
SELECT pg_temp.assert((SELECT number = 4 AND (content->'_faixas'->'comissao') = '[50,110,180,300]' FROM classification_calibration_versions WHERE status = 'draft'), 'restaurar v1 cria o rascunho nº 4');
SELECT pg_temp.assert(pc_discard_draft(:'org'), 'descarta');
SELECT pg_temp.assert(NOT pc_discard_draft(:'org'), 'nada para descartar');
SELECT pg_temp.assert((SELECT count(*) = 3 FROM classification_calibration_versions), 'histórico intacto');

-- Classificações antigas mantêm a versão que usaram (§8.2)
SELECT pg_temp.assert(NOT EXISTS (SELECT 1 FROM process_classifications), 'sem classificações neste teste');

SET LOCAL ROLE authenticated;
SELECT pg_temp.expect_error($q$SELECT pc_save_draft(NULL, NULL, NULL, NULL, NULL)$q$, '%permission denied%', 'navegador não grava rascunho');
SELECT pg_temp.expect_error($q$SELECT pc_publish_calibration(NULL, NULL, NULL, NULL)$q$, '%permission denied%', 'navegador não publica');
RESET ROLE;
SELECT 'process_classification_calibration: OK' AS resultado;
ROLLBACK;
