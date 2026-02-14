

# Corrigir Scroll, Janela de 24h e Backfill

## Bug 1: SQL Migration -- Backfill `last_inbound_at`

Criar migration para preencher `last_inbound_at` em threads onde o campo esta null mas existem mensagens inbound:

```sql
UPDATE message_threads t
SET last_inbound_at = (
  SELECT MAX(m.created_at) 
  FROM messages m 
  WHERE m.thread_id = t.id 
  AND m.direction = 'inbound'
)
WHERE t.last_inbound_at IS NULL
AND EXISTS (
  SELECT 1 FROM messages m 
  WHERE m.thread_id = t.id 
  AND m.direction = 'inbound'
);
```

## Bug 2: Logica da janela de 24h com 3 niveis de fallback

### Arquivos afetados

| Arquivo | Mudanca |
|---------|---------|
| `src/pages/messages/MessagesList.tsx` | Adicionar fallback para mensagens inbound no calculo da janela |
| `src/components/contacts/ContactMessages.tsx` | Mesma logica de fallback |

### Mudanca

Criar funcao helper `getLastInboundTime` que verifica 3 fontes nesta ordem:

1. `thread.last_inbound_at` (campo dedicado)
2. `thread.whatsapp_last_inbound_at` (campo legado)
3. Ultima mensagem inbound do array de `messages` (fallback final)

Recalcular a janela tanto quando a thread muda quanto quando as mensagens sao carregadas (apos `setMessages`).

### MessagesList.tsx

**Linhas 511-521** (dentro de `fetchMessages`): Trocar logica atual por:

```typescript
const lastInboundTime = getLastInboundTime(thread, data as Message[]);
if (lastInboundTime) {
  const hoursDiff = (Date.now() - lastInboundTime.getTime()) / (1000 * 60 * 60);
  setIsIn24hWindow(hoursDiff < 24);
} else {
  setIsIn24hWindow(false);
}
```

**Linhas 471-485** (timer de 60s): Incluir fallback de mensagens no timer tambem.

### ContactMessages.tsx

**Linhas 257-267** (dentro de `fetchThread`): Mesma logica com fallback.

**Linhas 167-189** (timer de 60s): Incluir fallback de mensagens.

## Bug 3: Layout fixo e scroll

### Problema atual

O `Layout` usa `min-h-screen` no `<main>`, permitindo que a pagina inteira role. O `MessagesList` usa `h-[calc(100vh-2rem)]` no `ResizablePanelGroup` que nao esta correto -- o sidebar do Layout tem padding e o calculo nao considera isso.

### Correcoes no MessagesList.tsx

**Container principal (linha 831)**:
- Mudar `h-[calc(100vh-2rem)]` para `h-screen` no ResizablePanelGroup (o Layout ja gerencia o padding lateral com `pl-64`)

**Painel esquerdo (linhas 833-921)**:
- Header (titulo + busca + filtros): ja tem `flex-shrink-0` implicito por estar fora do ScrollArea -- OK
- ScrollArea da lista: ja tem `flex-1` -- OK
- Estrutura esta correta

**Painel direito (linhas 926-1278)**:
- Container: ja tem `flex flex-col h-full` -- OK
- Header: `h-16 flex-shrink-0` -- OK
- ScrollArea de mensagens (linha 972): ja tem `flex-1` -- OK
- Input area (linha 1124): `flex-shrink-0` implicito -- OK

**scrollToBottom (linha 487-491)**: Atualmente usa `scrollRef.current?.scrollIntoView()` que funciona com a div sentinela no final da lista. Isso esta correto.

**Problema real**: O `<main>` no Layout tem `min-h-screen` que permite overflow. Precisamos que o conteudo de mensagens caiba exatamente na viewport. Mudar o ResizablePanelGroup para `h-[calc(100vh)]` sem padding, ja que o Layout nao adiciona padding vertical.

### Correcoes no ContactMessages.tsx

**Container (linha 540)**: `h-[calc(100vh-320px)]` esta hardcoded. Usar `flex-1 min-h-0` para ocupar o espaco disponivel do pai (que e a tab do contato), permitindo que o scroll interno funcione corretamente.

## Detalhes tecnicos

### Funcao helper (adicionar nos 2 arquivos)

```typescript
const getLastInboundTime = (
  thread: { last_inbound_at?: string | null; whatsapp_last_inbound_at?: string | null } | null | undefined,
  msgs: Message[]
): Date | null => {
  if (thread?.last_inbound_at) return new Date(thread.last_inbound_at);
  if (thread?.whatsapp_last_inbound_at) return new Date(thread.whatsapp_last_inbound_at);
  const lastInbound = msgs
    ?.filter(m => m.direction === 'inbound')
    ?.sort((a, b) => new Date(b.sent_at).getTime() - new Date(a.sent_at).getTime())?.[0];
  if (lastInbound) return new Date(lastInbound.sent_at);
  return null;
};
```

### Ordem de implementacao

1. Migration SQL para backfill `last_inbound_at`
2. Adicionar `getLastInboundTime` nos 2 componentes e atualizar calculo da janela
3. Corrigir alturas dos containers para scroll fixo

