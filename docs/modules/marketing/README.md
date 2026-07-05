# Módulo: Marketing

## Rotas
- `/marketing` — overview
- `/marketing/ads` — lista de anúncios
- `/marketing/ads/:id` — detalhe
- `/marketing/funnel` — funil
- `/marketing/timeline` — timeline

Páginas em `src/pages/marketing/`, hooks em `src/pages/marketing/_hooks/` (`useAdLeads`, `useAdPerformance`, `useFunnel`, `useMarketingPeriod`, `useOverview`).

É o único módulo que usa `@tanstack/react-query` de forma consistente.

## Integrações
- Meta Ads Manager (descoberta + insights) — `meta-discover-ad-accounts`, `meta-discover-ads-cron`, `meta-ads-manager-save`.
- Meta Lead Ads — `meta-lead-ads-*` (ver `integrations/meta-lead-ads/`).
- Meta CAPI — `meta-capi-*` (ver `integrations/meta-capi/`).
- CTWA — captura de referral (memory `whatsapp-ctwa-referral-capture`).
- ⚠️ **`marketing-campaign-enrich`** roda em cron 6h + trigger `fn_marketing_campaign_enrich_async`, mas **está fora do repo** (drift #2). Código de produção sem versionamento — ação urgente.

## Fluxo de atribuição
- Triggers: `fn_populate_contact_marketing_campaign_fk` (BEFORE INS/UPD em `contacts`), `trg_marketing_campaign_enrich_async` (AFTER em `marketing_campaigns`).
- `fn_resolve_marketing_campaign_id` — resolve por UTMs.
- `marketing_attribution_ambiguities` registra conflitos; `fn_marketing_attribution_dryrun` + `fn_marketing_attribution_top_conflicts` para diagnóstico.
- `get_marketing_ad_performance` retorna 31 colunas de funil.

## CAPI
- `fn_capi_dispatch_event` disparado por trigger em `contacts` (Lead) e `opportunities` won (Purchase).
- Fila em `capi_event_log`; retry a cada 5 min via `meta-capi-retry-cron`.
