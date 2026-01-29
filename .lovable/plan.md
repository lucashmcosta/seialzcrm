
# Plano: Corrigir Input Bar e Textarea no ContactMessages

## Problemas Identificados

### Problema 1: Input bar não aparece quando cliente responde

**Causa raiz**: O componente `ContactMessages` só escuta mudanças na tabela `messages`, mas NÃO escuta mudanças na tabela `message_threads`. Quando o cliente responde, o backend atualiza o campo `whatsapp_last_inbound_at` na thread, mas essa atualização não é detectada pelo realtime subscription atual.

**Resultado**: O estado `isIn24hWindow` permanece `false` mesmo após o cliente responder, então a barra de input não aparece - o usuário precisa sair e voltar à tela para recarregar.

### Problema 2: Textarea não faz auto-resize

**Causa raiz**: O textarea atual usa `rows={2}` fixo e `resize-none`. Não tem a lógica de auto-resize que existe no `MessagesList.tsx`.

**Comportamento esperado** (igual ao MessagesList):
- Começa com 1 linha
- Expande conforme o usuário digita até 6 linhas (~150px)
- Após 6 linhas, permite scroll interno SEM mostrar scrollbar visível

---

## Solução

### 1. Adicionar Subscription para message_threads

Adicionar um segundo canal realtime que escuta atualizações na tabela `message_threads` para a thread atual. Quando detectar atualização, verificar se `whatsapp_last_inbound_at` mudou e atualizar o estado `isIn24hWindow`.

```typescript
// Novo useEffect para escutar mudanças na thread
useEffect(() => {
  if (!threadId) return;

  const channel = supabase
    .channel(`contact-thread-updates-${threadId}`)
    .on('postgres_changes', {
      event: 'UPDATE',
      schema: 'public',
      table: 'message_threads',
      filter: `id=eq.${threadId}`,
    }, (payload) => {
      const updated = payload.new as { whatsapp_last_inbound_at: string | null };
      if (updated.whatsapp_last_inbound_at) {
        const lastInbound = new Date(updated.whatsapp_last_inbound_at);
        const now = new Date();
        const hoursDiff = (now.getTime() - lastInbound.getTime()) / (1000 * 60 * 60);
        setIsIn24hWindow(hoursDiff < 24);
      }
    })
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}, [threadId]);
```

### 2. Implementar Textarea Auto-Resize

Copiar a mesma lógica do `MessagesList.tsx`:

**Adicionar estado e ref:**
```typescript
const [textareaOverflow, setTextareaOverflow] = useState(false);
```

**Função de auto-resize:**
```typescript
const adjustTextareaHeight = () => {
  const textarea = textareaRef.current;
  if (textarea) {
    textarea.style.height = 'auto';
    const scrollHeight = textarea.scrollHeight;
    const maxHeight = 150; // ~6 linhas
    
    setTextareaOverflow(scrollHeight > maxHeight);
    textarea.style.height = `${Math.min(scrollHeight, maxHeight)}px`;
  }
};
```

**Atualizar Textarea:**
```tsx
<Textarea
  ref={textareaRef}
  value={messageText}
  onChange={(e) => {
    setMessageText(e.target.value);
    adjustTextareaHeight();
  }}
  onKeyDown={(e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
      // Reset altura após enviar
      if (textareaRef.current) {
        textareaRef.current.style.height = 'auto';
      }
      setTextareaOverflow(false);
    }
  }}
  rows={1}
  className={`flex-1 resize-none min-h-[40px] max-h-[150px] ${
    textareaOverflow ? 'overflow-y-auto' : 'overflow-hidden'
  }`}
  disabled={submitting || aiImproving}
/>
```

---

## Arquivos a Modificar

| Arquivo | Mudança |
|---------|---------|
| `src/components/contacts/ContactMessages.tsx` | Adicionar subscription para threads + auto-resize textarea |

---

## Mudanças Detalhadas

### ContactMessages.tsx

**1. Adicionar estado para overflow (linha ~72):**
```typescript
const [textareaOverflow, setTextareaOverflow] = useState(false);
```

**2. Adicionar nova subscription para message_threads (após linha 136):**
```typescript
// Real-time subscription for thread updates (24h window)
useEffect(() => {
  if (!threadId) return;

  const channel = supabase
    .channel(`contact-thread-updates-${threadId}`)
    .on('postgres_changes', {
      event: 'UPDATE',
      schema: 'public',
      table: 'message_threads',
      filter: `id=eq.${threadId}`,
    }, (payload) => {
      const updated = payload.new as { whatsapp_last_inbound_at: string | null };
      if (updated.whatsapp_last_inbound_at) {
        const lastInbound = new Date(updated.whatsapp_last_inbound_at);
        const now = new Date();
        const hoursDiff = (now.getTime() - lastInbound.getTime()) / (1000 * 60 * 60);
        setIsIn24hWindow(hoursDiff < 24);
      }
    })
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}, [threadId]);
```

**3. Adicionar função adjustTextareaHeight (após scrollToBottom):**
```typescript
const adjustTextareaHeight = () => {
  const textarea = textareaRef.current;
  if (textarea) {
    textarea.style.height = 'auto';
    const scrollHeight = textarea.scrollHeight;
    const maxHeight = 150;
    
    setTextareaOverflow(scrollHeight > maxHeight);
    textarea.style.height = `${Math.min(scrollHeight, maxHeight)}px`;
  }
};
```

**4. Atualizar Textarea (linha ~582-596):**
- Mudar `rows={2}` para `rows={1}`
- Adicionar `adjustTextareaHeight()` no onChange
- Reset altura no onKeyDown ao enviar
- Adicionar classe dinâmica para overflow

---

## Comportamento Final

### Após cliente responder:
1. Backend atualiza `whatsapp_last_inbound_at` na thread
2. Realtime subscription detecta UPDATE na `message_threads`
3. Componente recalcula `isIn24hWindow` = `true`
4. Input bar completa aparece automaticamente (sem recarregar página)

### Textarea:
1. Começa com 1 linha de altura
2. Expande conforme usuário digita (até 6 linhas)
3. Após 6 linhas, mostra scroll interno SEM scrollbar visível
4. Ao enviar, volta para 1 linha

---

## Checklist de Validação

- [ ] Input bar aparece automaticamente quando cliente responde
- [ ] Não precisa sair e voltar na tela
- [ ] Textarea começa com 1 linha
- [ ] Textarea expande até 6 linhas
- [ ] Após 6 linhas, scroll interno funciona
- [ ] Scrollbar não aparece (fica oculta)
- [ ] Ao enviar, textarea volta para 1 linha
- [ ] Todas as funções (upload, audio, emoji, IA) permanecem funcionando
