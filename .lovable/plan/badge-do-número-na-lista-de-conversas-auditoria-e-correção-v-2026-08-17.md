# Badge do número na lista de conversas — auditoria e correção visual

## Auditoria da thread "Henrique" (read-only, confirmada no banco)

| # | Item | Valor real |
|---|---|---|
| 1 | `thread_id` | `e3e4cbdf-bcf7-4a0b-a080-f66b4bea3d4b` (contato `a4e6700f…`, `business_context = sales`) |
| 2 | `primary_endpoint_id` | `3ed219e0-b919-4a1f-b2f6-6806cfafe6f7` → `+551150287020`, `evolution_api`, `is_active = true` |
| 3 | `last_message_id` | `331351cc-e216-44f5-81a5-fcc3d6aa1f2d` (inbound, 17/08 15:31) |
| 4 | `endpoint_id` dessa última mensagem | `3ed219e0…` — o **mesmo** 7020 Evolution |
| 5 | endpointId resolvido pelo `useThreadEndpointMap` | `3ed219e0…` (correto; o fallback nem precisou rodar, pois `primary_endpoint_id` não é nulo) |
| 6 | `address` entregue ao `RouteBadge` | **`null`** |
| 7 | Por que não renderizou | `RouteBadge` `variant="compact"` tem `if (!address) return null` |

### Causa raiz

O id do endpoint está certo; o que falha é a **tradução id → número**.

Em `MessagesList.tsx` a lista faz `endpointById[threadEndpointMap[thread.id]]`, e `endpointById` é montado a partir de `useOrgWhatsAppEndpoints`, que filtra a query com:

- `.eq('is_active', true)`
- `.not('sender_sid', 'is', null)`
- `.neq('status', 'offline')`

O endpoint Evolution 7020 tem **`sender_sid = NULL`** e `status = 'unknown'` (campos que só existem no mundo Twilio/Meta). Logo ele **não está** em `orgEndpoints`, `endpointById[3ed219e0…]` é `undefined`, `endpointAddress` vira `null` e o badge não renderiza.

Ou seja: o fallback do hook não é o problema — o problema é a fonte usada para resolver o endereço, que exclui endpoints Evolution.

## Correção proposta (somente resolução visual)

1. **`src/hooks/useThreadEndpointMap.ts`** — passa a retornar, por thread, além do id, os metadados de exibição lidos diretamente de `communication_endpoints` (sem os filtros de Twilio/Meta): `address`, `provider`, `isActive`.
   - Nova prioridade de leitura, conforme a regra final: **(1)** `endpoint_id` da última mensagem (`last_message_id`) quando não nulo; **(2)** `primary_endpoint_id`; **(3)** sem endpoint identificável → sem badge.
   - Continua uma leitura pura: nenhuma escrita, nenhum efeito em roteamento.

2. **`src/pages/messages/MessagesList.tsx`** (bloco do `ChatListItem`, ~linhas 1996-2007) — `endpointAddress` / `endpointProvider` / `endpointIsActive` passam a vir do resultado do hook, em vez do `endpointById` (que fica restrito ao seu uso atual de composer/cabeçalho). Mantém o fallback já existente para a thread `selectedThreadOverride`.

3. Nenhuma mudança em `RouteBadge`: com `address` preenchido e `isActive = true` ele já renderiza `📱 7020` com o mesmo padrão visual dos outros números.

## Validação

- Preview em `/commercial`: confirmar que a thread "Henrique" (`e3e4cbdf…`) exibe o badge `7020` na lista, e que threads em 7067/7027 continuam exibindo os seus.
- Typecheck limpo.

## Fora de escopo (não será tocado)

Envio, Route, `active_endpoint_id`, realtime, seletor "Responder por", backend, edge functions, dados e migrações.
