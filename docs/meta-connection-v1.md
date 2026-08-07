# Meta Connection V1 — Documentação

Camada de autenticação Meta **canônica e reutilizável** (Facebook **Login for Business**),
com domínios normalizados de **Performance (Ads)** e **Organic (read-only)**.
**Aditiva e não-destrutiva:** não faz cut-over do pipeline de marketing atual
(`marketing_campaigns`/`marketing_campaign_insights_daily`/UI/attribution) — isso é a Fase 6,
gated (ver `docs/meta-cutover-preflight.md`).

## Arquitetura
Conexão = **autorização Meta** (pode descobrir vários Businesses). Assets descobertos →
seleção explícita (`discovered | selected | disabled`) → só `selected` entram em sync.
Consumidores (Performance, Organic, Lead Ads) referenciam a conexão/assets.

## Fluxo OAuth
1. `meta-connect-intent` (nonce one-time, valida org+user; devolve `app_id/config_id/graph_version`).
2. Frontend carrega JS SDK (pt_BR) → `FB.login({config_id, response_type:'code', override_default_response_type:true})`.
3. `meta-connect`: consome intent (atômico), troca `code→token`, `debug_token` (tipo/scopes/expiração
   **sem heurística**), grava conexão + credencial (cifrada, tabela separada), dispara discovery, audit.

## Tabelas (schema `public`)
- **Conexão/infra:** `meta_connections` (metadados) · `meta_connection_credentials` (ciphertext, **só service_role**) · `meta_connection_intents` (nonce) · `meta_assets` (discovered/selected/disabled) · `meta_sync_state` (cursor) · `meta_sync_runs` (versionamento: sync/parser/source_api_version) · `meta_connection_audit` · `meta_data_deletion_requests`.
- **Performance (normalizado):** `meta_campaigns` · `meta_ad_sets` · `meta_ads` · `meta_ad_creatives` · `meta_ad_insights` (diário, nível ad; métricas espelham `marketing_campaign_insights_daily`).
- **Organic:** `meta_media` · `meta_media_insights`.
- **Aditivo:** `organization_integrations.meta_connection_id` (FK, compat Lead Ads).
- RLS: `current_user_org_ids()`; credenciais sem acesso a `authenticated`.

## Edge Functions
`meta-connect-intent`, `meta-connect`, `meta-connect-discover`, `meta-connect-select-assets`,
`meta-performance-sync` (idempotente/cursor/backoff/paginação; grava `meta_*`),
`meta-organic-sync` (media/insights), `meta-connect-disconnect` (soft, preserva histórico),
`meta-data-deletion` + `meta-data-deletion-callback` (público, valida `signed_request`),
`meta-capability-test` (bateria read-only).
Compartilhado: `_shared/meta/connection.ts` (exchange/introspect/resolveToken/backoff/paginate/audit).
Trigger headless/cron: header `x-sync-token` = `META_SYNC_TRIGGER_TOKEN` nos syncs.

## Secrets / env
Backend (Supabase): `FACEBOOK_APP_ID`, `FACEBOOK_APP_SECRET`, `FACEBOOK_CONFIG_ID`,
`META_TOKEN_ENCRYPTION_KEY`, `META_GRAPH_API_VERSION` (v25.0), `META_SYNC_TRIGGER_TOKEN`.
Versão da Graph é fonte única (backend) e o frontend recebe via `meta-connect-intent` (sem `VITE_` duplicado).

## Matriz de capabilities (E2E real, read-only)
Validado em prod com token System-User de 19–21 scopes (orgs Central Trabalhista e Viagi).

| Grupo | Capabilities | Status |
|---|---|---|
| Performance | Businesses, Ad Accounts, Campaigns, Ad Sets, Ads, Creatives, Insights, Pixels | ✅ READY |
| Organic (Instagram) | IG accounts, IG media, IG insights (reach/likes/comments) | ✅ READY (Viagi: 100 media + 100 insights, reels reach ~105k) |
| Organic (Facebook) | Pages, Page posts/media, Reels | ✅ READY (posts lidos) |
| Organic (Facebook) | **Page/post insights** | ⚠️ ver Follow-ups |
| Lead Ads | Pages, Leadgen forms, **leitura de leads** (`leads_retrieval`) | ✅ READY |

Evidência Performance (CT): 7 campaigns · 11 ad sets · 42 ads · 42 creatives · 641 insights;
idempotência (0 duplicatas); equivalência vs legado: 614/614 cobertas, 592 exatas (96,4%),
20 new≥old / 0 new<old, +27 new_only, +1,97% spend (frescor/atribuição — novo ≥ antigo, 0 perda).

## Follow-ups (fora do escopo V1, não bloqueiam)
- **Facebook Post Insights (Graph API v25):** contagem de insights de **posts de Página** retorna 0
  nas duas orgs testadas (media lê ok; IG insights ok). É item de **calibração de métrica por tipo de post
  no v25** (conjunto de métricas válidas mudou), não permissão/arquitetura. Investigar o metric-set correto.
- **Consolidação de reconexão:** reconectar cria nova `meta_connections`; hoje marcamos as antigas
  `revoked/superseded`. Avaliar UPSERT/merge de conexão no futuro.

## Cut-over da Fase 6 — checklist (GATED; NÃO iniciar sem GO)
Artefatos SQL prontos (não aplicados) em `docs/meta-cutover-preflight.md`.
1. [ ] Aplicar migration da view `vw_marketing_ad_performance_v2` (shape idêntico ao atual).
2. [ ] Agendar `meta-performance-sync` incremental (pg_cron) + upserts `meta_*→marketing_*` **em paralelo** ao legado (dual-write).
3. [ ] Rodar testes de equivalência por org (cobertura 100%, divergências só new≥old, spend na tolerância).
4. [ ] Feature flag por org → repontar 1 org (dual-read) e validar a UI de `src/pages/marketing/`.
5. [ ] Virar a flag para todas as orgs.
6. [ ] Desligar crons legados (`meta-discover-ads-cron`, `marketing-insights-sync-daily`).
7. [ ] Janela de observação → deprecar tabelas antigas (fase posterior).
Attribution: `contacts.marketing_campaign_id` **mantido**, preenchido a partir de `meta_ads` (aprovado).

## Rollback (exato)
- Legado é a fonte de verdade até a virada (intocado). Reverter = **desligar a feature flag** (volta ao legado).
- `DROP VIEW vw_marketing_ad_performance_v2` (não afeta a atual).
- Upserts (B) são idempotentes e só preenchem colunas existentes; pausar o job novo e retomar os crons antigos.
- Tabelas `meta_*` podem ser truncadas sem afetar o legado.
