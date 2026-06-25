## Problema

Na aba **Mensagens** do contato (`/contacts/:id`), o input de digitação fica no fim da lista de mensagens e rola junto com elas. Em conversas longas, o usuário precisa rolar até o fim para conseguir digitar — comportamento diferente da tela `/messages`, onde o input é fixo.

## Causa

`ContactMessages.tsx` já tem a estrutura correta (`flex flex-col flex-1 min-h-0` + `ScrollArea flex-1` + footer fixo no fim do flex). O problema está no **wrapper pai** em `src/pages/contacts/ContactDetail.tsx` (linha 566):

```tsx
<div className="flex-1 overflow-auto p-6">
  <Tabs ...>
    ...
    <Tabs.Panel id="messages" className="flex-1 min-h-0">
      <ContactMessages ... />
    </Tabs.Panel>
  </Tabs>
</div>
```

O `overflow-auto` faz o container inteiro virar a área rolável, então o `flex-1` interno do `ContactMessages` cresce indefinidamente em vez de respeitar a altura do viewport. Resultado: histórico + input formam uma página rolável única.

## Correção

Tornar o container da aba "Mensagens" não-rolável (delegando o scroll para o `ScrollArea` interno do `ContactMessages`) **apenas quando a aba ativa for `messages`**, preservando o comportamento atual nas demais abas (que dependem do scroll global).

### Mudanças (apenas em `src/pages/contacts/ContactDetail.tsx`)

1. Linha 566: trocar o wrapper estático por classes condicionais:
   ```tsx
   <div
     className={cn(
       "flex-1 p-6",
       selectedTab === 'messages'
         ? "overflow-hidden flex flex-col min-h-0"
         : "overflow-auto"
     )}
   >
   ```

2. Garantir que `<Tabs>` e `<Tabs.Panel id="messages">` propaguem altura quando messages está ativa:
   - Adicionar `className={selectedTab === 'messages' ? 'w-full flex-1 flex flex-col min-h-0' : 'w-full'}` no `<Tabs>`.
   - `Tabs.Panel id="messages"` já tem `flex-1 min-h-0` — manter.

3. Importar `cn` de `@/lib/utils` se ainda não estiver importado.

Nenhuma alteração em `ContactMessages.tsx` — sua estrutura interna já está correta (input fixo via flex). Nenhuma mudança em backend, hooks ou outras abas.

## Resultado esperado

- Aba Mensagens: histórico rola dentro do `ScrollArea`; input de texto + botões de mídia/áudio ficam fixos na parte inferior visível.
- Outras abas (Detalhes, Tarefas, Notas, etc.): comportamento inalterado.
- Mobile: inalterado (renderiza outro layout via `isMobile`).
