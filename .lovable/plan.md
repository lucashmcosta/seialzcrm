## Mover ações para dentro do card do header

**Arquivos:** `src/pages/opportunities/OpportunityDetail.tsx`, `src/components/signature/SendToSignatureButton.tsx`

### 1. `OpportunityDetail.tsx`
- **Remover** o `DropdownMenu` externo (3 pontinhos no canto superior direito). Manter só o botão "Editar".
- **Dentro do card**, à direita (antes do badge de status e valor), adicionar:
  - `ClickToCallButton` com `variant="ghost"` `size="icon"`, envolto em `Tooltip` "Ligar".
  - `SendToSignatureButton` com `size="icon"`, envolto em `Tooltip` "Enviar para Assinatura".
  - `DropdownMenu` (3 pontinhos, `Button variant="ghost" size="icon"`) contendo apenas:
    - "Marcar como Ganho" (`handleMarkWon`)
    - "Marcar como Perdido" (`handleMarkLost`)
- Tooltips usam `@/components/ui/tooltip` (já no projeto).

### 2. `SendToSignatureButton.tsx`
- Quando `size === 'icon'`: renderizar apenas o ícone `<PenNib />` sem `mr-2` e sem o texto label, para funcionar bem como botão icon-only.