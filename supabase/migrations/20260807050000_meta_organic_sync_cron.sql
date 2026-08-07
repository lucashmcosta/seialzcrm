-- Cron do sync orgânico (a cada 3h). Dentro da função meta-organic-sync ficam:
--  - descoberta de conteúdo novo (incremental por watermark);
--  - refresh de conteúdo MUTÁVEL por tiers (viral/recente/médio/antigo) — conteúdo
--    antigo não é imutável; viral cresce por meses;
--  - media-level insights;
--  - checkpoint/idempotência (meta_sync_state.cursor) + retomada após falha;
--  - auto-continuação headless até backfill_done.
-- Account-level insights (reach dedup / views de conta) são servidos on-demand pela UI
-- (meta-account-insights, cacheáveis), não pelo cron.
-- Multi-tenant, sem hardcode: itera TODAS as conexões conectadas. Auth via token interno
-- (get_internal_function_auth_token) computado em runtime — sem segredo literal no SQL.
-- cron.schedule é idempotente por nome (re-schedule substitui).
SELECT cron.schedule(
  'meta-organic-sync-cron',
  '0 */3 * * *',
  $CRON$
  SELECT net.http_post(
    url := 'https://qvmtzfvkhkhkhdpclzua.supabase.co/functions/v1/meta-organic-sync',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || public.get_internal_function_auth_token()
    ),
    body := jsonb_build_object('organization_id', c.organization_id, 'connection_id', c.id),
    timeout_milliseconds := 120000
  )
  FROM public.meta_connections c
  WHERE c.status = 'connected';
  $CRON$
);
