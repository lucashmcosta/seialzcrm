## Adicionar separador de data em ContactMessages

A view de Mensagens dentro do Contato (`src/components/contacts/ContactMessages.tsx`) renderiza as bolhas sem o chip "Hoje / Ontem / 24 de fevereiro de 2026" que já existe na tela principal de Mensagens (via `InboxConversationTimeline` + `DateSeparator` + `shouldShowDateSeparator`).

### Mudança
No `messages.map((message) => ...)` (linha ~603), passar a usar índice e mensagem anterior, e renderizar `<DateSeparator />` quando o dia muda — mesmo helper já usado no Inbox.

```tsx
import { DateSeparator } from '@/components/messages/DateSeparator';
import { shouldShowDateSeparator } from '@/lib/dateSeparator';

messages.map((message, idx) => {
  const prev = messages[idx - 1];
  const showSep = shouldShowDateSeparator(message.sent_at, prev?.sent_at);
  const isOutbound = message.direction === 'outbound';
  return (
    <div key={message.id}>
      {showSep && <DateSeparator date={new Date(message.sent_at)} />}
      <div className={`flex ${isOutbound ? 'justify-end' : 'justify-start'}`}>
        {/* bolha existente inalterada */}
      </div>
    </div>
  );
})
```

Nada mais muda: mesmas regras (Hoje / Ontem / dia da semana / dd/mm/aaaa) e mesmo visual do chip da tela de Mensagens, garantindo consistência entre as duas views.

### Escopo
- Arquivo único: `src/components/contacts/ContactMessages.tsx`
- Sem mudanças em backend, hooks ou estilos globais.