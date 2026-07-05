# meta-whatsapp-webhook

Path: `supabase/functions/meta-whatsapp-webhook/index.ts` (1053 LOC)

## Gatilho
- Webhook externo do **Meta WhatsApp Cloud API** (Graph API webhooks).
- Suporta `GET` (verificação via `hub.challenge`) e `POST` (recebimento de mensagens/statuses).

## Imports de `_shared/`
- `cors.ts` (`corsHeaders`)
- `crypto.ts` (`decryptSecret`)
- `meta-whatsapp/graph.ts` (`metaWaGetMediaUrl`, `metaWaDownloadMedia`, `MetaWaGraphError`)
- `meta-whatsapp/credentials.ts`

## Env vars (nomes)
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

## Tabelas — LEITURA
- `organization_integrations`
- `communication_endpoints`
- `pipeline_stages`
- `ai_agents`

## Tabelas — ESCRITA
- `contacts` (insert/update)
- `opportunities` (insert)
- `messages` (insert)
- `notifications` (insert)
- `activities` (insert)
- `message_threads` (insert/update)
- `integration_inbound_events` (insert — enfileira evento no pipeline genérico)

## APIs externas
- Meta Graph API (via `_shared/meta-whatsapp/graph.ts`): `graph.facebook.com` — download de mídia e leitura de metadados.

## Chamadas para outras functions
- `POST ${SUPABASE_URL}/functions/v1/ai-agent-respond` — dispara resposta da IA após ingest.

## Observações
- Function extensa (1053 linhas) que mistura: verificação webhook, resolução de endpoint, criação de contato/oportunidade, ingest de mensagem e disparo do agente IA. Forte candidato a decomposição.
- Grava tanto em `integration_inbound_events` quanto diretamente em `messages`/`message_threads` — coexistem os dois modelos (novo pipeline via dispatcher e caminho antigo direto). [INCERTO] se ainda é intencional.
- Nenhum uso de RPC.
