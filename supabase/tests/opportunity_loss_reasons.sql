-- Motivos de perda (20261110120000..120400): banco descartável, fixture mínima própria.
-- psql -d BANCO_DESCARTAVEL -v ON_ERROR_STOP=1 -f supabase/tests/opportunity_loss_reasons.sql
BEGIN;
SET LOCAL lc_messages = 'C';
DO $$ BEGIN IF NOT EXISTS(SELECT FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
  IF NOT EXISTS(SELECT FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon NOLOGIN; END IF;
  IF NOT EXISTS(SELECT FROM pg_roles WHERE rolname='service_role') THEN CREATE ROLE service_role NOLOGIN; END IF; END $$;
CREATE SCHEMA IF NOT EXISTS auth;
CREATE OR REPLACE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$SELECT nullif(current_setting('test.role', true), '')$$;
CREATE TYPE public.opportunity_status AS ENUM ('open', 'won', 'lost');
CREATE TYPE public.pipeline_stage_type AS ENUM ('custom', 'won', 'lost');
CREATE TABLE public.organizations(id uuid PRIMARY KEY);
CREATE TABLE public.users(id uuid PRIMARY KEY, nome text UNIQUE);
CREATE TABLE public.pipeline_stages(id uuid PRIMARY KEY, organization_id uuid, name text, order_index int, type public.pipeline_stage_type DEFAULT 'custom');
CREATE TABLE public.opportunities(id uuid PRIMARY KEY, organization_id uuid, status public.opportunity_status DEFAULT 'open',
  pipeline_stage_id uuid, close_date date, updated_by uuid, deleted_at timestamptz);
CREATE TABLE public.opportunity_close_policies(organization_id uuid PRIMARY KEY, mode text DEFAULT 'off');
-- perfis de teste: test.user = nome do usuário
CREATE TABLE public.perfis(nome text PRIMARY KEY, org uuid, admin boolean, editar boolean, perms jsonb);
CREATE FUNCTION public.current_user_id() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT id FROM public.users WHERE nome = current_setting('test.user', true)$$;
CREATE FUNCTION public.current_user_org_ids() RETURNS uuid[] LANGUAGE sql STABLE AS $$
  SELECT coalesce(array_agg(org), '{}') FROM public.perfis WHERE nome = current_setting('test.user', true)$$;
CREATE FUNCTION public.is_org_system_admin(_org uuid) RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT coalesce((SELECT admin FROM public.perfis WHERE nome = current_setting('test.user', true) AND org = _org), false)$$;
CREATE FUNCTION public.my_perms_v2(_org uuid) RETURNS jsonb LANGUAGE sql STABLE AS $$
  SELECT (SELECT perms FROM public.perfis WHERE nome = current_setting('test.user', true) AND org = _org)$$;
CREATE FUNCTION public.user_has_org_permission(_org uuid, _perm text) RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT coalesce((SELECT editar FROM public.perfis WHERE nome = current_setting('test.user', true) AND org = _org), false)$$;
CREATE FUNCTION public.rbac_full_perms() RETURNS jsonb LANGUAGE sql IMMUTABLE AS $$
  SELECT '{"ferramentas":{"certificar_classificacao":true}}'::jsonb$$;
-- status ← etapa (cópia do comportamento de sync_opportunity_status_from_stage)
CREATE FUNCTION public.sync_status() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN
  IF TG_OP = 'INSERT' OR NEW.pipeline_stage_id IS DISTINCT FROM OLD.pipeline_stage_id THEN
    NEW.status := (SELECT CASE type::text WHEN 'won' THEN 'won' WHEN 'lost' THEN 'lost' ELSE 'open' END FROM public.pipeline_stages WHERE id = NEW.pipeline_stage_id)::public.opportunity_status;
  END IF; RETURN NEW; END $$;
CREATE TRIGGER trg_sync_opportunity_status_from_stage BEFORE INSERT OR UPDATE ON public.opportunities FOR EACH ROW EXECUTE FUNCTION public.sync_status();
GRANT USAGE ON SCHEMA public, auth TO authenticated, service_role;
GRANT SELECT, UPDATE ON public.opportunities TO authenticated;
GRANT SELECT ON public.pipeline_stages, public.users, public.perfis TO authenticated;

\ir ../migrations/20261019190000_opportunity_reopen_control.sql
\ir ../migrations/20261110120000_loss_reasons_catalog.sql
\ir ../migrations/20261110120100_loss_settings.sql
\ir ../migrations/20261110120200_opportunity_losses.sql
\ir ../migrations/20261110120300_loss_rpcs_and_guard.sql
\ir ../migrations/20261110120400_loss_stage_rules.sql
\ir ../migrations/20261110130000_loss_codes_auto.sql

CREATE FUNCTION pg_temp.assert(ok boolean, message text) RETURNS void LANGUAGE plpgsql AS $$BEGIN IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'FAIL: %', message; END IF; END$$;
CREATE FUNCTION pg_temp.como(quem text, jwt text) RETURNS void LANGUAGE sql AS $$
  SELECT set_config('test.user', quem, true), set_config('test.role', jwt, true)$$;
-- roda SQL como `quem` e devolve 'ok' ou a mensagem de erro
CREATE FUNCTION pg_temp.tenta(quem text, jwt text, cmd text) RETURNS text LANGUAGE plpgsql AS $$
BEGIN
  PERFORM pg_temp.como(quem, jwt);
  BEGIN EXECUTE cmd; RETURN 'ok';
  EXCEPTION WHEN OTHERS THEN RETURN SQLERRM;
  END;
END $$;

-- Org A (configura motivos) e org B (não configura nada)
INSERT INTO public.organizations VALUES ('a0000000-0000-0000-0000-00000000000a'), ('b0000000-0000-0000-0000-00000000000b');
INSERT INTO public.users VALUES ('10000000-0000-0000-0000-000000000001','admin'), ('10000000-0000-0000-0000-000000000002','consultor'),
  ('10000000-0000-0000-0000-000000000003','gestor'), ('10000000-0000-0000-0000-000000000004','configurador'), ('10000000-0000-0000-0000-000000000005','consultor_b');
INSERT INTO public.perfis VALUES
  ('admin','a0000000-0000-0000-0000-00000000000a', true, true, '{}'),
  ('consultor','a0000000-0000-0000-0000-00000000000a', false, true, '{"ferramentas":{}}'),
  ('gestor','a0000000-0000-0000-0000-00000000000a', false, true, '{"ferramentas":{"corrigir_motivo_perda":true}}'),
  ('configurador','a0000000-0000-0000-0000-00000000000a', false, false, '{"administracao":{"config":true}}'),
  ('consultor_b','b0000000-0000-0000-0000-00000000000b', false, true, '{}');
INSERT INTO public.pipeline_stages VALUES
  ('5a000000-0000-0000-0000-000000000001','a0000000-0000-0000-0000-00000000000a','Etapa 1',1,'custom'),
  ('5a000000-0000-0000-0000-000000000002','a0000000-0000-0000-0000-00000000000a','Etapa 2',2,'custom'),
  ('5a000000-0000-0000-0000-0000000000a1','a0000000-0000-0000-0000-00000000000a','Ganho',8,'won'),
  ('5a000000-0000-0000-0000-0000000000a2','a0000000-0000-0000-0000-00000000000a','Perdido',9,'lost'),
  ('5b000000-0000-0000-0000-000000000001','b0000000-0000-0000-0000-00000000000b','Novo',1,'custom'),
  ('5b000000-0000-0000-0000-0000000000a2','b0000000-0000-0000-0000-00000000000b','Perdido',9,'lost');
INSERT INTO public.opportunities(id, organization_id, pipeline_stage_id) VALUES
  ('0a000000-0000-0000-0000-000000000001','a0000000-0000-0000-0000-00000000000a','5a000000-0000-0000-0000-000000000002'),
  ('0a000000-0000-0000-0000-000000000002','a0000000-0000-0000-0000-00000000000a','5a000000-0000-0000-0000-000000000001'),
  ('0a000000-0000-0000-0000-000000000003','a0000000-0000-0000-0000-00000000000a','5a000000-0000-0000-0000-000000000001'),
  ('0a000000-0000-0000-0000-000000000004','a0000000-0000-0000-0000-00000000000a','5a000000-0000-0000-0000-000000000001'),
  ('0a000000-0000-0000-0000-000000000005','a0000000-0000-0000-0000-00000000000a','5a000000-0000-0000-0000-000000000001'),
  ('0a000000-0000-0000-0000-000000000006','a0000000-0000-0000-0000-00000000000a','5a000000-0000-0000-0000-000000000001'),
  ('0b000000-0000-0000-0000-000000000001','b0000000-0000-0000-0000-00000000000b','5b000000-0000-0000-0000-000000000001');

SET LOCAL ROLE authenticated;

-- ── Permissões do cadastro ────────────────────────────────────────────────────
SELECT pg_temp.assert(pg_temp.tenta('consultor','authenticated',
  $q$INSERT INTO public.opportunity_loss_reasons(organization_id, name) VALUES ('a0000000-0000-0000-0000-00000000000a','Consultor')$q$)
  LIKE '%row-level security%', 'consultor não cadastra motivo');
SELECT pg_temp.assert(pg_temp.tenta('configurador','authenticated',
  $q$INSERT INTO public.opportunity_loss_reasons(id, organization_id, name, order_index) VALUES
    ('7a000000-0000-0000-0000-00000000000a','a0000000-0000-0000-0000-00000000000a','Sem direito',1)$q$) = 'ok',
  'Administração → Configurações cadastra motivo');
SELECT pg_temp.assert(pg_temp.tenta('admin','authenticated',
  $q$INSERT INTO public.opportunity_loss_reasons(id, organization_id, name, order_index) VALUES
    ('7a000000-0000-0000-0000-00000000000b','a0000000-0000-0000-0000-00000000000a','Parou de responder',2),
    ('7a000000-0000-0000-0000-00000000000c','a0000000-0000-0000-0000-00000000000a','Desistiu',3)$q$) = 'ok',
  'perfil de sistema cadastra motivo');
SELECT pg_temp.assert((SELECT created_by FROM public.opportunity_loss_reasons WHERE code = 'A') = '10000000-0000-0000-0000-000000000004', 'carimba quem criou');
SELECT pg_temp.assert((SELECT string_agg(code, ',' ORDER BY order_index) FROM public.opportunity_loss_reasons) = 'A,B,C', 'motivos recebem letras em sequência');
-- código informado é ignorado; apagado não volta
SELECT pg_temp.assert(pg_temp.tenta('admin','authenticated',
  $q$INSERT INTO public.opportunity_loss_reasons(organization_id, code, name) VALUES ('a0000000-0000-0000-0000-00000000000a','A','Tentando escolher')$q$) = 'ok',
  'insert com código informado passa');
SELECT pg_temp.como('admin','authenticated');
SELECT pg_temp.assert((SELECT code FROM public.opportunity_loss_reasons WHERE name = 'Tentando escolher') = 'D', 'código informado é ignorado: gera D');
SELECT pg_temp.assert(pg_temp.tenta('admin','authenticated',
  $q$DELETE FROM public.opportunity_loss_reasons WHERE name = 'Tentando escolher'$q$) = 'ok', 'motivo nunca usado é apagado');
SELECT pg_temp.assert(pg_temp.tenta('admin','authenticated',
  $q$INSERT INTO public.opportunity_loss_reasons(organization_id, name, is_active) VALUES ('a0000000-0000-0000-0000-00000000000a','Depois do apagado', false)$q$) = 'ok', 'cria outro');
SELECT pg_temp.como('admin','authenticated');
SELECT pg_temp.assert((SELECT code FROM public.opportunity_loss_reasons WHERE name = 'Depois do apagado') = 'E', 'letra de motivo apagado não é reaproveitada');
SELECT pg_temp.assert(pg_temp.tenta('admin','authenticated',
  $q$UPDATE public.opportunity_loss_reasons SET code = 'Z' WHERE name = 'Depois do apagado'$q$) = 'loss_code_immutable', 'código de motivo não muda');
SELECT pg_temp.assert(pg_temp.tenta('admin','authenticated',
  $q$INSERT INTO public.opportunity_loss_reason_details(id, organization_id, reason_id, name, requires_description, automation_only, help_text) VALUES
    ('7d000000-0000-0000-0000-0000000000a1','a0000000-0000-0000-0000-00000000000a','7a000000-0000-0000-0000-00000000000a','Nunca contribuiu', false, false, 'Use quando o extrato não tem contribuição'),
    ('7d000000-0000-0000-0000-0000000000a7','a0000000-0000-0000-0000-00000000000a','7a000000-0000-0000-0000-00000000000a','Outro caso', true, false, null),
    ('7d000000-0000-0000-0000-0000000000b1','a0000000-0000-0000-0000-00000000000a','7a000000-0000-0000-0000-00000000000b','Sem resposta etapa 1', false, true, null),
    ('7d000000-0000-0000-0000-0000000000c1','a0000000-0000-0000-0000-00000000000a','7a000000-0000-0000-0000-00000000000c','Achou caro', false, false, null)$q$) = 'ok',
  'cadastra detalhes');
SELECT pg_temp.como('admin','authenticated');
SELECT pg_temp.assert((SELECT string_agg(code, ',' ORDER BY code) FROM public.opportunity_loss_reason_details) = 'A1,A2,B1,C1', 'detalhes: código do motivo + número em sequência');
SELECT pg_temp.assert(pg_temp.tenta('admin','authenticated',
  $q$UPDATE public.opportunity_loss_reason_details SET help_text = E'duas\nlinhas' WHERE code = 'A1'$q$) LIKE '%check constraint%',
  'texto de ajuda tem uma linha só');
SELECT pg_temp.assert(pg_temp.tenta('admin','authenticated',
  $q$UPDATE public.opportunity_loss_reason_details SET reason_id = '7a000000-0000-0000-0000-00000000000c' WHERE code = 'A1'$q$) = 'loss_detail_reason_immutable',
  'detalhe não muda de motivo');
SELECT pg_temp.assert(pg_temp.tenta('consultor_b','authenticated',
  $q$INSERT INTO public.opportunity_loss_reason_details(organization_id, reason_id, name) VALUES
    ('b0000000-0000-0000-0000-00000000000b','7a000000-0000-0000-0000-00000000000a','Intruso')$q$) <> 'ok',
  'outra org não pendura detalhe em motivo alheio');
SELECT pg_temp.como('consultor_b','authenticated');
SELECT pg_temp.assert((SELECT count(*) FROM public.opportunity_loss_reasons) = 0, 'RLS: outra org não enxerga o cadastro');

-- ── Opções para a pessoa ─────────────────────────────────────────────────────
SELECT pg_temp.como('consultor','authenticated');
SELECT pg_temp.assert((public.list_loss_reason_options_v1('a0000000-0000-0000-0000-00000000000a') ->> 'reason_required')::boolean, 'org com motivo ativo: obrigatório');
SELECT pg_temp.assert(NOT (public.list_loss_reason_options_v1('a0000000-0000-0000-0000-00000000000a')::text LIKE '%B1%'), 'detalhe só de automação não aparece para a pessoa');
SELECT pg_temp.assert(public.list_loss_reason_options_v1('a0000000-0000-0000-0000-00000000000a')::text LIKE '%Use quando o extrato%', 'texto de ajuda vem nas opções');
SELECT pg_temp.como('consultor_b','authenticated');
SELECT pg_temp.assert(NOT (public.list_loss_reason_options_v1('b0000000-0000-0000-0000-00000000000b') ->> 'reason_required')::boolean, 'org sem motivo: não obrigatório');

-- ── Org que não configurou nada continua como antes ──────────────────────────
SELECT pg_temp.assert(pg_temp.tenta('consultor_b','authenticated',
  $q$UPDATE public.opportunities SET pipeline_stage_id = '5b000000-0000-0000-0000-0000000000a2' WHERE id = '0b000000-0000-0000-0000-000000000001'$q$) = 'ok',
  'org B perde pelo Kanban sem motivo');
SELECT pg_temp.como('consultor_b','authenticated');
SELECT pg_temp.assert((SELECT actor_type = 'user' AND actor_user_id = '10000000-0000-0000-0000-000000000005' AND reason_id IS NULL
  AND stage_id_at_loss = '5b000000-0000-0000-0000-000000000001' FROM public.opportunity_losses
  WHERE opportunity_id = '0b000000-0000-0000-0000-000000000001'), 'perda sem motivo fica no histórico com quem e etapa');

-- ── Trava nos caminhos diretos (org A tem motivo ativo) ──────────────────────
SELECT pg_temp.assert(pg_temp.tenta('consultor','authenticated',
  $q$UPDATE public.opportunities SET pipeline_stage_id = '5a000000-0000-0000-0000-0000000000a2' WHERE id = '0a000000-0000-0000-0000-000000000001'$q$) = 'loss_reason_required',
  'Kanban/update direto não perde sem motivo');
SELECT pg_temp.assert(pg_temp.tenta('consultor','service_role',
  $q$UPDATE public.opportunities SET pipeline_stage_id = '5a000000-0000-0000-0000-0000000000a2' WHERE id = '0a000000-0000-0000-0000-000000000004'$q$) = 'ok',
  'service_role (integração) passa');
SELECT pg_temp.assert((SELECT actor_type FROM public.opportunity_losses WHERE opportunity_id = '0a000000-0000-0000-0000-000000000004') = 'system',
  'e fica registrado como sistema');

-- ── Marcar como Perdida pela RPC ─────────────────────────────────────────────
SELECT pg_temp.assert(pg_temp.tenta('consultor','authenticated',
  $q$SELECT public.mark_opportunity_lost_v1('a0000000-0000-0000-0000-00000000000a','0a000000-0000-0000-0000-000000000001',NULL,NULL,NULL,NULL,'teste')$q$) = 'loss_reason_required',
  'RPC sem motivo recusa');
SELECT pg_temp.assert(pg_temp.tenta('consultor','authenticated',
  $q$SELECT public.mark_opportunity_lost_v1('a0000000-0000-0000-0000-00000000000a','0a000000-0000-0000-0000-000000000001',NULL,'7d000000-0000-0000-0000-0000000000b1',NULL,NULL,'teste')$q$) = 'loss_detail_automation_only',
  'pessoa não marca detalhe só de automação');
SELECT pg_temp.assert(pg_temp.tenta('consultor','authenticated',
  $q$SELECT public.mark_opportunity_lost_v1('a0000000-0000-0000-0000-00000000000a','0a000000-0000-0000-0000-000000000001',NULL,'7d000000-0000-0000-0000-0000000000a7','   ',NULL,'teste')$q$) = 'loss_description_required',
  'detalhe que exige descrição não salva sem texto');
SELECT pg_temp.assert(pg_temp.tenta('consultor','authenticated',
  $q$SELECT public.mark_opportunity_lost_v1('a0000000-0000-0000-0000-00000000000a','0a000000-0000-0000-0000-000000000001','7a000000-0000-0000-0000-00000000000c','7d000000-0000-0000-0000-0000000000a1',NULL,NULL,'teste')$q$) = 'loss_detail_reason_mismatch',
  'detalhe precisa ser do motivo');
SELECT pg_temp.assert(pg_temp.tenta('configurador','authenticated',
  $q$SELECT public.mark_opportunity_lost_v1('a0000000-0000-0000-0000-00000000000a','0a000000-0000-0000-0000-000000000001','7a000000-0000-0000-0000-00000000000a',NULL,NULL,NULL,'teste')$q$) = 'forbidden_edit_opportunities',
  'só quem move a oportunidade marca perda');

-- detalhe obrigatório
SELECT pg_temp.assert(pg_temp.tenta('admin','authenticated',
  $q$INSERT INTO public.opportunity_loss_settings(organization_id, detail_mode) VALUES ('a0000000-0000-0000-0000-00000000000a','required')$q$) = 'ok', 'admin muda regra geral');
SELECT pg_temp.assert(pg_temp.tenta('consultor','authenticated',
  $q$UPDATE public.opportunity_loss_settings SET detail_mode = 'off'$q$) = 'ok'
  AND (SELECT detail_mode FROM public.opportunity_loss_settings) = 'required', 'consultor não muda regra geral (RLS filtra)');
SELECT pg_temp.assert(pg_temp.tenta('consultor','authenticated',
  $q$SELECT public.mark_opportunity_lost_v1('a0000000-0000-0000-0000-00000000000a','0a000000-0000-0000-0000-000000000001','7a000000-0000-0000-0000-00000000000a',NULL,NULL,NULL,'teste')$q$) = 'loss_detail_required',
  'com detalhe obrigatório não salva sem detalhe');
SELECT pg_temp.assert(pg_temp.tenta('consultor','authenticated',
  $q$SELECT public.mark_opportunity_lost_v1('a0000000-0000-0000-0000-00000000000a','0a000000-0000-0000-0000-000000000003','7a000000-0000-0000-0000-00000000000b',NULL,NULL,NULL,'teste')$q$) = 'ok',
  'motivo cujos detalhes são todos só de automação não exige detalhe da pessoa');

SELECT pg_temp.assert(pg_temp.tenta('consultor','authenticated',
  $q$SELECT public.mark_opportunity_lost_v1('a0000000-0000-0000-0000-00000000000a','0a000000-0000-0000-0000-000000000001',NULL,'7d000000-0000-0000-0000-0000000000a7','Extrato sem contribuição','2026-11-10','teste')$q$) = 'ok',
  'perde com detalhe + descrição');
SELECT pg_temp.como('consultor','authenticated');
SELECT pg_temp.assert((SELECT o.status::text = 'lost' AND o.pipeline_stage_id = '5a000000-0000-0000-0000-0000000000a2' AND o.close_date = '2026-11-10'
  FROM public.opportunities o WHERE id = '0a000000-0000-0000-0000-000000000001'), 'oportunidade foi para Perdido');
SELECT pg_temp.assert((SELECT reason_code = 'A' AND detail_code = 'A2' AND description = 'Extrato sem contribuição' AND actor_type = 'user'
  AND actor_user_id = '10000000-0000-0000-0000-000000000002' AND stage_id_at_loss = '5a000000-0000-0000-0000-000000000002'
  FROM public.opportunity_losses WHERE opportunity_id = '0a000000-0000-0000-0000-000000000001'), 'grava códigos, descrição, quem e etapa');
SELECT pg_temp.assert(pg_temp.tenta('consultor','authenticated',
  $q$SELECT public.mark_opportunity_lost_v1('a0000000-0000-0000-0000-00000000000a','0a000000-0000-0000-0000-000000000001',NULL,'7d000000-0000-0000-0000-0000000000a1',NULL,NULL,'teste')$q$) = 'opportunity_already_lost',
  'não perde duas vezes sem reabrir');

-- ── Integridade do cadastro depois de usado ──────────────────────────────────
SELECT pg_temp.assert(pg_temp.tenta('admin','authenticated',
  $q$UPDATE public.opportunity_loss_reason_details SET code = 'A9' WHERE code = 'A2'$q$) = 'loss_code_immutable', 'código usado não muda');
SELECT pg_temp.assert(pg_temp.tenta('admin','authenticated',
  $q$UPDATE public.opportunity_loss_reason_details SET name = 'Outro caso (revisado)' WHERE code = 'A2'$q$) = 'ok', 'nome muda à vontade');
SELECT pg_temp.assert(pg_temp.tenta('admin','authenticated',
  $q$DELETE FROM public.opportunity_loss_reason_details WHERE code = 'A2'$q$) = 'loss_detail_in_use', 'detalhe usado não é apagado');
SELECT pg_temp.assert(pg_temp.tenta('admin','authenticated',
  $q$DELETE FROM public.opportunity_loss_reasons WHERE code = 'A'$q$) = 'loss_reason_in_use', 'motivo com detalhe usado não é apagado');
SELECT pg_temp.assert(pg_temp.tenta('admin','authenticated',
  $q$UPDATE public.opportunity_loss_reason_details SET code = 'C9' WHERE code = 'C1'$q$) = 'loss_code_immutable', 'código não muda nem sem uso');
SELECT pg_temp.assert(pg_temp.tenta('admin','authenticated',
  $q$INSERT INTO public.opportunity_loss_reason_details(organization_id, reason_id, name) VALUES
    ('a0000000-0000-0000-0000-00000000000a','7a000000-0000-0000-0000-00000000000c','Temporário')$q$) = 'ok', 'cria C2');
SELECT pg_temp.assert(pg_temp.tenta('admin','authenticated',
  $q$DELETE FROM public.opportunity_loss_reason_details WHERE name = 'Temporário'$q$) = 'ok', 'apaga C2 nunca usado');
SELECT pg_temp.assert(pg_temp.tenta('admin','authenticated',
  $q$INSERT INTO public.opportunity_loss_reason_details(organization_id, reason_id, name) VALUES
    ('a0000000-0000-0000-0000-00000000000a','7a000000-0000-0000-0000-00000000000c','Novo')$q$) = 'ok', 'cria outro detalhe em C');
SELECT pg_temp.como('admin','authenticated');
SELECT pg_temp.assert((SELECT code FROM public.opportunity_loss_reason_details WHERE name = 'Novo') = 'C3', 'número de detalhe apagado não é reaproveitado');
SELECT pg_temp.como('admin','authenticated');
SELECT public.loss_reason_usage_v1('a0000000-0000-0000-0000-00000000000a');
SELECT pg_temp.assert((public.loss_reason_usage_v1('a0000000-0000-0000-0000-00000000000a') #>> '{details,7d000000-0000-0000-0000-0000000000a7}')::int = 1, 'uso por detalhe');

-- ── Correção ─────────────────────────────────────────────────────────────────
SELECT pg_temp.assert(pg_temp.tenta('consultor','authenticated',
  $q$SELECT public.correct_opportunity_loss_v1('a0000000-0000-0000-0000-00000000000a','0a000000-0000-0000-0000-000000000001',NULL,'7d000000-0000-0000-0000-0000000000a1',NULL)$q$) = 'forbidden_correct_loss',
  'consultor sem permissão não corrige');
SELECT pg_temp.assert(pg_temp.tenta('gestor','authenticated',
  $q$SELECT public.correct_opportunity_loss_v1('a0000000-0000-0000-0000-00000000000a','0a000000-0000-0000-0000-000000000001',NULL,'7d000000-0000-0000-0000-0000000000a1',NULL)$q$) = 'ok',
  'perfil com Corrigir motivo corrige');
SELECT pg_temp.como('gestor','authenticated');
SELECT pg_temp.assert((SELECT detail_code FROM public.opportunity_losses WHERE opportunity_id = '0a000000-0000-0000-0000-000000000001') = 'A1', 'perda corrigida');
SELECT pg_temp.assert((SELECT old_detail_code = 'A2' AND old_description = 'Extrato sem contribuição' AND new_detail_code = 'A1'
  AND corrected_by = '10000000-0000-0000-0000-000000000003' FROM public.opportunity_loss_corrections), 'correção guarda valor anterior e quem');
SELECT pg_temp.assert((rbac_full_perms() #>> '{ferramentas,corrigir_motivo_perda}')::boolean, 'Admin recebe a chave nova');

-- ── Reabrir e perder de novo ─────────────────────────────────────────────────
SELECT pg_temp.assert(pg_temp.tenta('consultor','authenticated',
  $q$SELECT public.reopen_opportunity_v1('a0000000-0000-0000-0000-00000000000a','0a000000-0000-0000-0000-000000000001','teste')$q$) = 'ok', 'reabre');
SELECT pg_temp.como('consultor','authenticated');
SELECT pg_temp.assert((SELECT status::text = 'open' AND pipeline_stage_id = '5a000000-0000-0000-0000-000000000002' AND close_date IS NULL
  FROM public.opportunities WHERE id = '0a000000-0000-0000-0000-000000000001'), 'volta para a etapa em que estava');
SELECT pg_temp.assert((SELECT reopened_at IS NOT NULL AND reopened_by = '10000000-0000-0000-0000-000000000002'
  FROM public.opportunity_losses WHERE opportunity_id = '0a000000-0000-0000-0000-000000000001'), 'perda anterior fica fechada no histórico');
SELECT pg_temp.assert(pg_temp.tenta('consultor','authenticated',
  $q$SELECT public.mark_opportunity_lost_v1('a0000000-0000-0000-0000-00000000000a','0a000000-0000-0000-0000-000000000001',NULL,'7d000000-0000-0000-0000-0000000000a1',NULL,NULL,'teste')$q$) = 'ok',
  'perde de novo');
SELECT pg_temp.assert((SELECT count(*) FROM public.opportunity_losses WHERE opportunity_id = '0a000000-0000-0000-0000-000000000001') = 2, 'duas perdas no histórico');
-- reabrir pelo Kanban (update direto) também fecha a perda
SELECT pg_temp.assert(pg_temp.tenta('consultor','authenticated',
  $q$UPDATE public.opportunities SET pipeline_stage_id = '5a000000-0000-0000-0000-000000000001' WHERE id = '0a000000-0000-0000-0000-000000000001'$q$) = 'ok', 'reabre pelo Kanban');
SELECT pg_temp.assert((SELECT count(*) FROM public.opportunity_losses WHERE opportunity_id = '0a000000-0000-0000-0000-000000000001' AND reopened_at IS NULL) = 0,
  'Kanban fecha a perda em aberto');
-- controle de reabertura continua valendo
RESET ROLE;
INSERT INTO public.opportunity_close_policies(organization_id, control_reopen) VALUES ('a0000000-0000-0000-0000-00000000000a', true);
SET LOCAL ROLE authenticated;
SELECT pg_temp.assert(pg_temp.tenta('consultor','authenticated',
  $q$SELECT public.reopen_opportunity_v1('a0000000-0000-0000-0000-00000000000a','0a000000-0000-0000-0000-000000000003','teste')$q$) = 'reopen_forbidden',
  'com controle de reabertura, consultor não reabre');

-- ── Lote ─────────────────────────────────────────────────────────────────────
SELECT pg_temp.assert(pg_temp.tenta('consultor','authenticated',
  $q$SELECT public.mark_opportunities_lost_batch_v1('a0000000-0000-0000-0000-00000000000a',
    ARRAY['0a000000-0000-0000-0000-000000000002','0a000000-0000-0000-0000-000000000001']::uuid[],NULL,'7d000000-0000-0000-0000-0000000000a1',NULL,NULL,NULL)$q$) = 'ok',
  'lote perde todas com o mesmo detalhe');
SELECT pg_temp.como('consultor','authenticated');
SELECT pg_temp.assert((SELECT count(*) FROM public.opportunity_losses WHERE detail_code = 'A1' AND reopened_at IS NULL AND source = 'batch') = 2, 'lote gravado');

-- ── Inativos ─────────────────────────────────────────────────────────────────
SELECT pg_temp.assert(pg_temp.tenta('admin','authenticated',
  $q$UPDATE public.opportunity_loss_reasons SET is_active = false WHERE code = 'C'$q$) = 'ok', 'inativa motivo');
SELECT pg_temp.como('consultor','authenticated');
SELECT pg_temp.assert(NOT (public.list_loss_reason_options_v1('a0000000-0000-0000-0000-00000000000a')::text ~ 'C[13]'), 'inativar motivo tira os detalhes dele da lista');

-- ── Regra por etapa ──────────────────────────────────────────────────────────
SELECT pg_temp.assert(pg_temp.tenta('consultor','authenticated',
  $q$INSERT INTO public.opportunity_loss_stage_rules(organization_id, stage_id, detail_id) VALUES
    ('a0000000-0000-0000-0000-00000000000a','5a000000-0000-0000-0000-000000000001','7d000000-0000-0000-0000-0000000000b1')$q$) LIKE '%row-level security%',
  'consultor não cria regra por etapa');
SELECT pg_temp.assert(pg_temp.tenta('admin','authenticated',
  $q$INSERT INTO public.opportunity_loss_stage_rules(organization_id, stage_id, detail_id) VALUES
    ('a0000000-0000-0000-0000-00000000000a','5a000000-0000-0000-0000-000000000001','7d000000-0000-0000-0000-0000000000b1')$q$) = 'ok',
  'admin cria regra com detalhe só de automação');
SELECT pg_temp.assert(pg_temp.tenta('admin','authenticated',
  $q$INSERT INTO public.opportunity_loss_stage_rules(organization_id, stage_id, detail_id) VALUES
    ('a0000000-0000-0000-0000-00000000000a','5a000000-0000-0000-0000-0000000000a2','7d000000-0000-0000-0000-0000000000a1')$q$) = 'loss_rule_stage_invalid',
  'regra só em etapa aberta');
SELECT pg_temp.assert(pg_temp.tenta('admin','authenticated',
  $q$INSERT INTO public.opportunity_loss_stage_rules(organization_id, stage_id, detail_id) VALUES
    ('a0000000-0000-0000-0000-00000000000a','5a000000-0000-0000-0000-000000000002','7d000000-0000-0000-0000-0000000000c1')$q$) = 'loss_detail_inactive',
  'regra não aponta para detalhe de motivo inativo');
SELECT pg_temp.assert(pg_temp.tenta('admin','authenticated',
  $q$INSERT INTO public.opportunity_loss_stage_rules(organization_id, stage_id, detail_id) VALUES
    ('a0000000-0000-0000-0000-00000000000a','5a000000-0000-0000-0000-000000000001','7d000000-0000-0000-0000-0000000000a1')$q$)
  LIKE '%opportunity_loss_stage_rules_stage_key%', 'uma regra por etapa');
SELECT pg_temp.assert(pg_temp.tenta('admin','authenticated',
  $q$DELETE FROM public.opportunity_loss_reason_details WHERE code = 'B1'$q$) LIKE '%opportunity_loss_stage_rules_detail_fkey%',
  'detalhe usado numa regra não é apagado');
RESET ROLE; SELECT pg_temp.como('', 'service_role');
SELECT pg_temp.assert(public.loss_stage_rule_detail_v1('5a000000-0000-0000-0000-000000000001') = '7d000000-0000-0000-0000-0000000000b1', 'execução lê o detalhe da regra');
SET LOCAL ROLE authenticated;
SELECT pg_temp.assert(pg_temp.tenta('admin','authenticated',
  $q$UPDATE public.opportunity_loss_reason_details SET is_active = false WHERE code = 'B1'$q$) = 'ok', 'inativa detalhe da regra');
SELECT pg_temp.como('admin','authenticated');
SELECT pg_temp.assert(public.list_loss_stage_rule_issues_v1('a0000000-0000-0000-0000-00000000000a') #>> '{0,issue}' = 'detail_inactive', 'regra com detalhe inativo vira pendência');
SELECT pg_temp.assert(pg_temp.tenta('consultor','authenticated',
  $q$SELECT public.list_loss_stage_rule_issues_v1('a0000000-0000-0000-0000-00000000000a')$q$) = 'forbidden_manage_loss_reasons', 'pendências só para quem administra');
RESET ROLE; SELECT pg_temp.como('', 'service_role');
SELECT pg_temp.assert(public.loss_stage_rule_detail_v1('5a000000-0000-0000-0000-000000000001') IS NULL, 'regra pendente deixa de gerar perda');

-- ── Integração entra pelo núcleo com detalhe só de automação ─────────────────
UPDATE public.opportunity_loss_reason_details SET is_active = true WHERE code = 'B1';
SELECT public.fn_mark_opportunity_lost_internal_v1('a0000000-0000-0000-0000-00000000000a','0a000000-0000-0000-0000-000000000005',
  NULL,'7d000000-0000-0000-0000-0000000000b1',NULL,NULL,'automation',NULL,'lembretes-etapa-1','automation');
SELECT pg_temp.assert((SELECT reason_code = 'B' AND detail_code = 'B1' AND actor_type = 'automation' AND automation_ref = 'lembretes-etapa-1'
  FROM public.opportunity_losses WHERE opportunity_id = '0a000000-0000-0000-0000-000000000005'), 'automação grava detalhe só de automação, com qual automação');

-- ── Detalhe desligado: vale só para pessoas ──────────────────────────────────
UPDATE public.opportunity_loss_settings SET detail_mode = 'off';
SET LOCAL ROLE authenticated;
SELECT pg_temp.assert(pg_temp.tenta('consultor','authenticated',
  $q$SELECT public.mark_opportunity_lost_v1('a0000000-0000-0000-0000-00000000000a','0a000000-0000-0000-0000-000000000006',NULL,'7d000000-0000-0000-0000-0000000000a1',NULL,NULL,'teste')$q$) = 'loss_detail_disabled',
  'detalhe desligado: pessoa não grava detalhe');
SELECT pg_temp.como('consultor','authenticated');
SELECT pg_temp.assert((public.list_loss_reason_options_v1('a0000000-0000-0000-0000-00000000000a') #> '{reasons,0,details}') = '[]'::jsonb,
  'detalhe desligado: opções sem detalhe');
RESET ROLE; SELECT pg_temp.como('', 'service_role');
SELECT public.fn_mark_opportunity_lost_internal_v1('a0000000-0000-0000-0000-00000000000a','0a000000-0000-0000-0000-000000000006',
  NULL,'7d000000-0000-0000-0000-0000000000a1',NULL,NULL,'api',NULL,'api-key:crm-externo','api');
SELECT pg_temp.assert((SELECT detail_code FROM public.opportunity_losses WHERE opportunity_id = '0a000000-0000-0000-0000-000000000006') = 'A1',
  'detalhe desligado: API continua gravando o detalhe pelo código');

-- ── Geração de letras e código já ocupado (cadastro anterior à geração automática) ──
SELECT pg_temp.assert(public.loss_code_letters(1) = 'A' AND public.loss_code_letters(26) = 'Z' AND public.loss_code_letters(27) = 'AA'
  AND public.loss_code_letters(28) = 'AB' AND public.loss_code_letters(52) = 'AZ' AND public.loss_code_letters(53) = 'BA'
  AND public.loss_code_letters(702) = 'ZZ' AND public.loss_code_letters(703) = 'AAA', 'A..Z, AA, AB… em sequência');
ALTER TABLE public.opportunity_loss_reasons DISABLE TRIGGER trg_assign_loss_reason_code;
INSERT INTO public.opportunity_loss_reasons(organization_id, code, name) VALUES ('b0000000-0000-0000-0000-00000000000b','A','Cadastrado à mão');
ALTER TABLE public.opportunity_loss_reasons ENABLE TRIGGER trg_assign_loss_reason_code;
INSERT INTO public.opportunity_loss_reasons(organization_id, name) VALUES ('b0000000-0000-0000-0000-00000000000b','Gerado');
SELECT pg_temp.assert((SELECT code FROM public.opportunity_loss_reasons WHERE name = 'Gerado') = 'B', 'código já ocupado é pulado');
SELECT pg_temp.assert((SELECT code FROM public.opportunity_loss_reasons WHERE name = 'Sem direito') = 'A', 'contador é por organização');

SELECT 'opportunity_loss_reasons: OK' AS resultado;
ROLLBACK;
