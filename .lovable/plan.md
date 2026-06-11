## Objetivo
Adicionar **modo de seleção múltipla** ao Kanban de Oportunidades, permitindo selecionar vários cards (em qualquer coluna) e executar em massa:
- **Mover para outra etapa** (pipeline_stage)
- **Trocar responsável** (owner_user_id)
- **Excluir** (soft-delete, já suportado pelo BulkActionsBar)

## UX

1. **Botão "Selecionar"** no topo do Kanban (ao lado de Filtros / ViewSwitcher).
2. Ao ativar:
   - Cada card mostra um **checkbox** no canto superior esquerdo (some no modo normal).
   - O **drag-and-drop é desabilitado** enquanto o modo seleção está ativo (evita conflito).
   - Clicar no card **alterna a seleção** em vez de abrir o detalhe.
   - Cada header de coluna ganha um link "Selecionar todos" / "Limpar" para os cards carregados daquela coluna.
3. Aparece a `BulkActionsBar` flutuante (já existe) com ações:
   - **Mover para etapa** (novo Select com as `stages` open/won/lost)
   - **Trocar responsável** (já existe)
   - **Excluir** (já existe)
   - Contador e botão "X" para sair do modo
4. Após sucesso: refetch (`fetchData`) e sair do modo seleção.

## Mudanças

### `src/components/BulkActionsBar.tsx`
- Adicionar props opcionais: `stages?: {id,name}[]` e `onStageChange?` para módulo `opportunities`.
- Novo handler `handleChangeStage(stageId)` que faz `update({ pipeline_stage_id })` em `opportunities` para os ids selecionados. Mantém `status` consistente quando a stage destino for won/lost (mapeando por `stage.type`).
- Renderizar o Select de etapa apenas quando `module === 'opportunities'` e `stages` foi passado.

### `src/components/opportunities/OpportunityCard.tsx` e `SeialzOpportunityCard.tsx`
- Adicionar props `selectionMode?: boolean`, `selected?: boolean`, `onToggleSelect?: () => void`.
- Quando `selectionMode`: renderizar `<Checkbox>` no topo do card; o `onClick` do card passa a chamar `onToggleSelect` em vez de `onClick` original; aplicar `ring-2 ring-primary` quando selecionado.

### `src/pages/opportunities/OpportunitiesKanban.tsx`
- Novo estado: `kanbanSelectionMode: boolean` + reuso de `selectedIds`.
- Botão "Selecionar" no header (visível apenas no `viewMode === 'kanban'`).
- Quando `kanbanSelectionMode`:
  - `<DragDropContext>` recebe `isDropDisabled`/condicional (ou envolve só quando não está em seleção) — simplesmente não permitir início do drag via prop `isDragDisabled` no Draggable.
  - Passar `selectionMode`, `selected`, `onToggleSelect` aos cards.
- Renderizar `<BulkActionsBar module="opportunities" stages={openOrAllStages} users={users} ... />` quando há ids selecionados.
- Helper "Selecionar todos da coluna X" no header da coluna (apenas no modo).

## Regras de negócio (move de etapa)
- Stage destino `open` → `status='open'`, `close_date` preserva.
- Stage destino `won` → `status='won'`. Se algum card não tiver `close_date`, ainda assim atualizar (sem prompt — bulk não usa `CloseDatePromptDialog` para não interromper).
- Stage destino `lost` → `status='lost'`.
- O backfill de `pipeline_stage_id` e `status` é feito em uma única chamada `update().in('id', selectedIds)`.

## Fora de escopo
- Mobile (manter kanban mobile como está; pode ser fase 2)
- Mudanças no view de lista (já tem seleção + BulkActionsBar funcionando)
- Confirmação especial para won/lost em massa (usuário escolhe consciente)

## Memória
Também salvo memória de projeto registrando o estado atual do **Inbox v2** (shadow 150/150 match, flag off, pendências: backfill 26k NULL, validação volume maior, critério de cutover, Meta Cloud API) para retomar a próxima sessão.
