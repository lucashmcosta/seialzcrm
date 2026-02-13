

# Corrigir exibicao de respostas (reply) no WhatsApp

## Problema

A funcionalidade de reply (responder mensagem) nao mostra a mensagem citada nem para o atendente nem para o cliente porque:

1. **Mensagens recebidas em tempo real**: O Supabase Realtime envia apenas a row crua da tabela `messages`. O campo `reply_to_message_id` vem preenchido, mas o join `reply_to_message` (que traz `content` e `direction` da mensagem original) nao existe no payload. Resultado: a mensagem chega mas o `QuotedMessage` nunca aparece.

2. **Mensagens enviadas pelo atendente**: A mensagem temporaria (optimistic UI) tem o `reply_to_message` correto e aparece. Porem, quando a mensagem real chega pelo Realtime, ela substitui a temporaria -- e como o payload real nao tem o join, o quote desaparece.

## Solucao

Quando uma mensagem chega via Realtime e tem `reply_to_message_id` preenchido, buscar o conteudo da mensagem original no array local de mensagens (que ja esta carregado). Se nao encontrar localmente, fazer uma query pontual ao banco.

## Alteracoes

### Arquivo: `src/pages/messages/MessagesList.tsx`

**1. Criar funcao helper `resolveReplyContext`**

```typescript
const resolveReplyContext = async (message: Message): Promise<Message> => {
  if (!message.reply_to_message_id || message.reply_to_message) {
    return message; // Ja tem contexto ou nao e reply
  }

  // Tentar resolver localmente primeiro
  const localOriginal = messages.find(m => m.id === message.reply_to_message_id);
  if (localOriginal) {
    return {
      ...message,
      reply_to_message: {
        content: localOriginal.content,
        direction: localOriginal.direction,
      },
    };
  }

  // Buscar no banco se nao encontrou localmente
  const { data } = await supabase
    .from('messages')
    .select('content, direction')
    .eq('id', message.reply_to_message_id)
    .single();

  if (data) {
    return {
      ...message,
      reply_to_message: data,
    };
  }

  return message;
};
```

**2. Atualizar o handler de INSERT no Realtime (linhas 358-364)**

Antes de adicionar a mensagem ao state, resolver o contexto de reply:

```typescript
if (newMessage.thread_id === selectedThreadId) {
  const enriched = await resolveReplyContext(newMessage);
  setMessages((prev) => {
    const filtered = prev.filter(
      (m) => !m.id.startsWith('temp-') && m.id !== enriched.id
    );
    return [...filtered, enriched];
  });
  scrollToBottom();
}
```

**3. Atualizar o handler de UPDATE no Realtime (linhas 378-381)**

Preservar o `reply_to_message` que ja existe no state local ao atualizar:

```typescript
if (updatedMessage.thread_id === selectedThreadId) {
  setMessages((prev) =>
    prev.map((m) => {
      if (m.id === updatedMessage.id) {
        return {
          ...updatedMessage,
          reply_to_message: updatedMessage.reply_to_message || m.reply_to_message,
        };
      }
      return m;
    })
  );
}
```

## Resultado

- Quando o cliente responde a uma mensagem (reply), o atendente vera a mensagem citada com a barra lateral colorida
- Quando o atendente responde a uma mensagem, o quote permanece visivel mesmo apos a mensagem real substituir a temporaria
- Funciona tanto para mensagens ja carregadas (resolucao local instantanea) quanto para mensagens antigas (fallback com query ao banco)

