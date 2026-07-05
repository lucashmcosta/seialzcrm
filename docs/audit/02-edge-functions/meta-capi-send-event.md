# meta-capi-send-event

Path: `supabase/functions/meta-capi-send-event/index.ts` (365 LOC)

## Gatilho
- Chamada do frontend (evento de conversão) e do `meta-capi-retry-cron`.

## Imports de `_shared/`
- `cors.ts`
- `crypto.ts` (`decryptSecret`)

## Env vars
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `META_GRAPH_API_VERSION`

## Tabelas — LEITURA
- `capi_event_log` (dedup / idempotência)
- `organization_integrations`
- `contacts`
- `opportunities`

## Tabelas — ESCRITA
- `capi_event_log` (insert + updates de status/attempts)

## APIs externas
- Meta Graph API `POST /events` (Conversions API). URL construída dinamicamente com `META_GRAPH_API_VERSION`.

## Observações
- Faz hashing (SHA-256) dos dados de PII conforme especificação CAPI antes de enviar. [INCERTO] confirmação no código.
- Loga todos os eventos em `capi_event_log` para auditoria e retry.
