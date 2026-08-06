-- Meta Connection V1 — domínio normalizado Performance + Organic (aditivo).
-- Fonte de verdade única (substituirá marketing_campaigns em fases; backfill+view depois).
-- Métricas de meta_ad_insights espelham marketing_campaign_insights_daily p/ backfill/compat.
-- RLS: SELECT membros da org (current_user_org_ids()); escrita só service_role.

-- Helper: aplica GRANT + RLS de leitura por org. (inline por tabela abaixo)

-- =========================================================================
-- PERFORMANCE (dimensões: campaign -> ad_set -> ad -> creative)
-- =========================================================================
CREATE TABLE public.meta_ad_creatives (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id    uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  connection_id      uuid NOT NULL REFERENCES public.meta_connections(id) ON DELETE CASCADE,
  ad_account_asset_id uuid REFERENCES public.meta_assets(id) ON DELETE SET NULL,
  external_id        text NOT NULL,
  name               text,
  title              text,
  body               text,
  thumbnail_url      text,
  object_story_spec  jsonb,
  raw                jsonb,
  source_api_version text,
  parser_version     text,
  synced_at          timestamptz,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT meta_ad_creatives_conn_extid_key UNIQUE (connection_id, external_id)
);

CREATE TABLE public.meta_campaigns (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id    uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  connection_id      uuid NOT NULL REFERENCES public.meta_connections(id) ON DELETE CASCADE,
  ad_account_asset_id uuid REFERENCES public.meta_assets(id) ON DELETE SET NULL,
  external_id        text NOT NULL,
  name               text,
  objective          text,
  status             text,
  effective_status   text,
  daily_budget_cents bigint,
  lifetime_budget_cents bigint,
  budget_currency    text,
  start_time         timestamptz,
  stop_time          timestamptz,
  created_time       timestamptz,
  updated_time       timestamptz,
  raw                jsonb,
  source_api_version text,
  parser_version     text,
  synced_at          timestamptz,
  deleted_at         timestamptz,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT meta_campaigns_conn_extid_key UNIQUE (connection_id, external_id)
);

CREATE TABLE public.meta_ad_sets (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id    uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  connection_id      uuid NOT NULL REFERENCES public.meta_connections(id) ON DELETE CASCADE,
  ad_account_asset_id uuid REFERENCES public.meta_assets(id) ON DELETE SET NULL,
  campaign_id        uuid REFERENCES public.meta_campaigns(id) ON DELETE SET NULL,
  external_id        text NOT NULL,
  campaign_external_id text,
  name               text,
  status             text,
  effective_status   text,
  optimization_goal  text,
  billing_event      text,
  daily_budget_cents bigint,
  lifetime_budget_cents bigint,
  budget_currency    text,
  start_time         timestamptz,
  end_time           timestamptz,
  targeting          jsonb,
  raw                jsonb,
  source_api_version text,
  parser_version     text,
  synced_at          timestamptz,
  deleted_at         timestamptz,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT meta_ad_sets_conn_extid_key UNIQUE (connection_id, external_id)
);

CREATE TABLE public.meta_ads (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id    uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  connection_id      uuid NOT NULL REFERENCES public.meta_connections(id) ON DELETE CASCADE,
  ad_account_asset_id uuid REFERENCES public.meta_assets(id) ON DELETE SET NULL,
  ad_set_id          uuid REFERENCES public.meta_ad_sets(id) ON DELETE SET NULL,
  campaign_id        uuid REFERENCES public.meta_campaigns(id) ON DELETE SET NULL,
  creative_id        uuid REFERENCES public.meta_ad_creatives(id) ON DELETE SET NULL,
  external_id        text NOT NULL,
  ad_set_external_id text,
  campaign_external_id text,
  creative_external_id text,
  name               text,
  status             text,
  effective_status   text,
  destination_url    text,
  created_time       timestamptz,
  updated_time       timestamptz,
  raw                jsonb,
  source_api_version text,
  parser_version     text,
  synced_at          timestamptz,
  deleted_at         timestamptz,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT meta_ads_conn_extid_key UNIQUE (connection_id, external_id)
);

-- Fato de insights (nível configurável; diário). Métricas espelham
-- marketing_campaign_insights_daily p/ backfill e view de compat.
CREATE TABLE public.meta_ad_insights (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id    uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  connection_id      uuid NOT NULL REFERENCES public.meta_connections(id) ON DELETE CASCADE,
  ad_account_asset_id uuid REFERENCES public.meta_assets(id) ON DELETE SET NULL,
  level              text NOT NULL DEFAULT 'ad' CHECK (level IN ('account','campaign','adset','ad')),
  entity_external_id text NOT NULL,          -- id do objeto no nível (ad/adset/campaign/account)
  ad_id              uuid REFERENCES public.meta_ads(id) ON DELETE SET NULL,
  date               date NOT NULL,          -- dia (date_start=date_stop) do insight
  impressions        bigint,
  clicks             bigint,
  inline_link_clicks bigint,
  reach              bigint,
  spend_cents        bigint,
  spend_currency     text,
  cpc_cents          bigint,
  cpm_cents          bigint,
  ctr_basis_points   integer,
  conversations_started integer,
  leads_attributed   integer,
  actions            jsonb,
  attribution_setting text,
  account_timezone   text,
  raw                jsonb,
  source_api_version text,
  parser_version     text,
  synced_at          timestamptz,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT meta_ad_insights_key UNIQUE (connection_id, level, entity_external_id, date)
);

-- =========================================================================
-- ORGANIC (media + insights) — 100% novo
-- =========================================================================
CREATE TABLE public.meta_media (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id    uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  connection_id      uuid NOT NULL REFERENCES public.meta_connections(id) ON DELETE CASCADE,
  asset_id           uuid REFERENCES public.meta_assets(id) ON DELETE SET NULL,  -- page ou ig account
  platform           text NOT NULL CHECK (platform IN ('facebook','instagram')),
  media_type         text,   -- post|reel|story|video|image|carousel
  external_id        text NOT NULL,
  permalink          text,
  caption            text,
  thumbnail_url      text,
  published_at       timestamptz,
  raw                jsonb,
  source_api_version text,
  parser_version     text,
  synced_at          timestamptz,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT meta_media_conn_extid_key UNIQUE (connection_id, external_id)
);

CREATE TABLE public.meta_media_insights (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id    uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  connection_id      uuid NOT NULL REFERENCES public.meta_connections(id) ON DELETE CASCADE,
  media_id           uuid NOT NULL REFERENCES public.meta_media(id) ON DELETE CASCADE,
  period             text NOT NULL DEFAULT 'lifetime' CHECK (period IN ('lifetime','day')),
  end_time           date,                   -- p/ period='day'
  reach              bigint,
  impressions        bigint,
  views              bigint,
  engagement         bigint,
  likes              bigint,
  comments           bigint,
  shares             bigint,
  saves              bigint,
  raw                jsonb,
  source_api_version text,
  parser_version     text,
  synced_at          timestamptz,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT meta_media_insights_key UNIQUE (media_id, period, end_time)
);

-- =========================================================================
-- GRANTS + RLS + índices + triggers (todas: SELECT org members / write service_role)
-- =========================================================================
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'meta_ad_creatives','meta_campaigns','meta_ad_sets','meta_ads',
    'meta_ad_insights','meta_media','meta_media_insights'
  ] LOOP
    EXECUTE format('GRANT SELECT ON public.%I TO authenticated;', t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role;', t);
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', t);
    EXECUTE format($f$CREATE POLICY "%1$s_select_org_members" ON public.%1$I
      FOR SELECT TO authenticated USING (organization_id = ANY (current_user_org_ids()));$f$, t);
    EXECUTE format('CREATE INDEX %1$s_org_idx ON public.%1$I (organization_id);', t);
    EXECUTE format('CREATE INDEX %1$s_conn_idx ON public.%1$I (connection_id);', t);
    EXECUTE format($f$CREATE TRIGGER trg_%1$s_updated_at BEFORE UPDATE ON public.%1$I
      FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();$f$, t);
  END LOOP;
END $$;

-- Índices de consulta específicos
CREATE INDEX meta_ad_insights_lookup_idx ON public.meta_ad_insights (organization_id, level, date);
CREATE INDEX meta_ad_insights_ad_idx ON public.meta_ad_insights (ad_id) WHERE ad_id IS NOT NULL;
CREATE INDEX meta_ads_campaign_idx ON public.meta_ads (campaign_id);
CREATE INDEX meta_ad_sets_campaign_idx ON public.meta_ad_sets (campaign_id);
CREATE INDEX meta_media_asset_idx ON public.meta_media (asset_id);
CREATE INDEX meta_media_insights_media_idx ON public.meta_media_insights (media_id);
