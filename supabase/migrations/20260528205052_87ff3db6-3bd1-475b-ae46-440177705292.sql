
DO $$
DECLARE
  v_org uuid := 'b246ef6f-6242-4011-a112-6d8783d2896a';
  v_owner uuid := '95697f6c-0b0e-4b04-95ac-118d140d3c1b';
  v_stage uuid := 'b4f5fce5-cefa-4770-a928-298b72c22562';
BEGIN
  WITH unmatched AS (
    SELECT c.lead_id, c.created_time, c.ad_id, c.campaign_name,
           normalize_phone_br(replace(c.telefone, 'p:', '')) AS norm
    FROM viagi_csv_staging_2026_05_28 c
    WHERE NOT EXISTS (
      SELECT 1 FROM contacts ct
      WHERE ct.organization_id = v_org AND ct.deleted_at IS NULL
        AND ct.source_external_id = c.lead_id
    )
  ),
  matched AS (
    SELECT DISTINCT ON (uc.lead_id) uc.lead_id, uc.created_time, uc.ad_id, uc.campaign_name,
           ct.id AS contact_id, ct.attribution_path,
           mc.id AS mc_id, mc.campaign_name AS mc_campaign
    FROM unmatched uc
    JOIN contacts ct ON ct.organization_id = v_org AND ct.deleted_at IS NULL
                    AND ct.phone_normalized = uc.norm
                    AND ct.source_external_id IS NULL
    LEFT JOIN marketing_campaigns mc ON mc.organization_id = v_org AND mc.ad_id = uc.ad_id
    ORDER BY uc.lead_id, ct.created_at ASC
  )
  UPDATE contacts ct SET
    source_external_id = m.lead_id,
    marketing_campaign_id = m.mc_id,
    attribution_path = CASE
      WHEN ct.attribution_path IS NULL OR array_length(ct.attribution_path, 1) IS NULL
        THEN ARRAY['meta_lead_ads']::text[]
      WHEN ct.attribution_path[array_length(ct.attribution_path,1)] = 'meta_lead_ads'
        THEN ct.attribution_path
      ELSE ct.attribution_path || ARRAY['meta_lead_ads']::text[]
    END,
    ad_referral_source_id = m.ad_id,
    ad_referral_source_type = 'lead_form',
    ad_referral_captured_at = m.created_time::timestamptz,
    utm_source = 'facebook',
    utm_medium = 'paid_social',
    utm_campaign = COALESCE(m.campaign_name, m.mc_campaign)
  FROM matched m
  WHERE ct.id = m.contact_id;

  INSERT INTO opportunities (organization_id, contact_id, owner_user_id, title, pipeline_stage_id, status,
                             source, source_external_id, marketing_campaign_id,
                             utm_source, utm_medium, utm_campaign, created_at)
  SELECT v_org, ct.id, v_owner, COALESCE(NULLIF(trim(c.nome),''), c.telefone, 'Lead Meta'),
         v_stage, 'open',
         'meta_lead_ads', c.lead_id,
         mc.id,
         'facebook', 'paid_social', COALESCE(c.campaign_name, mc.campaign_name),
         c.created_time::timestamptz
  FROM viagi_csv_staging_2026_05_28 c
  JOIN contacts ct ON ct.organization_id = v_org AND ct.source_external_id = c.lead_id AND ct.deleted_at IS NULL
  LEFT JOIN marketing_campaigns mc ON mc.organization_id = v_org AND mc.ad_id = c.ad_id
  WHERE NOT EXISTS (
    SELECT 1 FROM opportunities o
    WHERE o.organization_id = v_org AND o.source_external_id = c.lead_id AND o.deleted_at IS NULL
  );
END $$;
