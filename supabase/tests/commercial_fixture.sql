-- Disposable PostgreSQL only: minimal contract fixture, not a production migration.
DO $$ BEGIN IF NOT EXISTS(SELECT FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF; IF NOT EXISTS(SELECT FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon NOLOGIN; END IF; IF NOT EXISTS(SELECT FROM pg_roles WHERE rolname='service_role') THEN CREATE ROLE service_role NOLOGIN; END IF; END $$;
CREATE EXTENSION IF NOT EXISTS unaccent;
CREATE FUNCTION f_unaccent(text) RETURNS text LANGUAGE sql IMMUTABLE AS 'SELECT unaccent($1)';
CREATE TABLE organizations(id uuid PRIMARY KEY);
CREATE TABLE users(id uuid PRIMARY KEY,full_name text);
CREATE TABLE permission_profiles(id uuid PRIMARY KEY,permissions jsonb);
CREATE TABLE user_organizations(user_id uuid,organization_id uuid,is_active boolean,permission_profile_id uuid);
CREATE TABLE communication_endpoints(id uuid PRIMARY KEY,organization_id uuid,channel text,display_name text,external_address text);
CREATE TABLE contacts(id uuid PRIMARY KEY,organization_id uuid,full_name text,company_name text,email text,phone text,owner_user_id uuid,lifecycle_stage text,created_at timestamptz DEFAULT now(),deleted_at timestamptz,source text,utm_source text,gclid text,marketing_campaign_id uuid,search_name text GENERATED ALWAYS AS (f_unaccent(lower(full_name))) STORED,search_email text GENERATED ALWAYS AS (f_unaccent(lower(email))) STORED,phone_digits text GENERATED ALWAYS AS (regexp_replace(phone,'[^0-9]','','g')) STORED);
CREATE TABLE pipeline_stages(id uuid PRIMARY KEY,organization_id uuid,name text,type text,order_index integer);
CREATE TABLE opportunities(id uuid PRIMARY KEY,organization_id uuid,contact_id uuid,owner_user_id uuid,title text,status text,amount numeric,currency text,created_at timestamptz DEFAULT now(),close_date date,deleted_at timestamptz,pipeline_stage_id uuid,source text,utm_source text,utm_medium text,utm_campaign text,marketing_campaign_id uuid);
CREATE TABLE marketing_campaigns(id uuid PRIMARY KEY,organization_id uuid,platform text,display_name text,campaign_name text,ad_name text,ad_id text,external_id text,campaign_id text,deleted_at timestamptz);
CREATE TABLE message_threads(id uuid PRIMARY KEY,organization_id uuid,contact_id uuid,channel text);
CREATE TABLE messages(id uuid PRIMARY KEY,organization_id uuid,thread_id uuid,direction text,metadata jsonb,created_at timestamptz DEFAULT now(),media_type text,content text,endpoint_id uuid);
CREATE TABLE tag_assignments(organization_id uuid,entity_id uuid,entity_type text,tag_id uuid);
CREATE FUNCTION current_user_id() RETURNS uuid LANGUAGE sql STABLE AS $$SELECT nullif(current_setting('test.user_id',true),'')::uuid$$;
CREATE FUNCTION current_user_org_ids() RETURNS uuid[] LANGUAGE sql STABLE SECURITY DEFINER AS $$SELECT array_agg(organization_id) FROM user_organizations WHERE user_id=current_user_id() AND is_active$$;
CREATE FUNCTION user_can_view_all(org uuid,entity text) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER AS $$SELECT COALESCE(bool_or((p.permissions->>('view_all_'||entity))::boolean),false) FROM user_organizations u JOIN permission_profiles p ON p.id=u.permission_profile_id WHERE u.user_id=current_user_id() AND u.organization_id=org AND u.is_active$$;
\ir ../migrations/20260925120000_commercial_attribution.sql
\ir ../migrations/20260925121000_commercial_queries.sql
