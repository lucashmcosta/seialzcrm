# meta-whatsapp-send

Path: `supabase/functions/meta-whatsapp-send/index.ts` (770 LOC)

## Gatilho
- Chamada do frontend (`POST`) para enviar mensagem outbound via WhatsApp Cloud (Meta).
- Também invocável indiretamente por `scheduled-messages-cron` através do dispatcher compartilhado.

## Imports de `_shared/`
- `cors.ts`
- `crypto.ts` (`decryptSecret`)
- `meta-whatsapp/graph.ts`
- `meta-whatsapp/credentials.ts` (`resolveAppSecretForIntegration`)
- `endpoint-migration-note.ts` (`ensureEndpointMigrationNote`)

## Env vars
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

## Tabelas — LEITURA
- `communication_endpoints`
- `message_threads`
- `organization_integrations`
- `contacts`
- `whatsapp_templates`
- `compliance_blocks` (leitura para checagem de bloqueios)
- `users`

## Tabelas — ESCRITA
- `messages` (insert do outbound + updates de status)
- `message_threads` (update de last_message_* / janela 24h)
- `compliance_blocks` (insert — log de bloqueio, ex.: janela fechada)

## APIs externas
- Meta Graph API (Cloud API `/messages`) via `_shared/meta-whatsapp/graph.ts`.

## Observações
- Implementa os guards de compliance (janela 24h, allowed_purposes, rate limit, LOW endpoint 7020) chamando `compliance_blocks` para telemetria.
- `ensureEndpointMigrationNote` sugere migração em andamento do modelo antigo de endpoints — código transicional [INCERTO].
- 770 linhas concentram: validação de credenciais, resolução de template, expansão de variáveis, envio, persistência da mensagem e atualização de thread. Alto acoplamento.

> **Atualização 2026-07-22** (fora da auditoria congelada de 2026-07-04): a função passou a honrar o `endpointId` explícito enviado pelo dispatcher após validar `organization_id`, `provider = meta_whatsapp` e `is_active`. Fallback a `thread.primary_endpoint_id` só ocorre quando o payload não traz `endpointId`. Log antigo `endpoint_override_ignored` (warn) foi substituído por `line_routing_honored` (info) quando o endpoint efetivo diverge do primary da thread. Racional em [`docs/plans/2026-07-endpoint-lines-rotation.md`](../../plans/2026-07-endpoint-lines-rotation.md).
