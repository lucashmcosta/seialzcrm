
# Corrigir Layout de Mensagens e Logica da Janela de 24h

## Problema 1: Layout das bolhas de mensagem

Atualmente, as bolhas de mensagem nos 3 componentes de chat estao com layout inconsistente. As correcoes serao aplicadas em:

### Arquivos afetados

| Arquivo | Componente | Uso |
|---------|-----------|-----|
| `src/pages/messages/MessagesList.tsx` | Chat principal (inbox) | Modulo de mensagens |
| `src/components/contacts/ContactMessages.tsx` | Chat na ficha do contato/oportunidade | Detalhe do contato |
| `src/components/whatsapp/WhatsAppChat.tsx` | Chat legado | Uso secundario |

### Correcoes de layout

- **Alinhamento**: Outbound (direita) com fundo verde, Inbound (esquerda) com fundo `bg-muted` -- ja esta correto no codigo, mas sera revisado o espaçamento
- **max-width**: Garantir `max-w-[70%]` em todas as bolhas (MessagesList ja tem 70%, ContactMessages e WhatsAppChat tem 75% -- padronizar para 70%)
- **Padding/border-radius**: Manter `p-3 rounded-lg` consistente
- **Espacamento**: `space-y-3` entre mensagens (ja esta nos 3 componentes)
- **Quebra de linha**: Garantir `whitespace-pre-wrap break-words` no texto das mensagens. No MessagesList (linha 1057) ja tem, mas ContactMessages usa `WhatsAppFormattedText` que ja faz isso internamente
- **Nome do remetente**: No MessagesList o nome aparece no footer. Padronizar nos outros componentes tambem

### Detalhes tecnicos

**MessagesList.tsx** (linhas 982-1084):
- Mudar `max-w-[70%]` -- ja esta correto
- Layout da bolha esta OK, apenas garantir consistencia

**ContactMessages.tsx** (linhas 548-553):
- Mudar `max-w-[75%]` para `max-w-[70%]`
- Adicionar nome do remetente no footer (contato para inbound, usuario/agente para outbound)

**WhatsAppChat.tsx** (linhas 434-438):
- Mudar `max-w-[75%]` para `max-w-[70%]`
- Adicionar nome do remetente no footer

---

## Problema 2: Logica da janela de 24h

### Problemas atuais

1. **MessagesList.tsx** (linha 497-504): Usa `whatsapp_last_inbound_at` para calcular janela -- precisa usar `last_inbound_at` como fallback
2. **ContactMessages.tsx** (linha 236-241): Mesma coisa, usa apenas `whatsapp_last_inbound_at`
3. **WhatsAppChat.tsx** (linha 114-119): Mesma coisa
4. **ContactMessages.tsx** (linha 152): Realtime subscription tambem so monitora `whatsapp_last_inbound_at`
5. **Aviso de template**: No MessagesList aparece como banner + textarea desabilitada. Deve substituir o campo de digitacao inteiro pelo aviso com botao de template, nao mostrar ambos
6. **Timer/recalculo**: Nao ha recalculo periodico -- se a janela expira enquanto o usuario esta na tela, o estado nao muda

### Correcoes

**Logica de calculo da janela (todos os 3 componentes):**

```typescript
// Usar last_inbound_at com fallback para whatsapp_last_inbound_at
const lastInboundAt = thread.last_inbound_at || thread.whatsapp_last_inbound_at;
if (lastInboundAt) {
  const lastInbound = new Date(lastInboundAt);
  const now = new Date();
  const hoursDiff = (now.getTime() - lastInbound.getTime()) / (1000 * 60 * 60);
  setIsIn24hWindow(hoursDiff < 24);
} else {
  setIsIn24hWindow(false);
}
```

**Timer de recalculo (setInterval a cada 60s) -- adicionar nos 3 componentes:**

```typescript
useEffect(() => {
  if (!selectedThread?.last_inbound_at && !selectedThread?.whatsapp_last_inbound_at) return;
  
  const checkWindow = () => {
    const lastInboundAt = selectedThread.last_inbound_at || selectedThread.whatsapp_last_inbound_at;
    if (lastInboundAt) {
      const hoursDiff = (Date.now() - new Date(lastInboundAt).getTime()) / (1000 * 60 * 60);
      setIsIn24hWindow(hoursDiff < 24);
    }
  };
  
  const interval = setInterval(checkWindow, 60000);
  return () => clearInterval(interval);
}, [selectedThread?.last_inbound_at, selectedThread?.whatsapp_last_inbound_at]);
```

**Realtime subscription (ContactMessages.tsx, linha 151-153):**
- Monitorar tambem `last_inbound_at` no payload do UPDATE

**Area de input quando janela fechada (MessagesList.tsx, linhas 1107-1124):**

Substituir o layout atual (banner de aviso + textarea desabilitada) por um bloco unico que substitui toda a area de input:

```tsx
{/* Input Area */}
<div className="border-t border-border p-4 bg-card">
  {!isIn24hWindow && messages.length > 0 ? (
    // Janela fechada: aviso + botao template no lugar do input
    <div className="flex flex-col items-center gap-3 py-4 text-center">
      <div className="flex items-center gap-2 text-amber-600 dark:text-amber-400">
        <Clock className="h-5 w-5" />
        <p className="text-sm font-medium">
          Fora da janela de 24h
        </p>
      </div>
      <p className="text-xs text-muted-foreground">
        Use um template aprovado para reabrir a conversa
      </p>
      <Button onClick={() => setShowTemplates(true)} size="sm">
        <FileText className="w-4 h-4 mr-2" />
        Selecionar template
      </Button>
    </div>
  ) : (
    // Janela aberta: input normal
    <>
      {replyingTo && <ReplyPreview ... />}
      <div className="flex gap-2">
        {/* botoes + textarea + send */}
      </div>
    </>
  )}
</div>
```

**Mesma logica para ContactMessages.tsx (linhas 597-693):**

Substituir o bloco atual que mostra botao "Enviar Template" quando janela fechada por um aviso mais claro no lugar do input.

**WhatsAppChat.tsx (linhas 473-526):**

Mesmo padrao -- substituir input por aviso quando janela fechada.

**Busca do campo `last_inbound_at` nas queries:**

- **ContactMessages.tsx** (linha 227): Adicionar `last_inbound_at` no select da query de thread
- **WhatsAppChat.tsx** (linha 103): Adicionar `last_inbound_at` no select da query de thread

---

## Resumo de mudancas

| Arquivo | Mudanca |
|---------|---------|
| `src/pages/messages/MessagesList.tsx` | Corrigir area de input (janela fechada substitui input inteiro); adicionar timer de recalculo; usar `last_inbound_at` como campo primario |
| `src/components/contacts/ContactMessages.tsx` | max-width 70%; buscar `last_inbound_at` na query; timer de recalculo; substituir input quando janela fechada; nome do remetente no footer |
| `src/components/whatsapp/WhatsAppChat.tsx` | max-width 70%; buscar `last_inbound_at` na query; timer de recalculo; substituir input quando janela fechada |

## Ordem de implementacao

1. Corrigir layout das bolhas nos 3 componentes
2. Corrigir logica da janela de 24h nos 3 componentes
3. Adicionar timer de recalculo
4. Substituir area de input quando janela fechada
