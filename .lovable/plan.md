## Tornar "Data de Fechamento" obrigatória ao Ganhar/Perder

Hoje a data de fechamento (`close_date`) é opcional em qualquer situação. Vamos exigi-la sempre que a oportunidade for marcada como **Ganho** ou **Perdido**, em todos os caminhos do app.

### Pontos de entrada cobertos

1. **Detalhe da oportunidade** (`src/pages/opportunities/OpportunityDetail.tsx`)
   - Botões "Marcar como Ganho" e "Marcar como Perdido".
2. **Kanban de oportunidades** (`src/pages/opportunities/OpportunitiesKanban.tsx`)
   - Drag-and-drop de um card para uma coluna do tipo `won` ou `lost`.
3. **Kanban mobile** (`src/components/mobile/MobileOpportunitiesKanban.tsx`)
   - Mesmo fluxo de mudança de estágio para won/lost.
4. **Dialog de edição/criação** (`src/components/opportunities/OpportunityDialog.tsx`)
   - Quando o usuário escolhe um estágio do tipo won/lost no formulário, `close_date` passa a ser obrigatório no submit.

### UX proposta

- **Em todos os 4 fluxos**, se a oportunidade ainda não tiver `close_date`, abrir um dialog leve "Informe a data de fechamento" com um único campo `<input type="date">` (default = hoje), botões Cancelar / Confirmar.
- Só após confirmar a data é que a transição para `won`/`lost` é persistida (status + stage + close_date no mesmo update).
- Se já existir `close_date`, segue direto sem perguntar (mantém comportamento atual).
- No `OpportunityDialog`, se estágio for won/lost e `close_date` estiver vazio: bloquear submit com toast "Informe a data de fechamento" e destacar o campo.

### Implementação

- Criar componente reutilizável `src/components/opportunities/CloseDatePromptDialog.tsx`:
  - Props: `open`, `onOpenChange`, `title`, `onConfirm(date: string)`, `loading`.
  - Usa `Dialog` do shadcn, `Label` + `Input type="date"` (default = hoje em `YYYY-MM-DD`), botão Confirmar desabilitado quando vazio.
- `OpportunityDetail.tsx`:
  - Substituir `handleMarkWon`/`handleMarkLost` para abrir o dialog (estado `pendingStatus: 'won'|'lost'|null`) quando `opportunity.close_date` for nulo; no `onConfirm`, fazer o update com `{ status, pipeline_stage_id, close_date }`.
- `OpportunitiesKanban.tsx`:
  - No `handleDragEnd`, antes do update, identificar `destStage.type`. Se for `won`/`lost` e `movedOpp.close_date` for nulo, abrir o dialog (guardar `pendingMove`), reverter UI até confirmação, e no confirm enviar update com `close_date` (e também `status` para manter consistência com o detalhe).
- `MobileOpportunitiesKanban.tsx`: mesma lógica do Kanban desktop.
- `OpportunityDialog.tsx`:
  - No `handleSubmit`, se a stage selecionada tiver `type === 'won' || 'lost'` e `formData.close_date` vazio → toast de erro e `return`.
  - Adicionar asterisco visual no `<Label>` quando o estágio selecionado for won/lost.

### Não muda

- Comportamento para estágios `open` continua igual (close_date opcional).
- Schema do banco, RLS e relatórios não são alterados.
- Oportunidades já `won`/`lost` sem data permanecem como estão (não há backfill).

### Performance

Apenas 1 dialog leve adicional + 1 estado por tela. Sem novas queries.