## Diagnóstico

**Causa raiz:** `InboxComposer` resolve o provider via `useWhatsAppProvider({ threadId })`, que faz 2 queries assíncronas (`message_threads` → `communication_endpoints`). Enquanto carrega, retorna `null`, e `templateSelectorProvider` cai em `undefined`. No `WhatsAppTemplateSelector`, `provider=undefined` faz fallback para Twilio (`provider.is.null OR provider.eq.twilio`). Resultado: se o usuário abre o seletor antes da hook resolver, vê templates Twilio mesmo quando o endpoint é Meta. Além disso, há janela de inconsistência entre re-renders.

**Confirmações:**
- `thread.primary_endpoint` já vem no select do `useInboxThread` (linha 32), mas só com `id, purpose, external_address` — **falta `provider`**.
- `WhatsAppTemplateSelector` filtra corretamente por `provider='meta_cloud_api'` quando recebe a prop.
- A escolha de endpoint em `NewConversationDialog` (Inbox) já prioriza Meta BR via `endpointRank` — não precisa mudar.
- `/messages` (`MessagesList`, `WhatsAppChat`) não usa `InboxComposer` e fica intacto.

## Correção

1. **`src/hooks/inbox/useInboxThread.ts`**
   - Incluir `provider` no embed: `primary_endpoint:communication_endpoints ( id, purpose, external_address, provider )`.

2. **`src/hooks/inbox/inboxScope.ts`**
   - Estender o tipo `primary_endpoint` em `InboxScopedThread` para incluir `provider?: string | null`.

3. **`src/components/inbox/InboxComposer.tsx`**
   - Remover `useWhatsAppProvider` (e import).
   - Estender o tipo local de `thread.primary_endpoint` com `provider?: string | null`.
   - Derivar de forma síncrona:
     ```ts
     const endpointProvider = thread.primary_endpoint?.provider ?? null;
     const templateSelectorProvider =
       endpointProvider === 'meta_cloud_api' ? 'meta_cloud_api'
       : endpointProvider === 'twilio' ? 'twilio'
       : undefined;
     ```
   - Passar `templateSelectorProvider` nos dois pontos onde o seletor é renderizado (linhas 501 e 659).

## Fora de escopo (não mexer)

- `NewConversationDialog` escolha de endpoint (já prioriza Meta).
- `WhatsAppTemplateSelector` (lógica de filtro está correta).
- `/messages`, `WhatsAppChat`, `MobileMessagesList`, fluxo Twilio legado.
- `last_routing_decision` / guards de lifecycle.

## Critério de aceite

- Thread com `primary_endpoint.provider='meta_cloud_api'` → seletor lista somente templates Meta.
- Thread com `primary_endpoint.provider='twilio'` (ou null legado) → continua listando Twilio.
- Sem race condition na abertura inicial (provider sai junto do thread no mesmo fetch).
- `/messages` inalterado.
