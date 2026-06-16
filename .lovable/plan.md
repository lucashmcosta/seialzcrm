# Sequência de execução aprovada

## Etapa 1 — Configurar webhook do sender 7067 (primeiro, isolado)

Invocar `twilio-whatsapp-setup` em modo `update-webhook` para o sender `XEcf3979c0dce893287cf542026e7fc983` da org `40ae935c-…`, apontando para:

- `inbound` → `…/twilio-whatsapp-webhook/inbound?orgId=40ae935c-…`
- `status`  → `…/twilio-whatsapp-webhook/status?orgId=40ae935c-…`

Sem mexer em código ainda. Vou rodar essa chamada e te avisar pra você testar enviar uma mensagem do número pessoal pro 7067.

## Etapa 2 — Verificar inbound no 7067

Após seu teste, conferir nos logs do `twilio-whatsapp-webhook`:

- Que o POST chegou com `To: whatsapp:+551150287067`.
- Que `resolve_communication_endpoint` retornou o endpoint `b303253e-…` (sender 7067).

Se algum desses dois falhar, paro aqui e ajusto antes de continuar.

## Etapa 3 — Separação de threads por endpoint

Só depois da Etapa 2 confirmada, aplicar em `supabase/functions/twilio-whatsapp-webhook/index.ts`:

```text
SELECT id, primary_endpoint_id
FROM message_threads
WHERE org=? AND contact=? AND channel='whatsapp'
  AND (primary_endpoint_id = :endpointId OR primary_endpoint_id IS NULL)
ORDER BY primary_endpoint_id NULLS LAST
LIMIT 1
```

- Match com mesmo endpoint → usa.
- Match com thread legada sem endpoint → backfill do `primary_endpoint_id` e usa.
- Nada bate → cria thread nova com `primary_endpoint_id = endpointId`.

Resultado: 7067 vira conversa separada para o mesmo contato.

## Etapa 4 — UI

Em paralelo à Etapa 3:

1. **Remover dropdown "Enviar de"** do composer em `src/pages/messages/MessagesList.tsx` (e a state correlata). `twilio-whatsapp-send` continua intacto e roteia pelo `primary_endpoint_id` da thread.

2. **Badge condicional**:
   - `useOrgWhatsAppEndpoints` passa a expor `officialNumbers: Set<string>` (já calcula `ownNumbers` a partir de `organization_integrations.config_values.whatsapp_number`).
   - Na lista de conversas (`ChatListItem`) e no header do chat: só renderiza `<EndpointBadge>` quando `external_address` **não** estiver em `officialNumbers`.
   - Threads do 7027 (oficial) → sem badge. Threads do 7067 (novo) → `via …7067`.

## Fora do escopo (confirmado)

- Não mexer em `twilio-whatsapp-send`.
- Não migrar/apagar threads antigas que misturaram mensagens dos dois números.

## Arquivos que vou alterar

- `supabase/functions/twilio-whatsapp-webhook/index.ts` (Etapa 3)
- `src/pages/messages/MessagesList.tsx` (Etapa 4)
- `src/hooks/useOrgWhatsAppEndpoints.ts` (Etapa 4)

A Etapa 1 é uma chamada de função, sem alteração de código.
