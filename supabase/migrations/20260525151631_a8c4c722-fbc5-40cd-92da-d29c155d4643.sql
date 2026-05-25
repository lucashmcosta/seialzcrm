-- Backfill marketing_campaign_id em contacts antigos
-- Camada 1: match exato por CTWA ad id (alta confiança)
UPDATE contacts c
SET marketing_campaign_id = mc.id
FROM marketing_campaigns mc
WHERE c.marketing_campaign_id IS NULL
  AND c.deleted_at IS NULL
  AND c.ad_referral_source_id IS NOT NULL
  AND mc.organization_id = c.organization_id
  AND mc.deleted_at IS NULL
  AND (mc.ad_id = c.ad_referral_source_id OR mc.external_id = c.ad_referral_source_id);

-- Camada 2: match único por nome de UTM (média confiança)
WITH candidates AS (
  SELECT c.id AS contact_id, mc.id AS campaign_id,
         COUNT(*) OVER (PARTITION BY c.id) AS n
  FROM contacts c
  JOIN marketing_campaigns mc
    ON mc.organization_id = c.organization_id
   AND mc.deleted_at IS NULL
   AND (
        (c.utm_content  IS NOT NULL AND (mc.ad_name = c.utm_content OR mc.adset_name = c.utm_content))
     OR (c.utm_campaign IS NOT NULL AND  mc.campaign_name = c.utm_campaign)
   )
  WHERE c.marketing_campaign_id IS NULL
    AND c.deleted_at IS NULL
)
UPDATE contacts c
SET marketing_campaign_id = ca.campaign_id
FROM candidates ca
WHERE ca.contact_id = c.id AND ca.n = 1;