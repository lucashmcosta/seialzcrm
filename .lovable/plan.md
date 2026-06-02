# Fix: scroll do modal de templates na /inbox

## Problema

Em `src/components/inbox/InboxComposer.tsx`, o `<Dialog>` que abre o `WhatsAppTemplateSelector` está assim:

```tsx
<DialogContent className="max-w-2xl max-h-[80vh] overflow-hidden p-0">
  <div className="p-2">
    <WhatsAppTemplateSelector ... />
  </div>
</DialogContent>
```

O `WhatsAppTemplateSelector` foi feito para ocupar 100% da altura do pai (`flex flex-col h-full min-h-0`) e fazer scroll interno na lista de templates. Mas:

1. O wrapper `<div className="p-2">` não tem `h-full` nem é flex — então o `h-full` do selector não tem altura de referência.
2. O `DialogContent` também não força layout flex em coluna com altura limitada.

Resultado: a lista cresce livremente, ultrapassa o `max-h-[80vh]` (cortado por `overflow-hidden`) e não há contêiner com `overflow-y-auto` ativo — o scroll não funciona.

## Correção

Ajustar apenas o bloco do `<Dialog>` no `InboxComposer.tsx` (tanto na variante `compact` quanto na padrão, se existir — confirmar) para que o `DialogContent` vire um flex column com altura limitada e o filho ocupe a altura toda:

```tsx
<DialogContent className="max-w-2xl h-[80vh] p-0 flex flex-col overflow-hidden">
  <WhatsAppTemplateSelector
    onSelect={handleSendTemplate}
    onCancel={() => setShowTemplates(false)}
  />
</DialogContent>
```

- Remover o wrapper `<div className="p-2">` (o próprio selector já controla seu padding interno via `px-4`).
- Trocar `max-h-[80vh]` por `h-[80vh]` para dar altura concreta, permitindo que `flex-1 min-h-0 overflow-y-auto` da lista interna funcione.
- Manter `flex flex-col` no `DialogContent` para o `h-full` do selector ter referência.

## Escopo

- Arquivo único: `src/components/inbox/InboxComposer.tsx`.
- Sem mudanças em `WhatsAppTemplateSelector`, hooks, backend ou outras telas.
- Mudança puramente de UI/layout.

## Verificação

- Abrir /inbox, selecionar conversa fora da janela 24h (ou clicar no botão de templates), abrir o modal e rolar a lista de templates.
