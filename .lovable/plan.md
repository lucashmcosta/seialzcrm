Plano objetivo:

1. Corrigir `src/components/ui/card.tsx`
   - Fazer o `Card` repassar `...props` também para o `motion.div`.
   - Hoje isso só acontece quando `noAnimation` é true; por isso `onDragEnter`, `onDragOver`, `onDrop` etc. não chegam ao DOM no card normal.

2. Ajustar `src/components/contacts/ContactAttachments.tsx`
   - Manter o drop apenas no card da aba Anexos, sem listener global no `window`.
   - Usar `noAnimation` no card de upload, se necessário, para reduzir risco com eventos de drag em wrapper animado.
   - Garantir que `preventDefault()` rode no `dragOver/drop` do próprio card.

3. Validar comportamento
   - Conferir que arrastar arquivo para o meio do card ativa o estado visual.
   - Conferir que soltar no card chama o mesmo fluxo do botão “Enviar”.
   - Não alterar regras de navegador fora da área de drop.