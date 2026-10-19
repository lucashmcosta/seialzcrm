-- Preserve all history; present one latest snapshot per logical post, per organization.
CREATE OR REPLACE VIEW public.vw_meta_media_performance
WITH (security_invoker = on) AS
WITH ranked_media AS (
  SELECT m.*, row_number() OVER (
    PARTITION BY m.organization_id, m.platform, m.external_id
    ORDER BY m.synced_at DESC NULLS LAST, m.updated_at DESC, m.id DESC
  ) AS position
  FROM public.meta_media m
  JOIN public.meta_connections c ON c.id = m.connection_id AND c.organization_id = m.organization_id
  WHERE c.status = 'connected' AND c.activation_state = 'ready'
)
SELECT
  m.id,
  m.organization_id,
  m.connection_id,
  m.platform,
  m.media_type,
  m.external_id,
  m.permalink,
  m.caption,
  m.thumbnail_url,
  m.published_at,
  i.reach,
  i.impressions,
  i.views,
  i.engagement,
  i.likes,
  i.comments,
  i.shares,
  i.saves,
  i.synced_at AS insights_synced_at,
  (i.media_id IS NOT NULL) AS has_insights
FROM ranked_media m
LEFT JOIN LATERAL (
  SELECT i.* FROM public.meta_media_insights i
  WHERE i.media_id = m.id AND i.organization_id = m.organization_id AND i.period = 'lifetime'
  ORDER BY i.synced_at DESC NULLS LAST, i.updated_at DESC, i.id DESC
  LIMIT 1
) i ON true
WHERE m.position = 1;

GRANT SELECT ON public.vw_meta_media_performance TO authenticated;
