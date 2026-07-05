# meta-lead-ads-discover

Path: `supabase/functions/meta-lead-ads-discover/index.ts` (181 LOC)

## Gatilho
- Chamada do frontend — descobre páginas / formulários / perguntas do Lead Ads e persiste.

## Imports de `_shared/`
- `cors.ts`, `crypto.ts` (`decryptSecret`, `encryptSecret`), `meta-graph.ts` (`metaGraphGet`)

## Env vars
- `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`

## Tabelas — LEITURA
- `organization_integrations`, `meta_lead_pages`

## Tabelas — ESCRITA
- `meta_lead_pages` (upsert)
- `lead_forms` (upsert, múltiplos pontos)
- `lead_form_questions` (upsert)

## APIs externas
- Meta Graph API — `/{page-id}/leadgen_forms`, `/{form-id}?fields=questions`.

## Observações
- `encryptSecret` importado embora seja discovery — [INCERTO] provavelmente re-cifra page access token descoberto.
