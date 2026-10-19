-- Controle de reabertura (20261019190000): banco descartável, fixture mínima própria.
-- psql -d BANCO_DESCARTAVEL -v ON_ERROR_STOP=1 -f supabase/tests/opportunity_reopen_guard.sql
BEGIN;
DO $$ BEGIN IF NOT EXISTS(SELECT FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
  IF NOT EXISTS(SELECT FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon NOLOGIN; END IF; END $$;
CREATE SCHEMA IF NOT EXISTS auth;
CREATE OR REPLACE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$SELECT nullif(current_setting('test.role', true), '')$$;
CREATE TABLE public.opportunity_close_policies(organization_id uuid PRIMARY KEY, mode text, control_reopen_placeholder int);
CREATE TABLE public.opportunities(id uuid PRIMARY KEY, organization_id uuid, status text, pipeline_stage_id uuid);
CREATE TABLE public.perfis(user_id text PRIMARY KEY, admin boolean, perms jsonb);
GRANT SELECT, UPDATE ON public.opportunities TO authenticated;
CREATE FUNCTION public.is_org_system_admin(_org uuid) RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT COALESCE((SELECT admin FROM public.perfis WHERE user_id = current_setting('test.user', true)), false)$$;
CREATE FUNCTION public.my_perms_v2(_org uuid) RETURNS jsonb LANGUAGE sql STABLE AS $$
  SELECT (SELECT perms FROM public.perfis WHERE user_id = current_setting('test.user', true))$$;
CREATE FUNCTION public.rbac_full_perms() RETURNS jsonb LANGUAGE sql IMMUTABLE AS $$
  SELECT '{"ferramentas":{"classificar":true,"certificar_classificacao":true}}'::jsonb$$;
\ir ../migrations/20261019190000_opportunity_reopen_control.sql

CREATE FUNCTION pg_temp.assert(ok boolean, message text) RETURNS void LANGUAGE plpgsql AS $$BEGIN IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'FAIL: %',message; END IF; END$$;
-- tenta mudar o status como `quem` (role do JWT) e devolve 'ok' ou o erro
CREATE FUNCTION pg_temp.mudar(quem text, jwt text, opp text, novo text) RETURNS text LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config('test.user', quem, true); PERFORM set_config('test.role', jwt, true);
  BEGIN
    UPDATE public.opportunities SET status = novo WHERE id = opp::uuid;
    RETURN 'ok';
  EXCEPTION WHEN OTHERS THEN RETURN SQLERRM;
  END;
END $$;
CREATE FUNCTION pg_temp.reset() RETURNS void LANGUAGE sql AS $$
  SELECT set_config('test.role', '', true), set_config('test.user', '', true);
  UPDATE public.opportunities SET status = CASE id WHEN '00000000-0000-0000-0000-000000000001' THEN 'won' WHEN '00000000-0000-0000-0000-000000000002' THEN 'lost' ELSE 'open' END$$;

INSERT INTO public.opportunities VALUES
  ('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-0000000000c7','won',NULL),
  ('00000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-0000000000c7','lost',NULL),
  ('00000000-0000-0000-0000-000000000003','00000000-0000-0000-0000-0000000000c7','open',NULL);
INSERT INTO public.perfis VALUES ('consultor', false, '{"ferramentas":{"classificar":true}}'),
  ('gestor', false, '{"ferramentas":{"reabrir_oportunidade":true}}'), ('admin', true, NULL);

SELECT pg_temp.assert((rbac_full_perms() #>> '{ferramentas,reabrir_oportunidade}')::boolean, 'Admin recebe a chave nova');
SELECT pg_temp.assert((rbac_full_perms() #>> '{ferramentas,certificar_classificacao}')::boolean, 'chaves anteriores mantidas');

-- Org sem política / controle desligado: nada muda
SELECT pg_temp.assert(pg_temp.mudar('consultor','authenticated','00000000-0000-0000-0000-000000000001','open') = 'ok', 'sem política: consultor reabre');
SELECT pg_temp.reset();
INSERT INTO public.opportunity_close_policies(organization_id, mode) VALUES ('00000000-0000-0000-0000-0000000000c7','enforce');
SELECT pg_temp.assert((SELECT control_reopen FROM public.opportunity_close_policies) = false, 'padrão desligado');
SELECT pg_temp.assert(pg_temp.mudar('consultor','authenticated','00000000-0000-0000-0000-000000000001','open') = 'ok', 'controle desligado: consultor reabre');
SELECT pg_temp.reset();

-- Controle ligado
UPDATE public.opportunity_close_policies SET control_reopen = true;
SELECT pg_temp.assert(pg_temp.mudar('consultor','authenticated','00000000-0000-0000-0000-000000000001','open') = 'reopen_forbidden', 'consultor não tira de Ganho');
SELECT pg_temp.assert(pg_temp.mudar('consultor','authenticated','00000000-0000-0000-0000-000000000001','lost') = 'reopen_forbidden', 'nem de Ganho para Perdido');
SELECT pg_temp.assert(pg_temp.mudar('consultor','authenticated','00000000-0000-0000-0000-000000000002','open') = 'reopen_forbidden', 'nem de Perdido');
SELECT pg_temp.assert((SELECT status FROM public.opportunities WHERE id = '00000000-0000-0000-0000-000000000001') = 'won', 'continua ganha');
SELECT pg_temp.assert(pg_temp.mudar('consultor','authenticated','00000000-0000-0000-0000-000000000003','won') = 'ok', 'aberta → ganha segue livre (outras regras à parte)');
SELECT pg_temp.reset();
UPDATE public.opportunities SET pipeline_stage_id = gen_random_uuid() WHERE id = '00000000-0000-0000-0000-000000000001';
SELECT pg_temp.assert(pg_temp.mudar('consultor','authenticated','00000000-0000-0000-0000-000000000001','won') = 'ok', 'editar sem mudar o status passa');
SELECT pg_temp.assert(pg_temp.mudar('gestor','authenticated','00000000-0000-0000-0000-000000000001','open') = 'ok', 'perfil com Reabrir reabre');
SELECT pg_temp.reset();
SELECT pg_temp.assert(pg_temp.mudar('admin','authenticated','00000000-0000-0000-0000-000000000002','open') = 'ok', 'Admin reabre');
SELECT pg_temp.reset();
SELECT pg_temp.assert(pg_temp.mudar('consultor','service_role','00000000-0000-0000-0000-000000000001','open') = 'ok', 'service_role (integrações) passa');
SELECT pg_temp.reset();
SELECT pg_temp.assert(pg_temp.mudar('','','00000000-0000-0000-0000-000000000001','open') = 'ok', 'execução interna sem JWT passa');
SELECT pg_temp.reset();
-- Dentro de uma função SECURITY DEFINER (como a RPC de transição) o bloqueio continua valendo
CREATE FUNCTION public.rpc_fake(_opp uuid) RETURNS void LANGUAGE sql SECURITY DEFINER AS $$UPDATE public.opportunities SET status = 'open' WHERE id = _opp$$;
GRANT EXECUTE ON FUNCTION public.rpc_fake(uuid) TO authenticated;
SET LOCAL ROLE authenticated;
SELECT set_config('test.user', 'consultor', true), set_config('test.role', 'authenticated', true);
DO $$ BEGIN
  PERFORM public.rpc_fake('00000000-0000-0000-0000-000000000001');
  RAISE EXCEPTION 'FAIL: RPC SECURITY DEFINER deixou reabrir';
EXCEPTION WHEN OTHERS THEN
  IF SQLERRM <> 'reopen_forbidden' THEN RAISE; END IF;
END $$;
RESET ROLE;
SELECT 'opportunity_reopen_guard: OK' AS resultado;
ROLLBACK;
