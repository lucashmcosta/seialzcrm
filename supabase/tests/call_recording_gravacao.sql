-- Gravação de ligação: resolução por pessoa, flag da v2 por organização,
-- bucket privado e retenção.
-- psql -d BANCO_DESCARTAVEL -v ON_ERROR_STOP=1 -f supabase/tests/call_recording_gravacao.sql
BEGIN;
CREATE FUNCTION pg_temp.assert(ok boolean, message text) RETURNS void LANGUAGE plpgsql AS $$BEGIN IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'FAIL: %',message; END IF; END$$;

-- A resolução que a edge function faz em TypeScript, espelhada aqui para o teste
-- provar a tabela de verdade sem depender do runtime:
--   coalesce(pessoa.recording_enabled, numero.recording_enabled, false)
CREATE FUNCTION pg_temp.resolve(_numero boolean, _pessoa boolean) RETURNS boolean
  LANGUAGE sql IMMUTABLE AS $$ SELECT coalesce(_pessoa, _numero, false) $$;

-- ───────────────────────── resolução por pessoa ─────────────────────────
-- Os quatro casos que importam. O terceiro e o quarto são a razão da coluna
-- existir: um número só para 20 pessoas era tudo ou nada.
SELECT pg_temp.assert(pg_temp.resolve(true,  NULL)  IS TRUE,  'numero ligado + pessoa NULL deve gravar');
SELECT pg_temp.assert(pg_temp.resolve(false, NULL)  IS FALSE, 'numero desligado + pessoa NULL nao deve gravar');
SELECT pg_temp.assert(pg_temp.resolve(true,  false) IS FALSE, 'pessoa false deve VENCER numero ligado');
SELECT pg_temp.assert(pg_temp.resolve(false, true)  IS TRUE,  'pessoa true deve VENCER numero desligado');
SELECT pg_temp.assert(pg_temp.resolve(NULL,  NULL)  IS FALSE, 'sem configuracao nenhuma nao grava');

-- ───────────────────────── a coluna existe e é opcional ─────────────────────────
SELECT pg_temp.assert(
  (SELECT is_nullable='YES' FROM information_schema.columns
    WHERE table_schema='public' AND table_name='organization_phone_number_users'
      AND column_name='recording_enabled'),
  'recording_enabled do usuario tem de ser NULLABLE (NULL = segue o numero)');
SELECT pg_temp.assert(
  (SELECT column_default IS NULL FROM information_schema.columns
    WHERE table_schema='public' AND table_name='organization_phone_number_users'
      AND column_name='recording_enabled'),
  'nao deve ter default: default ligaria ou desligaria todo mundo de uma vez');
SELECT pg_temp.assert(
  (SELECT count(*)=1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='call_recordings' AND column_name='storage_path'),
  'call_recordings.storage_path tem de existir');

-- ───────────────────────── a flag da v2 é por organização ─────────────────────────
-- O que liga a gravação de fato é a CT estar na v2: na v1 o callback procura a
-- ligação por call_sid, que quase nunca é salvo.
--
-- A flag é montada aqui como FIXTURE (e desfeita no ROLLBACK), porque trocá-la
-- em produção é passo operacional que anda junto com o reapontamento do webhook
-- no Twilio -- ver supabase/maintenance/20261019_ct_para_telefonia_v2.sql.
UPDATE feature_flags
   SET organization_ids = array_append(coalesce(organization_ids, array[]::uuid[]),
                                       '40ae935c-a7f7-4ad7-8ea4-91be6404a95f'::uuid)
 WHERE name='telephony_v2'
   AND NOT ('40ae935c-a7f7-4ad7-8ea4-91be6404a95f' = any(coalesce(organization_ids, array[]::uuid[])));

SELECT pg_temp.assert(
  (SELECT is_enabled FROM feature_flags WHERE name='telephony_v2'),
  'telephony_v2 tem de estar ativa');
SELECT pg_temp.assert(
  (SELECT '40ae935c-a7f7-4ad7-8ea4-91be6404a95f' = ANY(organization_ids)
     FROM feature_flags WHERE name='telephony_v2'),
  'a Central Trabalhista tem de estar na v2 -- sem isso nada e gravado');
-- E não pode valer para todas: lista vazia liberaria toda organização de uma vez.
SELECT pg_temp.assert(
  (SELECT coalesce(array_length(organization_ids,1),0) > 0
     FROM feature_flags WHERE name='telephony_v2'),
  'organization_ids vazio liberaria a v2 para TODAS as organizacoes');

-- ───────────────────────── bucket privado ─────────────────────────
SELECT pg_temp.assert(
  (SELECT count(*)=1 FROM storage.buckets WHERE id='call-recordings'),
  'o bucket call-recordings tem de existir');
SELECT pg_temp.assert(
  (SELECT public IS FALSE FROM storage.buckets WHERE id='call-recordings'),
  'o bucket NAO pode ser publico: e gravacao de ligacao com cliente');
-- Leitura existe e é por organização; escrita e remoção não são expostas.
SELECT pg_temp.assert(
  (SELECT count(*)=1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects'
     AND policyname='call_recordings_select'),
  'deve haver politica de leitura para o bucket');
SELECT pg_temp.assert(
  (SELECT qual LIKE '%user_has_org_access%' FROM pg_policies
    WHERE schemaname='storage' AND tablename='objects' AND policyname='call_recordings_select'),
  'a leitura tem de ser restrita a organizacao dona da gravacao');
SELECT pg_temp.assert(
  (SELECT count(*)=0 FROM pg_policies WHERE schemaname='storage' AND tablename='objects'
     AND policyname IN ('call_recordings_insert','call_recordings_delete')),
  'escrever e apagar audio nao pode ser exposto a authenticated');

-- ───────────────────────── retenção ─────────────────────────
-- Sem schema novo: a chave entra no mesmo jsonb que já guarda a da transcrição.
SELECT pg_temp.assert(
  (SELECT count(*)=0 FROM intelligence_settings
    WHERE privacy IS NOT NULL AND NOT (privacy ? 'call_recording_retention_days')),
  'toda organizacao com intelligence_settings precisa da chave de retencao da gravacao');
SELECT pg_temp.assert(
  (SELECT (privacy->>'call_recording_retention_days')::int = 180
     FROM intelligence_settings WHERE organization_id='40ae935c-a7f7-4ad7-8ea4-91be6404a95f'),
  'retencao da CT deve comecar em 180 dias, igual a da transcricao');
-- 0 significa "nunca apagar" no cron que já existe; o teste fixa esse contrato.
SELECT pg_temp.assert(
  (SELECT coalesce((privacy->>'call_recording_retention_days')::int,-1) >= 0
     FROM intelligence_settings WHERE organization_id='40ae935c-a7f7-4ad7-8ea4-91be6404a95f'),
  'retencao negativa nao faz sentido');

-- ───────────────────────── gravação ligada no número da CT ─────────────────────────
SELECT pg_temp.assert(
  (SELECT recording_enabled IS TRUE FROM organization_phone_numbers
    WHERE organization_id='40ae935c-a7f7-4ad7-8ea4-91be6404a95f' AND is_active),
  'o numero principal da CT tem de estar com recording_enabled = true');
-- E as outras organizações não podem ter sido afetadas de carona. A Viagi já
-- gravava antes desta entrega (é a única com gravação recente, 45 em 30 dias);
-- blueviza e Plamev não gravam e têm de continuar assim.
SELECT pg_temp.assert(
  (SELECT count(*) = 1 FROM organization_phone_numbers n
     JOIN organizations o ON o.id = n.organization_id
    WHERE n.organization_id <> '40ae935c-a7f7-4ad7-8ea4-91be6404a95f'
      AND n.recording_enabled IS TRUE),
  'alem da CT, so a Viagi pode estar gravando -- a migration nao pode ligar organizacao alheia');
SELECT pg_temp.assert(
  (SELECT count(*) = 0 FROM organization_phone_numbers n
     JOIN organizations o ON o.id = n.organization_id
    WHERE o.name IN ('blueviza','Plamev') AND n.recording_enabled IS TRUE),
  'blueviza e Plamev nao podem ter ganhado gravacao');

SELECT 'ok - gravacao de ligacao' AS result;
ROLLBACK;
