-- Geração automática de código (20261110130000) sobre cadastro já existente: banco descartável, mesma fixture.
-- psql -d BANCO_DESCARTAVEL -v ON_ERROR_STOP=1 -f supabase/tests/opportunity_loss_codes_backfill.sql
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

INSERT INTO public.organizations VALUES ('c0000000-0000-0000-0000-00000000000c');
-- cadastro feito à mão antes da geração automática (como o "T"/"T1" de teste em produção)
INSERT INTO public.opportunity_loss_reasons(id, organization_id, code, name) VALUES
  ('7c000000-0000-0000-0000-000000000001','c0000000-0000-0000-0000-00000000000c','T','Teste'),
  ('7c000000-0000-0000-0000-000000000002','c0000000-0000-0000-0000-00000000000c','A','Já era A');
INSERT INTO public.opportunity_loss_reason_details(organization_id, reason_id, code, name) VALUES
  ('c0000000-0000-0000-0000-00000000000c','7c000000-0000-0000-0000-000000000001','T1','xxxx'),
  ('c0000000-0000-0000-0000-00000000000c','7c000000-0000-0000-0000-000000000001','T5','pulado'),
  ('c0000000-0000-0000-0000-00000000000c','7c000000-0000-0000-0000-000000000001','OUTRO','fora do padrão');

\ir ../migrations/20261110130000_loss_codes_auto.sql

CREATE FUNCTION pg_temp.assert(ok boolean, message text) RETURNS void LANGUAGE plpgsql AS $$BEGIN IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'FAIL: %', message; END IF; END$$;
SELECT pg_temp.assert((SELECT last_value FROM public.opportunity_loss_code_counters WHERE scope = 'detail:7c000000-0000-0000-0000-000000000001') = 5,
  'contador de detalhe começa no maior número já usado');
INSERT INTO public.opportunity_loss_reason_details(organization_id, reason_id, name) VALUES
  ('c0000000-0000-0000-0000-00000000000c','7c000000-0000-0000-0000-000000000001','novo');
SELECT pg_temp.assert((SELECT code FROM public.opportunity_loss_reason_details WHERE name = 'novo') = 'T6', 'próximo detalhe de T é T6');
INSERT INTO public.opportunity_loss_reasons(organization_id, name) VALUES ('c0000000-0000-0000-0000-00000000000c','Primeiro gerado');
SELECT pg_temp.assert((SELECT code FROM public.opportunity_loss_reasons WHERE name = 'Primeiro gerado') = 'B', 'motivo gerado pula A já ocupado');
INSERT INTO public.opportunity_loss_reason_details(organization_id, reason_id, name) VALUES
  ('c0000000-0000-0000-0000-00000000000c','7c000000-0000-0000-0000-000000000002','do A antigo');
SELECT pg_temp.assert((SELECT code FROM public.opportunity_loss_reason_details WHERE name = 'do A antigo') = 'A1', 'motivo sem detalhes começa no 1');

SELECT 'opportunity_loss_codes_backfill: OK' AS resultado;
ROLLBACK;
