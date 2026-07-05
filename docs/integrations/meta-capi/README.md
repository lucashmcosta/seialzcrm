# Meta CAPI (Conversions API)

**Referência técnica:** `docs/audit/04-integracoes/meta-capi.md` e `docs/audit/02-edge-functions/meta-capi-*`.

## Finalidade
Envio server-side de eventos de conversão para Meta (Pixel/Dataset).

## Autenticação
- Token de acesso Meta por org, cifrado em `organization_integrations`.
- Onboarding:
  - `meta-capi-connect` — valida pixel_id/dataset_id + token.
  - `meta-capi-connect-from-existing` — reusa token já conectado.

## Envio
- `meta-capi-send-event` — POST para Meta Graph `/events`.
- Hash SHA-256 obrigatório em campos PII (email, phone, etc).
- Todo evento logado em `capi_event_log` (18 col) para audit + retry.

## Retry
- `meta-capi-retry-cron` — reprocessa eventos falhos.

## Payload
```json
{
  "event_name": "Lead",
  "event_time": <unix>,
  "action_source": "system_generated",
  "user_data": { "em": ["<sha256>"], "ph": ["<sha256>"] },
  "custom_data": {...}
}
```

## Falhas comuns
- Token sem escopo `ads_management`.
- Pixel/Dataset ID errado.
- Hashing incorreto (deve ser sempre lowercase antes do SHA-256).

## Rate limits
Meta Graph — 200 chamadas/hora/usuário por padrão.

## Env
- `META_GRAPH_API_VERSION` (edge function).
