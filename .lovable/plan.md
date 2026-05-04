## Mudanças no módulo de Tarefas

### 1. Kanban — coluna "Concluídas" opcional (Imagem 1)
**Arquivo:** `src/pages/tasks/TasksList.tsx` + `src/components/tasks/TasksKanban.tsx`

- Adicionar toggle (checkbox/switch) ao lado do seletor de view: "Mostrar concluídas" (off por padrão).
- Persistir preferência em `localStorage` (`tasks_kanban_show_completed`).
- Quando ligado:
  - `fetchTasks` no modo kanban deixa de filtrar `status='open'` e passa a incluir `completed` também (limitando às últimas N concluídas, ex: 50, ordenadas por `completed_at desc`, para evitar peso).
  - `TasksKanban` ganha 4ª coluna "Concluídas" (visual diferenciado — texto muted, ícone CheckCircle verde).
- Cards de tarefas concluídas no Kanban: sem botão de "completar"; clique abre o dialog em modo de visualização (ver item 3).

### 2. Lista — Tarefas concluídas: somente visualização (Imagem 2)
**Arquivo:** `src/pages/tasks/TasksList.tsx`

- Para tarefas com `status === 'completed'` ou `'canceled'`:
  - Esconder botões "Editar" e "Excluir".
  - Manter apenas botão "Ver detalhes" que abre o `TaskDialog` em modo somente-leitura.
- Mesma regra aplicada no Kanban (coluna Concluídas).

### 3. Dialog de "Concluir tarefa" (Imagem 3)
**Novo arquivo:** `src/components/tasks/CompleteTaskDialog.tsx`
**Edição:** `src/components/tasks/TaskDialog.tsx` + `TasksList.tsx` + `TasksKanban.tsx`

Comportamento ao **clicar numa tarefa aberta (`status='open'`)**:
- Abrir o novo `CompleteTaskDialog` (não o de edição).
- Conteúdo do dialog:
  - Cabeçalho: título da tarefa + meta (contato, oportunidade, vencimento atual).
  - Descrição original (read-only).
  - 3 ações em abas/botões:
    1. **Concluir** — campo obrigatório `completion_notes` (Textarea "Descrição da conclusão"). Salva `status='completed'`, `completed_at=now()`, `completion_notes`.
    2. **Adiar** — campo `due_at` (date+time picker) novo + opcional `postpone_reason`. Atualiza apenas `due_at`.
    3. **Editar** — botão secundário que fecha este dialog e abre o `TaskDialog` antigo (edição completa).
  - Botão **Excluir** discreto no rodapé (com confirmação).

**Migration nova** (campo extra na tabela `tasks`):
```sql
ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS completion_notes TEXT,
  ADD COLUMN IF NOT EXISTS postpone_reason TEXT;
```

Tarefas concluídas (clicadas a partir da coluna/lista de concluídas): abre `TaskDialog` em modo `readOnly={true}` (todos campos disabled, só botão Fechar).

### 4. Comboboxes pesquisáveis no TaskDialog (Imagem 4 — parte 1)
**Arquivo:** `src/components/tasks/TaskDialog.tsx`

- Substituir os 4 `<Select>` (Atribuída a, Contato, Oportunidade, e opcionalmente Tipo/Prioridade) por **Combobox com busca** usando `Command` + `Popover` (já existem em `src/components/ui/`).
- Padrão: trigger em formato de input com chevron; popover abre com `<CommandInput placeholder="Buscar..." />` e lista filtrada.
- Aplicar prioridade: **Contato**, **Oportunidade**, **Atribuída a** (são os mais longos). Tipo/Prioridade podem ficar como Select simples.

### 5. Relação Contato ↔ Oportunidade (Imagem 4 — parte 2)
**Arquivo:** `src/components/tasks/TaskDialog.tsx`

- Alterar `fetchData` para também buscar `contact_id` em `opportunities`:
  ```ts
  supabase.from('opportunities').select('id, title, contact_id')
  ```
- Filtragem cruzada na renderização dos comboboxes:
  - Se `formData.contact_id` setado → lista de oportunidades filtra `opp.contact_id === formData.contact_id`.
  - Se `formData.opportunity_id` setado → lista de contatos filtra para o contato dono daquela oportunidade (e auto-preenche `contact_id` se vazio).
  - Quando o usuário troca o contato, se a oportunidade atual não pertence a ele, limpa `opportunity_id`.
- Mostrar texto auxiliar quando há filtro ativo: "Mostrando oportunidades de [Nome do contato] · Limpar filtro".

### 6. i18n
**Arquivo:** `src/lib/i18n.ts`

Adicionar chaves PT/EN:
- `tasks.showCompleted` — "Mostrar concluídas" / "Show completed"
- `tasks.columnCompleted` — "Concluídas" / "Completed"
- `tasks.completeTask` — "Concluir tarefa" / "Complete task"
- `tasks.completionNotes` — "Descrição da conclusão" / "Completion notes"
- `tasks.completionNotesRequired` — "Descreva como a tarefa foi concluída" / "Describe how the task was completed"
- `tasks.postpone` — "Adiar" / "Postpone"
- `tasks.postponeReason` — "Motivo do adiamento (opcional)" / "Postpone reason (optional)"
- `tasks.newDueDate` — "Nova data de vencimento" / "New due date"
- `tasks.viewDetails` — "Ver detalhes" / "View details"
- `tasks.searchPlaceholderGeneric` — "Buscar..." / "Search..."

### Arquivos afetados (resumo)
- `src/pages/tasks/TasksList.tsx` — toggle, lógica de fetch, abertura de dialog correta
- `src/components/tasks/TasksKanban.tsx` — 4ª coluna opcional, sem botão completar em concluídas
- `src/components/tasks/TaskDialog.tsx` — comboboxes com busca, relação contato↔oportunidade, modo readOnly
- `src/components/tasks/CompleteTaskDialog.tsx` — **novo**, fluxo Concluir/Adiar/Editar
- `src/lib/i18n.ts` — novas chaves
- Migration nova — `completion_notes`, `postpone_reason` em `tasks`
