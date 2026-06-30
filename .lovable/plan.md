## Problema

`InboxComposer` bloqueia o envio quando `contact.lifecycle_stage !== 'customer'`. Correto para threads do escopo normal do Inbox, mas quebra o fluxo de **Nova conversa de Atendimento**, onde o atendente escolhe manualmente um contato (lead, sem lifecycle, etc.) com endpoint de Atendimento.

## Solução

Persistir o marcador na própria thread, no campo já existente `message_threads.last_routing_decision` (jsonb, sem migration), gravando-o no momento em que o `NewConversationDialog` cria a thread pelo botão do Inbox. O `InboxComposer` libera **apenas** o guard de lifecycle quando esse marcador está presente e o endpoint é de Atendimento.

Sem mudança de schema, sem alterar `lifecycle_stage`, sem alterar listagem do Inbox, sem afetar `/messages`/Viagi.

### Convenção do marcador

`last_routing_decision` já é usado como jsonb (ex.: `{ action: 'manual_assignment', ... }`). Vamos usar:

```json
{
  "action": "inbox_manual_start",
  "by_user_id": "<users.id>",
  "endpoint_id": "<endpoint>",
  "at": "<iso>"
}
```

### 1. `src/components/messages/NewConversationDialog.tsx`
- Adicionar prop opcional `routingDecision?: Record<string, unknown>`.
- Quando definido **e** a dialog está criando uma thread nova (branch do `insert`), incluir `last_routing_decision: routingDecision` no `insertPayload`.
- Não aplicar em thread já existente (sem update — para não sobrescrever histórico de roteamento).

### 2. `src/pages/inbox/InboxPage.tsx` e `src/components/mobile/MobileInbox.tsx`
- Passar ao `NewConversationDialog`:
  ```ts
  routingDecision={{
    action: 'inbox_manual_start',
    by_user_id: internalUserId,
    at: new Date().toISOString(),
  }}
  ```

### 3. `src/hooks/inbox/useInboxThread.ts`
- Incluir `last_routing_decision` no `THREAD_SELECT` para o composer enxergar o marcador.

### 4. `src/hooks/inbox/useInboxThreads.ts` (lista)
- Verificar se o tipo `InboxThreadRow` precisa expor `last_routing_decision`. Se a lista não carrega o campo, o `MobileInbox` precisa carregá-lo (a versão mobile usa o mesmo `InboxComposer`). Adicionar o campo ao select da lista se necessário, ou garantir que o thread passado ao composer venha de `useInboxThread` (que já carrega tudo).

### 5. `src/components/inbox/InboxComposer.tsx`
- Ler `(thread as any).last_routing_decision?.action` (tipo jsonb).
- Ajustar o guard de lifecycle (linhas 156-167):
  ```ts
  const isManualInboxStart =
    (thread as any).last_routing_decision?.action === 'inbox_manual_start'
    && (endpointPurpose === 'customer_service' || endpointPurpose === 'other');

  if (!passesCustomerRule && !passesServiceEndpointRule && !isManualInboxStart) {
    return <DisabledBar ... />;
  }
  ```
- Demais guards inalterados: status `resolved`/`closed` continua bloqueando; endpoint `commercial`/`vendor_personal` continua bloqueando (o `isManualInboxStart` só vale para `customer_service`/`other`).

## Critério de aceite

- `/inbox` (desktop e mobile): "Nova conversa" → buscar contato qualquer (lead/sem lifecycle) → selecionar → composer libera envio.
- Persiste após reload (marcador está em `message_threads.last_routing_decision`).
- Threads antigas com lifecycle ≠ customer e sem o marcador permanecem bloqueadas.
- Envio sai pelo endpoint de Atendimento (já garantido pelo `forcePurposes`).
- Guards de status e de endpoint `commercial`/`vendor_personal` continuam ativos.
- `/messages` e Viagi não afetados.

## Observação

O campo `last_routing_decision` também é sobrescrito em reatribuições manuais (`InboxThreadDetail.handleAssign`). Isso é aceitável porque, após uma reatribuição, é razoável reaplicar o guard normal — e, na prática, threads "manual start" só precisam do bypass na primeira mensagem; depois que o contato responde, o caminho `csIncludesServiceEndpoints` + endpoint `customer_service` já cobre. Se o usuário quiser preservar o marcador entre reatribuições, é um ajuste adicional simples (merge ao invés de overwrite), mas fora do escopo deste pedido.
