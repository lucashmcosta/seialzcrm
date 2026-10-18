-- Disposable PostgreSQL only: minimal contract fixture for the process classification module.
-- psql -d BANCO_DESCARTAVEL -v ON_ERROR_STOP=1 -f supabase/tests/process_classification_fixture.sql -f supabase/tests/process_classification.sql
DO $$ BEGIN IF NOT EXISTS(SELECT FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF; IF NOT EXISTS(SELECT FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon NOLOGIN; END IF; IF NOT EXISTS(SELECT FROM pg_roles WHERE rolname='service_role') THEN CREATE ROLE service_role NOLOGIN; END IF; END $$;
CREATE TABLE organizations(id uuid PRIMARY KEY, name text);
CREATE TABLE users(id uuid PRIMARY KEY, full_name text);
CREATE TABLE permission_profiles(id uuid PRIMARY KEY, organization_id uuid, is_system boolean NOT NULL DEFAULT false, permissions_v2 jsonb);
CREATE TABLE user_organizations(user_id uuid, organization_id uuid, is_active boolean, permission_profile_id uuid);
CREATE TABLE team_members(organization_id uuid, team_id uuid, user_id uuid);
CREATE TABLE opportunities(id uuid PRIMARY KEY, organization_id uuid, contact_id uuid, owner_user_id uuid, status text, deleted_at timestamptz);
CREATE TABLE organization_widgets(organization_id uuid, widget_key text, is_enabled boolean, UNIQUE(organization_id, widget_key));
GRANT SELECT ON ALL TABLES IN SCHEMA public TO authenticated;
CREATE FUNCTION current_user_id() RETURNS uuid LANGUAGE sql STABLE AS $$SELECT nullif(current_setting('test.user_id',true),'')::uuid$$;
CREATE FUNCTION current_user_org_ids() RETURNS uuid[] LANGUAGE sql STABLE SECURITY DEFINER AS $$SELECT array_agg(organization_id) FROM user_organizations WHERE user_id=current_user_id() AND is_active$$;
CREATE FUNCTION is_org_system_admin(_org uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER AS $$SELECT EXISTS(SELECT 1 FROM user_organizations u JOIN permission_profiles p ON p.id=u.permission_profile_id WHERE u.user_id=current_user_id() AND u.organization_id=_org AND u.is_active AND p.is_system)$$;
CREATE FUNCTION update_updated_at_column() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN NEW.updated_at := now(); RETURN NEW; END$$;
CREATE FUNCTION rbac_full_perms() RETURNS jsonb LANGUAGE sql IMMUTABLE AS $$SELECT '{}'::jsonb$$;
-- rbac_ctx simplificado (mesma forma do real: orgs → perms efetivas; team → pessoas das equipes)
CREATE FUNCTION rbac_ctx() RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT jsonb_build_object('me', current_user_id(),
    'orgs', COALESCE((SELECT jsonb_object_agg(uo.organization_id::text, CASE WHEN p.is_system THEN rbac_full_perms() ELSE COALESCE(p.permissions_v2,'{}') END)
      FROM user_organizations uo JOIN permission_profiles p ON p.id=uo.permission_profile_id WHERE uo.user_id=current_user_id() AND uo.is_active), '{}'::jsonb),
    'team', COALESCE((SELECT jsonb_object_agg(org::text, ids) FROM (SELECT tm.organization_id org, jsonb_agg(DISTINCT tm2.user_id) ids
      FROM team_members tm JOIN team_members tm2 ON tm2.team_id=tm.team_id WHERE tm.user_id=current_user_id() GROUP BY tm.organization_id) t), '{}'::jsonb))
$$;
CREATE FUNCTION perms_v2_for_user(_org uuid, _user uuid) RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT CASE WHEN p.is_system THEN rbac_full_perms() ELSE p.permissions_v2 END FROM user_organizations uo JOIN permission_profiles p ON p.id=uo.permission_profile_id
  WHERE uo.user_id=_user AND uo.organization_id=_org AND uo.is_active LIMIT 1$$;
CREATE FUNCTION my_perms_v2(_org uuid) RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER AS $$SELECT rbac_ctx() #> ARRAY['orgs',_org::text]$$;
-- rbac_check copiado de 20261009033819
CREATE OR REPLACE FUNCTION public.rbac_check(ctx jsonb, _org uuid, _obj text, _acao text, _resp uuid[])
RETURNS boolean LANGUAGE plpgsql IMMUTABLE SET search_path=public AS $$
DECLARE sc text := ctx #>> ARRAY['orgs',_org::text,'dados',_obj,_acao];
  ver text := ctx #>> ARRAY['orgs',_org::text,'dados',_obj,'ver'];
  r uuid[] := array_remove(COALESCE(_resp,'{}'), NULL);
  me uuid := (ctx->>'me')::uuid;
BEGIN
  IF sc IS NULL OR sc = 'nenhum' THEN RETURN false; END IF;
  IF sc = 'todos' THEN RETURN true; END IF;
  IF cardinality(r) = 0 THEN
    RETURN COALESCE((ctx #>> ARRAY['orgs',_org::text,'dados',_obj,'sem_responsavel'])::boolean, false) OR ver = 'todos';
  END IF;
  IF me = ANY(r) THEN RETURN true; END IF;
  IF sc = 'equipe' THEN
    RETURN EXISTS (SELECT 1 FROM jsonb_array_elements_text(COALESCE(ctx #> ARRAY['team',_org::text],'[]')) t(id) WHERE t.id::uuid = ANY(r));
  END IF;
  RETURN false;
END $$;
INSERT INTO organizations VALUES('00000000-0000-0000-0000-0000000000c7','Central Trabalhista'),('00000000-0000-0000-0000-0000000000b2','Outra Org');
\ir ../migrations/20261018120000_process_classification_v1.sql
