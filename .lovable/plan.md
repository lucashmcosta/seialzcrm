# Adaptar CompleteTaskDialog para Mobile

## Problema
No mobile (`/tasks`), o modal de "Concluir tarefa" estoura a largura da tela: o botão "Concluir" fica cortado, o footer não se ajusta e o `Dialog` centralizado fica desconfortável em telas pequenas.

## Solução
Renderizar uma versão mobile dedicada do `CompleteTaskDialog` quando `useIsMobile()` for true, mantendo intactos: lógica de submit, estado, props e a versão desktop.

## Mudanças

### `src/components/tasks/CompleteTaskDialog.tsx`
1. Importar `useIsMobile` e os componentes `Sheet`, `SheetContent`, `SheetHeader`, `SheetTitle` de `@/components/ui/sheet`.
2. Extrair o conteúdo (meta, tabs Concluir/Adiar, textarea/input, footer) em variáveis JSX reutilizadas pelos dois branches.
3. Branch mobile (`if (isMobile)`): usar `Sheet` com `SheetContent side="bottom"`, `rounded-t-2xl`, `max-h-[92vh]`, `overflow-y-auto`, padding `p-4`.
   - Header: título da tarefa em `text-lg font-semibold`.
   - Tabs Concluir/Adiar ocupando `w-full` (cada botão `flex-1`).
   - Footer empilhado: linha superior com `Editar` + `Excluir` (ghost), linha inferior com `Cancelar` + `Concluir/Adiar` em `grid grid-cols-2 gap-2` para garantir que o CTA verde não corte.
   - Botão principal `w-full` dentro da sua célula do grid.
4. Branch desktop: manter exatamente o `Dialog` atual.

### Sem mudanças
- `MobileTasksList.tsx`, `TasksList.tsx`, traduções, lógica de Supabase.
- Nenhum novo arquivo necessário; o `AlertDialog` de exclusão continua funcionando dentro do `Sheet`.

## Verificação
- Abrir `/tasks` no viewport 390px, tocar em uma tarefa, conferir que o sheet sobe pela base, todos os botões aparecem inteiros e o textarea recebe foco.
- Confirmar que no desktop o `Dialog` segue idêntico.
