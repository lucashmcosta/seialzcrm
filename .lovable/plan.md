

## Abrir chat mesmo sem conversa existente

Quando o usuário clica em "Mensagens" no detalhe do contato e não existe thread, o sistema atual mostra um toast "Sem conversa" e volta para a lista. O correto é criar uma thread nova automaticamente e abrir o chat vazio.

### Mudança

**`src/components/mobile/MobileMessagesList.tsx`** — no `useEffect` que trata o `fromContactId` (linhas ~293-316):

No bloco `else` (quando `match` não é encontrado), ao invés de mostrar toast e limpar o param, criar uma nova thread via insert no `message_threads` (mesmo padrão do `NewConversationDialog.handleSelect`):

```ts
// Onde hoje tem o toast "Sem conversa":
const { data: newThread, error } = await supabase
  .from('message_threads')
  .insert({
    organization_id: organization.id,
    contact_id: fromContactId,
    channel: 'whatsapp',
  })
  .select('id')
  .single();

if (!error && newThread) {
  setSelectedThreadId(newThread.id);
  refetchThreads();
}
```

O `useEffect` precisará ser convertido para chamar uma função async interna. Remover o toast e o `searchParams.delete`.

### Arquivo afetado

| Arquivo | Mudança |
|---------|---------|
| `src/components/mobile/MobileMessagesList.tsx` | Criar thread automaticamente quando contato não tem conversa |

