# lead-webhook

Path: `supabase/functions/lead-webhook/index.ts` (523 LOC)

## Gatilho
- Webhook público (chamado por integrações externas — landing pages, formulários, plataformas de ads que não usam Meta Lead Ads nativo).
- `GET` (provavelmente healthcheck/descoberta) e `POST` (ingest do lead).

## Imports de `_shared/`
- Nenhum direto detectado.

## Env vars
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

## Tabelas — LEITURA
- `organization_api_keys` (auth por API key)
- `webhook_field_mappings` (mapeamento dinâmico de payload → colunas)
- `pipeline_stages`
- `organizations`

## Tabelas — ESCRITA
- `contacts` (insert/update com dedup)
- `opportunities` (insert)
- `activities` (insert)

## APIs externas
- Nenhuma.

## Observações
- Autenticação por chave listada em `organization_api_keys` (não JWT).
- Contém a lógica de deduplicação descrita em `mem://leads/webhook-duplicate-prevention-logic`.
- Faz o mesmo trabalho de "criar contact + opp + activity" que os webhooks WhatsApp — mais um ponto de duplicação com `meta-whatsapp-webhook` e `twilio-whatsapp-webhook`.
