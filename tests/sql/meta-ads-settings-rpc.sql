-- Disposable PostgreSQL only (creates roles/tables). Everything rolls back.
-- psql -v ON_ERROR_STOP=1 -d <empty_test_db> -f tests/sql/meta-ads-settings-rpc.sql
\set ON_ERROR_STOP on
BEGIN;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN CREATE ROLE service_role BYPASSRLS; END IF;
END $$;
CREATE SCHEMA IF NOT EXISTS auth;
CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
  $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
GRANT USAGE ON SCHEMA auth TO PUBLIC;
CREATE TABLE public.users(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), auth_user_id uuid);
CREATE TABLE public.user_organizations(organization_id uuid, user_id uuid, is_active boolean DEFAULT true);
CREATE TABLE public.admin_integrations(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), slug text);
CREATE TABLE public.organization_integrations(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid,
  integration_id uuid, is_enabled boolean, connected_account jsonb, config_values jsonb);
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
-- Prod definitions (verbatim from pg_get_functiondef).
CREATE OR REPLACE FUNCTION public.current_user_id() RETURNS uuid LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $f$
DECLARE user_uuid uuid; BEGIN SELECT id INTO user_uuid FROM public.users WHERE auth_user_id = auth.uid() LIMIT 1; RETURN user_uuid; END; $f$;
CREATE OR REPLACE FUNCTION public.current_user_org_ids() RETURNS uuid[] LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' SET row_security TO 'off' AS $f$
  SELECT COALESCE(array_agg(uo.organization_id), '{}'::uuid[]) FROM public.user_organizations uo
  WHERE uo.user_id = public.current_user_id() AND uo.is_active = true $f$;
CREATE SCHEMA IF NOT EXISTS extensions;
\ir ../../supabase/migrations/20260522220052_f5ff9f1e-ed14-4948-a88d-d528e7b2c111.sql
\ir ../../supabase/migrations/20261107233742_revoke_anon_get_meta_credentials.sql
-- Precondition: the bug (authenticated can read credentials).
DO $$ BEGIN ASSERT has_function_privilege('authenticated','public.get_meta_credentials(uuid)','EXECUTE'), 'precondition'; END $$;
\ir ../../supabase/migrations/20261108010000_meta_ads_settings_rpc.sql

CREATE TEMP TABLE fx(k text PRIMARY KEY, v uuid);
GRANT SELECT ON fx TO PUBLIC;
DO $$
DECLARE org uuid := gen_random_uuid(); other uuid := gen_random_uuid(); meta uuid;
  member_auth uuid := gen_random_uuid(); outsider_auth uuid := gen_random_uuid(); inactive_auth uuid := gen_random_uuid();
  u1 uuid; u2 uuid; u3 uuid;
BEGIN
  INSERT INTO admin_integrations(slug) VALUES('meta') RETURNING id INTO meta;
  INSERT INTO organization_integrations(organization_id,integration_id,is_enabled,connected_account,config_values)
    VALUES(org, meta, true, '{"system_user_token_encrypted":"v1:secret:cipher","ad_account_id":"act_1","meta_user_name":"x"}', '{"feature_ads_manager_sync":false}');
  INSERT INTO users(auth_user_id) VALUES(member_auth) RETURNING id INTO u1;
  INSERT INTO users(auth_user_id) VALUES(outsider_auth) RETURNING id INTO u2;
  INSERT INTO users(auth_user_id) VALUES(inactive_auth) RETURNING id INTO u3;
  INSERT INTO user_organizations VALUES(org,u1,true),(other,u2,true),(org,u3,false);
  INSERT INTO fx VALUES('org',org),('member',member_auth),('outsider',outsider_auth),('inactive',inactive_auth);
END $$;

-- Grants
DO $$ BEGIN
  ASSERT NOT has_function_privilege('anon','public.get_meta_credentials(uuid)','EXECUTE'), 'anon must not execute get_meta_credentials';
  ASSERT NOT has_function_privilege('authenticated','public.get_meta_credentials(uuid)','EXECUTE'), 'authenticated must not execute get_meta_credentials';
  ASSERT has_function_privilege('service_role','public.get_meta_credentials(uuid)','EXECUTE'), 'service_role keeps get_meta_credentials';
  ASSERT has_function_privilege('authenticated','public.get_meta_ads_settings(uuid)','EXECUTE'), 'authenticated executes new RPC';
  ASSERT NOT has_function_privilege('anon','public.get_meta_ads_settings(uuid)','EXECUTE'), 'anon must not execute new RPC';
  -- No secret columns in the new RPC signature.
  ASSERT (SELECT pg_get_function_result('public.get_meta_ads_settings(uuid)'::regprocedure)
          = 'TABLE(is_connected boolean, ad_account_id text, feature_ads_manager_sync boolean)'), 'unexpected result shape';
END $$;

-- authenticated calling get_meta_credentials directly → permission denied
SET LOCAL ROLE authenticated;
DO $$ BEGIN
  PERFORM public.get_meta_credentials((SELECT v FROM fx WHERE k='org'));
  RAISE EXCEPTION 'authenticated executed get_meta_credentials';
EXCEPTION WHEN insufficient_privilege THEN NULL; END $$;
RESET ROLE;
SET LOCAL ROLE anon;
DO $$ BEGIN
  PERFORM public.get_meta_credentials((SELECT v FROM fx WHERE k='org'));
  RAISE EXCEPTION 'anon executed get_meta_credentials';
EXCEPTION WHEN insufficient_privilege THEN NULL; END $$;
RESET ROLE;

-- service_role still reads the legacy credential (backend path unchanged)
SET LOCAL ROLE service_role;
DO $$ BEGIN
  ASSERT (SELECT system_user_token_encrypted='v1:secret:cipher' FROM public.get_meta_credentials((SELECT v FROM fx WHERE k='org'))), 'service_role read';
END $$;
RESET ROLE;

-- Member gets non-secret fields
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', (SELECT v::text FROM fx WHERE k='member'), true);
DO $$ DECLARE r record; BEGIN
  SELECT * INTO r FROM public.get_meta_ads_settings((SELECT v FROM fx WHERE k='org'));
  ASSERT r.is_connected AND r.ad_account_id='act_1' AND r.feature_ads_manager_sync = false, 'member fields';
  ASSERT (SELECT NOT (to_jsonb(s)::text LIKE '%cipher%') FROM public.get_meta_ads_settings((SELECT v FROM fx WHERE k='org')) s), 'no ciphertext leak';
END $$;

-- Non-member of the org → forbidden_org, nothing returned
SELECT set_config('request.jwt.claim.sub', (SELECT v::text FROM fx WHERE k='outsider'), true);
DO $$ BEGIN
  PERFORM public.get_meta_ads_settings((SELECT v FROM fx WHERE k='org'));
  RAISE EXCEPTION 'non-member read settings';
EXCEPTION WHEN insufficient_privilege THEN ASSERT SQLERRM='forbidden_org', SQLERRM; END $$;

-- Inactive member → forbidden_org
SELECT set_config('request.jwt.claim.sub', (SELECT v::text FROM fx WHERE k='inactive'), true);
DO $$ BEGIN
  PERFORM public.get_meta_ads_settings((SELECT v FROM fx WHERE k='org'));
  RAISE EXCEPTION 'inactive member read settings';
EXCEPTION WHEN insufficient_privilege THEN ASSERT SQLERRM='forbidden_org', SQLERRM; END $$;

-- No JWT at all → forbidden_org
SELECT set_config('request.jwt.claim.sub', '', true);
DO $$ BEGIN
  PERFORM public.get_meta_ads_settings((SELECT v FROM fx WHERE k='org'));
  RAISE EXCEPTION 'anonymous session read settings';
EXCEPTION WHEN insufficient_privilege THEN ASSERT SQLERRM='forbidden_org', SQLERRM; END $$;
RESET ROLE;

\echo 'meta-ads-settings-rpc: ALL ASSERTIONS PASSED'
ROLLBACK;
