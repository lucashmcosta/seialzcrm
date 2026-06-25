## Problema

Após fixar o input, o histórico de mensagens parou de rolar dentro da aba — a tela mostra o final da conversa mas não dá scroll para ver mensagens mais antigas.

## Causa

`ContactMessages.tsx` envolve as mensagens em `<ScrollArea>` (Radix). O viewport interno do Radix usa `display: table`, que não respeita bem `flex-1 min-h-0` em alguns contextos: o conteúdo cresce além do contêiner mas o wheel/touch scroll não é interceptado de forma confiável quando a altura é definida via flex. Em `WhatsAppChat.tsx`, o mesmo `ScrollArea` funciona porque tem `max-h-[400px]` explícito; aqui não há altura fixa.

## Correção

Trocar o `<ScrollArea>` por um `<div>` nativo com `overflow-y-auto` no `ContactMessages.tsx`. É a mesma abordagem usada na timeline do Inbox, e garante scroll por wheel/touch sem depender da implementação interna do Radix.

### Mudanças (apenas `src/components/contacts/ContactMessages.tsx`)

1. Remover `import { ScrollArea } from '@/components/ui/scroll-area'` se não for usado em outro lugar do arquivo.
2. Substituir:
   ```tsx
   <ScrollArea className="flex-1 min-h-0">
     <div className="space-y-3 p-1">...</div>
   </ScrollArea>
   ```
   por:
   ```tsx
   <div className="flex-1 min-h-0 overflow-y-auto">
     <div className="space-y-3 p-1">...</div>
   </div>
   ```

Nenhuma outra alteração — input continua fixo, `scrollRef.scrollIntoView` continua funcionando, e o usuário pode rolar livremente para ver o histórico.
