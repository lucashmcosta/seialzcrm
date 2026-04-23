

## Adicionar scroll no `EditUserDialog`

### Problema
O modal de edição de usuário ultrapassa a altura da viewport (1060×808 atual) e o botão "Salvar" fica cortado na parte de baixo. O `DialogContent` não tem limite de altura nem scroll interno.

### Solução
Mudança mínima em **`src/components/settings/EditUserDialog.tsx`**, no `<DialogContent>`:

1. Limitar altura: `max-h-[90vh]`
2. Tornar o container flex coluna: `flex flex-col`
3. Envolver o bloco do meio (entre `DialogHeader` e `DialogFooter`) com `overflow-y-auto` + `flex-1` + um pouco de padding lateral pra não colar a scrollbar nos campos

Resultado: header e footer (com Cancelar/Salvar) ficam fixos; só o miolo do formulário rola. Funciona em qualquer altura de tela, inclusive mobile.

### Fora do escopo
Nenhum ajuste de design system, cores ou layout — apenas comportamento de overflow do modal.

