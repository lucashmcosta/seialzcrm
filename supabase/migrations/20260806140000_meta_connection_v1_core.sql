-- Meta Connection V1 — camada de conexão canônica (aditivo, não-destrutivo).
-- Nenhum consumidor lê estas tabelas ainda; seguro em produção.
-- Padrões do projeto: RLS via current_user_org_ids(); escrita só via edge (service_role);
-- trigger update_updated_at_column().

-- =========================================================================
-- 1) meta_connections — SÓ metadados da autorização (sem material de credencial)
-- =========================================================================
CREATE TABLE public.meta_connections (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id          uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  status                   text NOT NULL DEFAULT 'connected'
                             CHECK (status IN ('connected','expired','revoked','error','disconnected')),
  authorizing_meta_user_id   text,
  authorizing_meta_user_name text,
  granted_scopes           text[] NOT NULL DEFAULT '{}',
  granular_scopes          jsonb,
  token_type               text NOT NULL DEFAULT 'unknown'
                             CHECK (token_type IN ('system_user','user','user_long_lived','unknown')),
  expires_at               timestamptz,
  data_access_expires_at   timestamptz,
  config_id                text,
  app_id                   text,
  last_token_check_at      timestamptz,
  last_health              text,
  source                   text NOT NULL DEFAULT 'oauth'
                             CHECK (source IN ('oauth','manual_legacy')),
  created_by_user_id       uuid REFERENCES public.users(id),
  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.meta_connections TO authenticated;
GRANT ALL ON public.meta_connections TO service_role;
ALTER TABLE public.meta_connections ENABLE ROW LEVEL SECURITY;
CREATE POLICY "meta_connections_select_org_members"
  ON public.meta_connections FOR SELECT TO authenticated
  USING (organization_id = ANY (current_user_org_ids()));
-- Escrita: só via edge (service_role). Sem policy de INSERT/UPDATE/DELETE p/ authenticated.

CREATE INDEX meta_connections_org_idx ON public.meta_connections (organization_id);
CREATE TRIGGER trg_meta_connections_updated_at
  BEFORE UPDATE ON public.meta_connections
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =========================================================================
-- 2) meta_connection_credentials — ciphertext, SÓ service_role (nega authenticated)
-- =========================================================================
CREATE TABLE public.meta_connection_credentials (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  connection_id      uuid NOT NULL UNIQUE REFERENCES public.meta_connections(id) ON DELETE CASCADE,
  token_encrypted    text NOT NULL,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);

-- Nenhum GRANT para authenticated: frontend nunca acessa ciphertext.
GRANT ALL ON public.meta_connection_credentials TO service_role;
ALTER TABLE public.meta_connection_credentials ENABLE ROW LEVEL SECURITY;
-- RLS habilitado sem policy para authenticated => default deny. service_role bypassa RLS.
CREATE TRIGGER trg_meta_connection_credentials_updated_at
  BEFORE UPDATE ON public.meta_connection_credentials
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =========================================================================
-- 3) meta_connection_intents — nonce efêmero one-time do início do OAuth
-- =========================================================================
CREATE TABLE public.meta_connection_intents (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id    uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id            uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  created_at         timestamptz NOT NULL DEFAULT now(),
  expires_at         timestamptz NOT NULL,
  used_at            timestamptz
);

-- Criado e consumido só pelo backend (service_role). Frontend recebe o nonce pela resposta do edge.
GRANT ALL ON public.meta_connection_intents TO service_role;
ALTER TABLE public.meta_connection_intents ENABLE ROW LEVEL SECURITY;
CREATE INDEX meta_connection_intents_expires_idx ON public.meta_connection_intents (expires_at);

-- =========================================================================
-- 4) meta_assets — ativos descobertos; seleção explícita (discovery != selection)
-- =========================================================================
CREATE TABLE public.meta_assets (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id    uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  connection_id      uuid NOT NULL REFERENCES public.meta_connections(id) ON DELETE CASCADE,
  asset_type         text NOT NULL CHECK (asset_type IN ('business','ad_account','page','instagram_account')),
  external_id        text NOT NULL,
  name               text,
  parent_asset_id    uuid REFERENCES public.meta_assets(id) ON DELETE SET NULL,
  selection_state    text NOT NULL DEFAULT 'discovered'
                       CHECK (selection_state IN ('discovered','selected','disabled')),
  metadata           jsonb NOT NULL DEFAULT '{}',
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT meta_assets_conn_type_extid_key UNIQUE (connection_id, asset_type, external_id)
);

GRANT SELECT ON public.meta_assets TO authenticated;
GRANT ALL ON public.meta_assets TO service_role;
ALTER TABLE public.meta_assets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "meta_assets_select_org_members"
  ON public.meta_assets FOR SELECT TO authenticated
  USING (organization_id = ANY (current_user_org_ids()));
-- Seleção persistida via edge (service_role).

CREATE INDEX meta_assets_org_idx ON public.meta_assets (organization_id);
CREATE INDEX meta_assets_connection_idx ON public.meta_assets (connection_id);
CREATE INDEX meta_assets_selected_idx ON public.meta_assets (organization_id, asset_type)
  WHERE selection_state = 'selected';
CREATE TRIGGER trg_meta_assets_updated_at
  BEFORE UPDATE ON public.meta_assets
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =========================================================================
-- 5) meta_sync_state — checkpoint/cursor por asset+kind
-- =========================================================================
CREATE TABLE public.meta_sync_state (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id    uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  connection_id      uuid NOT NULL REFERENCES public.meta_connections(id) ON DELETE CASCADE,
  asset_id           uuid NOT NULL REFERENCES public.meta_assets(id) ON DELETE CASCADE,
  kind               text NOT NULL CHECK (kind IN ('performance','organic')),
  last_synced_at     timestamptz,
  cursor             jsonb,
  sync_status        text NOT NULL DEFAULT 'idle' CHECK (sync_status IN ('idle','running','error')),
  error_class        text CHECK (error_class IN ('auth','rate_limit','transient','permanent')),
  error_message      text,
  counters           jsonb NOT NULL DEFAULT '{}',
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT meta_sync_state_asset_kind_key UNIQUE (asset_id, kind)
);

GRANT SELECT ON public.meta_sync_state TO authenticated;
GRANT ALL ON public.meta_sync_state TO service_role;
ALTER TABLE public.meta_sync_state ENABLE ROW LEVEL SECURITY;
CREATE POLICY "meta_sync_state_select_org_members"
  ON public.meta_sync_state FOR SELECT TO authenticated
  USING (organization_id = ANY (current_user_org_ids()));
CREATE INDEX meta_sync_state_org_idx ON public.meta_sync_state (organization_id);
CREATE TRIGGER trg_meta_sync_state_updated_at
  BEFORE UPDATE ON public.meta_sync_state
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =========================================================================
-- 6) meta_sync_runs — versionamento do pipeline (auditoria de coleta)
-- =========================================================================
CREATE TABLE public.meta_sync_runs (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id    uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  connection_id      uuid NOT NULL REFERENCES public.meta_connections(id) ON DELETE CASCADE,
  asset_id           uuid REFERENCES public.meta_assets(id) ON DELETE SET NULL,
  kind               text NOT NULL CHECK (kind IN ('performance','organic')),
  mode               text CHECK (mode IN ('incremental','backfill')),
  sync_version       text NOT NULL,
  parser_version     text NOT NULL,
  source_api_version text NOT NULL,
  started_at         timestamptz NOT NULL DEFAULT now(),
  completed_at       timestamptz,
  status             text NOT NULL DEFAULT 'running' CHECK (status IN ('running','success','error')),
  error_class        text,
  error_message      text,
  stats              jsonb NOT NULL DEFAULT '{}'
);

GRANT SELECT ON public.meta_sync_runs TO authenticated;
GRANT ALL ON public.meta_sync_runs TO service_role;
ALTER TABLE public.meta_sync_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "meta_sync_runs_select_org_members"
  ON public.meta_sync_runs FOR SELECT TO authenticated
  USING (organization_id = ANY (current_user_org_ids()));
CREATE INDEX meta_sync_runs_org_started_idx ON public.meta_sync_runs (organization_id, started_at DESC);

-- =========================================================================
-- 7) meta_connection_audit — connect/reconnect/disconnect/select_assets/...
-- =========================================================================
CREATE TABLE public.meta_connection_audit (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id    uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  connection_id      uuid REFERENCES public.meta_connections(id) ON DELETE SET NULL,
  actor_user_id      uuid REFERENCES public.users(id) ON DELETE SET NULL,
  action             text NOT NULL
                       CHECK (action IN ('connect','reconnect','disconnect','select_assets','token_refresh','data_deletion')),
  detail             jsonb NOT NULL DEFAULT '{}',
  created_at         timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.meta_connection_audit TO authenticated;
GRANT ALL ON public.meta_connection_audit TO service_role;
ALTER TABLE public.meta_connection_audit ENABLE ROW LEVEL SECURITY;
CREATE POLICY "meta_connection_audit_select_org_members"
  ON public.meta_connection_audit FOR SELECT TO authenticated
  USING (organization_id = ANY (current_user_org_ids()));
CREATE INDEX meta_connection_audit_org_created_idx ON public.meta_connection_audit (organization_id, created_at DESC);

-- =========================================================================
-- 8) meta_data_deletion_requests — fluxo separado do disconnect (obrigação Meta)
-- =========================================================================
CREATE TABLE public.meta_data_deletion_requests (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id    uuid REFERENCES public.organizations(id) ON DELETE SET NULL,
  connection_id      uuid REFERENCES public.meta_connections(id) ON DELETE SET NULL,
  request_id         text,                       -- código de confirmação exposto à Meta
  origin             text NOT NULL CHECK (origin IN ('meta_callback','user')),
  meta_user_id       text,
  status             text NOT NULL DEFAULT 'received'
                       CHECK (status IN ('received','processing','completed','failed')),
  evidence           jsonb NOT NULL DEFAULT '{}',
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  completed_at       timestamptz
);

GRANT SELECT ON public.meta_data_deletion_requests TO authenticated;
GRANT ALL ON public.meta_data_deletion_requests TO service_role;
ALTER TABLE public.meta_data_deletion_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "meta_data_deletion_requests_select_org_members"
  ON public.meta_data_deletion_requests FOR SELECT TO authenticated
  USING (organization_id IS NOT NULL AND organization_id = ANY (current_user_org_ids()));
CREATE INDEX meta_data_deletion_requests_request_idx ON public.meta_data_deletion_requests (request_id);
CREATE TRIGGER trg_meta_data_deletion_requests_updated_at
  BEFORE UPDATE ON public.meta_data_deletion_requests
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =========================================================================
-- 9) organization_integrations: FK para a conexão canônica (compat Lead Ads)
-- =========================================================================
ALTER TABLE public.organization_integrations
  ADD COLUMN meta_connection_id uuid REFERENCES public.meta_connections(id) ON DELETE SET NULL;
CREATE INDEX organization_integrations_meta_connection_idx
  ON public.organization_integrations (meta_connection_id)
  WHERE meta_connection_id IS NOT NULL;
