## Diagnóstico

O erro `ReferenceError: useWhatsAppProvider is not defined` em `InboxComposer.tsx:161` **já está resolvido no código atual**.

Verificação:
- `rg "useWhatsAppProvider" src/components/inbox/InboxComposer.tsx` → 0 ocorrências.
- Linha 152 hoje deriva o provider de forma síncrona: `const endpointProvider = thread?.primary_endpoint?.provider ?? null`.
- Nenhum outro arquivo em `src/components/inbox/` ou `src/hooks/inbox/` referencia o hook.
- Os únicos consumidores restantes de `useWhatsAppProvider` são módulos de Messages/WhatsApp (`WhatsAppChat`, `MessagesList`, `MobileMessagesList`, `ContactMessages`) — todos com o import correto e fora do escopo do Inbox.

## Causa do erro reportado

O erro no Sentry (timestamp `19:08:34.472Z`) foi gerado no instante do `[vite] hot updated: /src/components/inbox/InboxComposer.tsx` da sessão anterior. Foi um estado intermediário do HMR: a chamada ao hook foi removida antes do import, ou vice-versa, e o Vite aplicou o patch parcial em memória. O bundle final já não contém a referência.

## Ação

Nenhuma alteração de código necessária. Recomendação para o usuário:

1. **Hard reload** (Ctrl+Shift+R) na aba que ainda mostra a tela branca — o módulo em memória do browser é o resíduo do HMR quebrado.
2. Caso o erro reapareça após o reload, reabra reportando um novo timestamp — aí sim haverá regressão real a investigar.

Se preferir, posso adicionar um guard defensivo (try/catch no `SentryFallback` já cobre isso) ou simplesmente marcar este item como "no-op / stale HMR" e seguir.
