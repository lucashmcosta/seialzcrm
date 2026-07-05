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
