## Ajuste: sobreposição do botão Baixar com o X de fechar

**Problema:** No `DialogContent` o botão "X" de fechar é absoluto no canto superior direito (`right-4 top-4`). Os botões "Abrir em nova aba" e "Baixar" do header do preview ficam no mesmo lugar e o X cai em cima do ícone de download.

**Arquivo:** `src/components/contacts/ContactAttachments.tsx`

**Mudança (apenas CSS, sem mexer em lógica):**
- Adicionar `pr-10` (ou `pr-12`) ao container do `DialogHeader` / linha de ações para reservar espaço para o X nativo do Dialog.
- Garantir que os botões "Abrir em nova aba" e "Baixar" fiquem à esquerda do X, com `gap-2` entre eles.

Sem alterações em outros componentes, hooks, storage ou políticas.