
## Escopo

Corrigir apenas o roteamento no frontend. Manter `thread-migrate-endpoint-send` como está (Evolution-only). Não tocar em `dispatchWhatsAppSend`, `meta-whatsapp-send`, `twilio-whatsapp-send`.

## Bug

`ContactConversations.tsx` → **Abrir conversa comercial** navega para `/messages?thread=<id>`. No `MessagesList`, `defaultComposerEndpointId` (linhas 659-670) já resolve corretamente para o endpoint comercial ativo (Evolution `8439` no piloto). Porém, ao enviar, o branch atual só chama `migrateThreadAndSend` quando `bypassWindow=true`. Sem bypass, cai no `dispatchWhatsAppSend`, cuja "REGRA DURA" (linhas 262-289) reescreve `endpointId` para `primary_endpoint_id` (`2890`) e o envio vai pelo número errado.

## Mudança única

Arquivo: `src/pages/messages/MessagesList.tsx`, dentro de `handleSendMessage` (branch `shouldMigrate` ~linhas 1153-1169).

Substituir a condição atual por uma regra semântica que não depende de `bypassWindow` nem de "alvo Evolution explícito", mas mantém o alvo sempre Evolution (porque a edge function só aceita Evolution):

```
const composerEndpoint = composerEndpointId ? endpointById[composerEndpointId] : null;
const composerIsEvolution = composerEndpoint?.provider === 'evolution_api';
const composerPurpose = composerEndpoint?.purpose ?? null;

const contextPurposeMatches =
  (selectedThreadBusinessContext === 'sales' && isSalesPurpose(composerPurpose)) ||
  (selectedThreadBusinessContext === 'customer_service' && composerPurpose === 'customer_service');

const shouldMigrate =
  !!selectedThreadId &&
  !!composerEndpointId &&
  composerIsEvolution &&                                     // alvo Evolution (limitação da edge fn atual)
  !!selectedThreadPrimaryEndpointId &&
  composerEndpointId !== selectedThreadPrimaryEndpointId &&
  contextPurposeMatches;

const targetEvolutionId = shouldMigrate ? composerEndpointId : null;
```

Quando `shouldMigrate=true`:
- chamar `migrateThreadAndSend({ organizationId, threadId, targetEndpointId: composerEndpointId, message, userId, replyToMessageId })` — exatamente como o branch atual;
- após sucesso: `setBypassWindow(false)`, limpar `composerEndpointByThread[threadId]`, `refetchThreads()`;
- **não** passar pelo `dispatchWhatsAppSend`.

Quando `shouldMigrate=false`: comportamento atual (dispatcher normal).

Nenhum hardcode de número, org ou endpoint id — a decisão é derivada de `composerEndpoint.provider`, `composerEndpoint.purpose` e `business_context` da thread.

## Efeitos colaterais controlados

- Se o composer resolver um endpoint comercial **não-Evolution** (ex.: Meta) diferente do primary → `composerIsEvolution=false` → `shouldMigrate=false` → cai no dispatcher legado (comportamento atual, sem regressão). A migração cross-provider para Meta/Twilio fica para a fase pós-piloto, como pedido.
- Se o composer resolver o mesmo endpoint do primary → `shouldMigrate=false` → envio direto pelo dispatcher (caminho quente inalterado).
- Se o contexto for `customer_service` e o composer resolver o endpoint CS Evolution diverso do primary → também migra corretamente (regra é semântica, não hardcoded Comercial).

## Fora do escopo (explícito)

- `thread-migrate-endpoint-send/index.ts` — permanece Evolution-only.
- `dispatchWhatsAppSend.ts` — permanece inalterado (regra dura anti cross-number continua protegendo os demais caminhos).
- `meta-whatsapp-send`, `twilio-whatsapp-send` — não tocar.
- `ContactConversations.tsx` — não tocar.

## Validação (Sarto Rodrigues, org Viagi)

1. `/contacts/<id>` → aba **Conversas** → **Abrir conversa comercial**.
2. Composer exibe endpoint `8439` (Evolution).
3. Enviar "teste 1" → console mostra `[thread-migrate-endpoint-send] migrate done`; a mensagem aparece na thread; `whatsapp_status='sent'`.
4. `select primary_endpoint_id from message_threads where id=<thread>` → agora aponta para o endpoint do `8439`.
5. Divisor `Número alterado: 2890 → 8439` renderiza entre o histórico antigo e a nova mensagem (já feito por `MessagesList` comparando `endpoint_id`).
6. F5 na thread → composer permanece no `8439`; próximo envio segue direto pelo `dispatchWhatsAppSend` (agora `composerEndpointId == primary_endpoint_id`, `shouldMigrate=false`).
7. Abrir a mesma thread por `/messages` direto: comportamento idêntico.
8. Repetir com **Abrir atendimento** em outro contato: composer resolve endpoint `customer_service`; se divergir do primary e for Evolution, migra pelo mesmo caminho; se for Meta/Twilio, dispatcher legado (sem regressão).
