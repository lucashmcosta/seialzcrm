# Fase 6 — Artefatos do cut-over (PREPARADOS, **NÃO APLICADOS**)

> Estado: rascunho para revisão/GO. Nada aqui foi executado em produção.
> Pipeline legado (`marketing_campaigns`, `marketing_campaign_insights_daily`, crons,
> `vw_marketing_*`, `get_marketing_ad_performance`, `contacts.marketing_campaign_id`) **intocado**.
> Attribution: estratégia aprovada = manter `marketing_campaigns` como camada fina de
> atribuição, **preenchida a partir de `meta_ads`** (chave `ad_id` estável).

## A) View de compatibilidade `vw_marketing_ad_performance_v2`
Mesma shape da atual, alimentada pelo modelo normalizado. Ao cut-over, aponta-se a
RPC/consumidores para esta view (ou renomeia por cima), atrás de feature flag.

```sql
CREATE OR REPLACE VIEW public.vw_marketing_ad_performance_v2 AS
SELECT
  ad.organization_id,
  ad.external_id            AS ad_id,
  ad.name                   AS ad_name,
  ad.campaign_external_id   AS campaign_id,
  camp.name                 AS campaign_name,
  camp.objective            AS campaign_objective,
  ad.ad_set_external_id     AS adset_id,
  aset.name                 AS adset_name,
  ad.creative_external_id   AS creative_id,
  cr.title                  AS creative_headline,
  cr.body                   AS creative_body,
  cr.thumbnail_url          AS creative_thumbnail_url,
  i.date,
  i.impressions, i.clicks, i.inline_link_clicks, i.reach,
  i.spend_cents, i.spend_currency, i.cpc_cents, i.cpm_cents, i.ctr_basis_points,
  i.conversations_started, i.leads_attributed
FROM public.meta_ad_insights i
JOIN public.meta_ads ad             ON ad.id = i.ad_id
LEFT JOIN public.meta_campaigns camp ON camp.id = ad.campaign_id
LEFT JOIN public.meta_ad_sets aset   ON aset.id = ad.ad_set_id
LEFT JOIN public.meta_ad_creatives cr ON cr.id = ad.creative_id
WHERE i.level = 'ad'
  AND ad.connection_id IN (
    SELECT id FROM public.meta_connections WHERE status = 'connected'
  );
```
> Alinhar as colunas 1:1 com o output real de `vw_marketing_ad_performance` /
> `get_marketing_ad_performance` no momento do cut-over (colunas/nome/tipos).

## B) Mapeamento `meta_ads` → `marketing_campaigns` (mantém attribution)
Mantém `marketing_campaigns.id` + `.ad_id` estáveis (a FK `contacts.marketing_campaign_id`
não muda). Passa a **upsert** a partir de `meta_ads` (chave natural `organization_id, platform, external_id`).

```sql
-- Upsert idempotente: 1 linha marketing_campaigns por ad, vinda de meta_ads (sem tocar contacts).
INSERT INTO public.marketing_campaigns AS mc (
  organization_id, platform, channel, external_id, ad_id, ad_name,
  campaign_id, campaign_name, campaign_objective, adset_id, adset_name,
  creative_id, creative_name, creative_headline, creative_body, creative_thumbnail_url,
  status, last_synced_at, sync_status
)
SELECT
  ad.organization_id, 'meta', 'ctwa', ad.external_id, ad.external_id, ad.name,
  ad.campaign_external_id, camp.name, camp.objective, ad.ad_set_external_id, aset.name,
  ad.creative_external_id, cr.name, cr.title, cr.body, cr.thumbnail_url,
  CASE WHEN ad.effective_status IN ('ACTIVE') THEN 'active'
       WHEN ad.effective_status IN ('PAUSED') THEN 'paused'
       ELSE 'archived' END,
  now(), 'synced'
FROM public.meta_ads ad
LEFT JOIN public.meta_campaigns camp ON camp.id = ad.campaign_id
LEFT JOIN public.meta_ad_sets aset   ON aset.id = ad.ad_set_id
LEFT JOIN public.meta_ad_creatives cr ON cr.id = ad.creative_id
WHERE ad.connection_id IN (SELECT id FROM public.meta_connections WHERE status='connected')
ON CONFLICT (organization_id, platform, external_id) DO UPDATE SET
  ad_name=excluded.ad_name, campaign_name=excluded.campaign_name,
  campaign_objective=excluded.campaign_objective, adset_name=excluded.adset_name,
  creative_headline=excluded.creative_headline, creative_body=excluded.creative_body,
  creative_thumbnail_url=excluded.creative_thumbnail_url, status=excluded.status,
  last_synced_at=now(), sync_status='synced';

-- Insights: manter marketing_campaign_insights_daily preenchido a partir de meta_ad_insights,
-- casando pela marketing_campaigns.id (via ad_id) — colunas já espelhadas.
INSERT INTO public.marketing_campaign_insights_daily AS d (
  marketing_campaign_id, date, impressions, clicks, inline_link_clicks, reach,
  spend_cents, spend_currency, cpc_cents, cpm_cents, ctr_basis_points,
  conversations_started, leads_attributed, synced_at
)
SELECT mc.id, i.date, i.impressions, i.clicks, i.inline_link_clicks, i.reach,
  i.spend_cents, i.spend_currency, i.cpc_cents, i.cpm_cents, i.ctr_basis_points,
  i.conversations_started, i.leads_attributed, now()
FROM public.meta_ad_insights i
JOIN public.meta_ads ad ON ad.id = i.ad_id
JOIN public.marketing_campaigns mc
  ON mc.organization_id = ad.organization_id AND mc.platform='meta' AND mc.external_id = ad.external_id
WHERE i.level='ad' AND ad.connection_id IN (SELECT id FROM public.meta_connections WHERE status='connected')
ON CONFLICT (marketing_campaign_id, date) DO UPDATE SET
  impressions=excluded.impressions, clicks=excluded.clicks,
  inline_link_clicks=excluded.inline_link_clicks, reach=excluded.reach,
  spend_cents=excluded.spend_cents, cpc_cents=excluded.cpc_cents, cpm_cents=excluded.cpm_cents,
  ctr_basis_points=excluded.ctr_basis_points, conversations_started=excluded.conversations_started,
  leads_attributed=excluded.leads_attributed, synced_at=now();
```
> Assim `contacts.marketing_campaign_id` continua válido; a fonte das métricas vira `meta_*`,
> a chave de atribuição permanece estável. **Nada em `contacts` é alterado.**

## C) Plano de backfill
1. `meta-performance-sync` mode=backfill (janela = min(date) do legado) por ad account selecionado
   → popula `meta_*` (idempotente).
2. Rodar os upserts de (B) → reflete no `marketing_campaigns`/`insights_daily` sem o cron antigo.
3. (Cut-over) agendar `meta-performance-sync` incremental via pg_cron (substitui `meta-discover-ads-cron` + `marketing-insights-sync-daily`).

## D) Testes de equivalência (rodados no E2E — repetir por org antes do GO)
- Cobertura: `old_only` deve ser 0; `new_only` ≥ 0.
- Exatidão: % de linhas exatamente iguais; das divergentes, todas `new ≥ old` (atribuição).
- Totais: `sum(spend_cents)` novo vs antigo dentro de tolerância (freshness/atribuição).
(Evidência CT: 614/614 cobertas, 592 exatas (96,4%), 20 new≥old / 0 new<old, +27 new_only, +1,97% spend.)

## E) Rollback (exato)
- Legado nunca é tocado até a virada; é a fonte de verdade atual.
- Cut-over atrás de **feature flag por org**: reverter = desligar a flag (consumidores voltam ao legado).
- View `vw_marketing_ad_performance_v2`: `DROP VIEW` (não afeta a atual).
- Upserts de (B) são idempotentes e só preenchem colunas já existentes; se necessário, pausar o job novo e retomar os crons antigos.
- Tabelas `meta_*` podem ser truncadas sem afetar o legado.

## F) Sequência de deploy do cut-over (quando houver GO)
1. Migration da view `_v2` + índices.
2. Job novo (pg_cron) `meta-performance-sync` incremental + upserts de (B) rodando EM PARALELO ao legado (dual-write).
3. Validar equivalência contínua por N dias (query de D).
4. Feature flag: repontar 1 org para a `_v2`/novo (dual-read) → validar UI.
5. Virar a flag para todas as orgs.
6. Desligar `meta-discover-ads-cron` + `marketing-insights-sync-daily`.
7. Janela de observação → deprecar tabelas antigas (fase posterior, fora desta V1).
