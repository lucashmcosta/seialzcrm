CREATE TABLE public.viagi_csv_staging_2026_05_28 (
  lead_id text PRIMARY KEY,
  created_time timestamptz NOT NULL,
  ad_id text NOT NULL,
  ad_name text NOT NULL,
  adset_id text NOT NULL,
  adset_name text NOT NULL,
  campaign_id text NOT NULL,
  campaign_name text NOT NULL,
  form_id text NOT NULL,
  nome text,
  email text,
  telefone text,
  problema text,
  phone_normalized text GENERATED ALWAYS AS (
    regexp_replace(coalesce(telefone,''), '[^0-9+]', '', 'g')
  ) STORED,
  loaded_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_viagi_staging_phone ON public.viagi_csv_staging_2026_05_28 (phone_normalized);
CREATE INDEX idx_viagi_staging_ad_id ON public.viagi_csv_staging_2026_05_28 (ad_id);

GRANT ALL ON public.viagi_csv_staging_2026_05_28 TO service_role;

ALTER TABLE public.viagi_csv_staging_2026_05_28 ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.viagi_csv_staging_2026_05_28 IS
  'Staging temporário do CSV Viagi (1297 leads, AD 5/6/7) para o backfill meta_lead_ads de 28/05/2026. Sem RLS policy = service_role only. Drop após apply.';