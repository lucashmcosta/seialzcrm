-- View de contrato para a aba Orgânico: 1 linha por mídia com os insights lifetime.
-- A UI lê SÓ colunas estruturadas (nunca o payload cru `raw`).
-- Distinção de disponibilidade: métrica NULL = indisponível pela API; linha sem
-- insight (has_insights=false) = ainda não sincronizado; valor 0 = zero real.
CREATE OR REPLACE VIEW public.vw_meta_media_performance
WITH (security_invoker = on) AS
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
FROM public.meta_media m
LEFT JOIN public.meta_media_insights i
  ON i.media_id = m.id AND i.period = 'lifetime'
WHERE m.connection_id IN (
  SELECT id FROM public.meta_connections WHERE status = 'connected'
);

GRANT SELECT ON public.vw_meta_media_performance TO authenticated;
