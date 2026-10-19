-- Disposable PostgreSQL only; caller wraps the fixture in a transaction.
CREATE ROLE anon;
CREATE ROLE authenticated;
CREATE ROLE service_role BYPASSRLS;
CREATE TABLE organizations(id uuid PRIMARY KEY DEFAULT gen_random_uuid());
CREATE TABLE users(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), locale text DEFAULT 'pt-BR');
CREATE TABLE user_organizations(organization_id uuid,user_id uuid,is_active boolean DEFAULT true);
CREATE TABLE admin_integrations(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),slug text);
CREATE TABLE organization_integrations(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),organization_id uuid,integration_id uuid,is_enabled boolean);
CREATE FUNCTION fn_feature_flag_enabled(text,uuid) RETURNS boolean LANGUAGE sql AS $$ SELECT coalesce(nullif(current_setting('test.canonical',true),''),'true')::boolean $$;
CREATE FUNCTION current_user_org_ids() RETURNS uuid[] LANGUAGE sql AS $$ SELECT ARRAY[current_setting('test.org',true)::uuid] $$;
CREATE FUNCTION update_updated_at_column() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN NEW.updated_at=now(); RETURN NEW; END $$;
\ir ../../supabase/migrations/20260806140000_meta_connection_v1_core.sql
\ir ../../supabase/migrations/20260806140100_meta_connection_v1_domain.sql
\ir ../../supabase/migrations/20260807030000_vw_meta_media_performance.sql
\ir ../../supabase/migrations/20261019190002_meta_oauth_continuity.sql
