-- Disposable PostgreSQL only: minimal contract fixture for the process classification module.
-- psql -d BANCO_DESCARTAVEL -v ON_ERROR_STOP=1 -f supabase/tests/process_classification_fixture.sql -f supabase/tests/process_classification.sql
DO $$ BEGIN IF NOT EXISTS(SELECT FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF; IF NOT EXISTS(SELECT FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon NOLOGIN; END IF; IF NOT EXISTS(SELECT FROM pg_roles WHERE rolname='service_role') THEN CREATE ROLE service_role NOLOGIN; END IF; END $$;
CREATE TABLE organizations(id uuid PRIMARY KEY, name text);
CREATE TABLE users(id uuid PRIMARY KEY, full_name text);
CREATE TABLE permission_profiles(id uuid PRIMARY KEY, organization_id uuid, is_system boolean NOT NULL DEFAULT false, permissions_v2 jsonb);
CREATE TABLE user_organizations(user_id uuid, organization_id uuid, is_active boolean, permission_profile_id uuid);
CREATE TABLE team_members(organization_id uuid, team_id uuid, user_id uuid);
CREATE TABLE pipeline_stages(id uuid PRIMARY KEY, organization_id uuid, name text, type text);
CREATE TABLE opportunities(id uuid PRIMARY KEY, organization_id uuid, contact_id uuid, owner_user_id uuid, status text, deleted_at timestamptz, title text, pipeline_stage_id uuid);
CREATE TABLE notifications(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL, user_id uuid NOT NULL, type text NOT NULL, title text NOT NULL, body text, entity_type text, entity_id uuid, read_at timestamptz, created_at timestamptz DEFAULT now());
-- tabelas que o avaliador real (e3d1) lê no caminho sem política
CREATE TABLE opportunity_close_policies(organization_id uuid PRIMARY KEY, mode text, version integer, require_cpf_verified boolean, require_complete_address boolean,
  required_contact_fields text[], required_opportunity_fields text[], required_contact_custom_field_ids uuid[], required_opportunity_custom_field_ids uuid[], document_rules jsonb);
CREATE TABLE contacts(id uuid PRIMARY KEY, organization_id uuid, deleted_at timestamptz);
CREATE TABLE contact_identity_profiles(contact_id uuid, organization_id uuid, cpf_verification_status text);
CREATE TABLE organization_widgets(organization_id uuid, widget_key text, is_enabled boolean, UNIQUE(organization_id, widget_key));
GRANT SELECT ON ALL TABLES IN SCHEMA public TO authenticated;
CREATE FUNCTION current_user_id() RETURNS uuid LANGUAGE sql STABLE AS $$SELECT nullif(current_setting('test.user_id',true),'')::uuid$$;
CREATE FUNCTION current_user_org_ids() RETURNS uuid[] LANGUAGE sql STABLE SECURITY DEFINER AS $$SELECT array_agg(organization_id) FROM user_organizations WHERE user_id=current_user_id() AND is_active$$;
CREATE FUNCTION is_org_system_admin(_org uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER AS $$SELECT EXISTS(SELECT 1 FROM user_organizations u JOIN permission_profiles p ON p.id=u.permission_profile_id WHERE u.user_id=current_user_id() AND u.organization_id=_org AND u.is_active AND p.is_system)$$;
CREATE FUNCTION user_has_org_permission(_org uuid, _perm text) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT is_org_system_admin(_org) OR EXISTS(SELECT 1 FROM user_organizations u JOIN permission_profiles p ON p.id=u.permission_profile_id
    WHERE u.user_id=current_user_id() AND u.organization_id=_org AND u.is_active AND (p.permissions_v2 #>> ARRAY['legacy',_perm])::boolean)$$;
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
\ir ../migrations/20260811210000_documents_module_e3d1.sql
\ir ../migrations/20261018120000_process_classification_v1.sql
-- guard real de fechamento (copiado de 20260731180000): bloqueia ganhar quando o modo é 'enforce'
create or replace function public.fn_guard_opportunity_won_requirements_v1()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_target_type text;
  v_old_type text;
  v_mode text;
  v_eval jsonb;
begin
  select type::text into v_target_type from public.pipeline_stages
  where id = new.pipeline_stage_id and organization_id = new.organization_id;
  if tg_op = 'UPDATE' then
    select type::text into v_old_type from public.pipeline_stages where id = old.pipeline_stage_id;
  end if;
  if v_target_type <> 'won' and new.status::text <> 'won' then return new; end if;
  if tg_op = 'UPDATE' and v_old_type = 'won' and old.status::text = 'won' then return new; end if;
  if current_setting('app.opportunity_close_authorized', true) = new.id::text then return new; end if;

  select mode into v_mode from public.opportunity_close_policies where organization_id = new.organization_id;
  if coalesce(v_mode, 'off') <> 'enforce' then return new; end if;
  if tg_op = 'INSERT' or new.contact_id is distinct from old.contact_id then
    raise exception 'use_transition_opportunity_stage_v1' using errcode = '23514';
  end if;
  v_eval := public.evaluate_opportunity_close_internal_v1(new.organization_id, new.id);
  if not coalesce((v_eval ->> 'can_close')::boolean, false) then
    raise exception 'closing_requirements_missing'
      using errcode = '23514', detail = v_eval::text;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_guard_opportunity_won_requirements_v1 on public.opportunities;
create trigger trg_guard_opportunity_won_requirements_v1
before insert or update of pipeline_stage_id, status, contact_id on public.opportunities
for each row execute function public.fn_guard_opportunity_won_requirements_v1();
\ir ../migrations/20261018150000_process_classification_f3.sql
\ir ../migrations/20261018170000_process_classification_certification.sql
