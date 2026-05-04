## Objetivo

Expandir as **funcionalidades** do módulo de Tarefas da Seialz, mantendo o visual atual (design system Seialz: tokens semânticos, Outfit, bordas 6px, sem hardcoded). Duas adições:

1. Mais **categorias** (tipos) de tarefa
2. Nova **visão Kanban** ao lado da Lista atual

Nada de redesign da tela. Os componentes existentes (`Card`, `Button`, `Select`, `Tabs`, `Dialog`) continuam como estão.

---

## 1. Novas categorias de tarefa

Hoje `task_type` aceita: `general`, `call`, `message`. Vamos adicionar **3 novas** opções (string livre na coluna, sem migration):

- `whatsapp` — Whatsapp
- `reminder` — Lembrete
- `follow_up` — Follow-up

Total final no select: **Geral · Ligação · Mensagem · Whatsapp · Lembrete · Follow-up**

Aplicado em:
- `src/components/tasks/TaskDialog.tsx` — adicionar `<SelectItem>` para cada
- `src/components/contacts/ContactTasks.tsx` — mesmo select interno
- `src/lib/i18n.ts` — chaves `tasks.typeWhatsapp`, `tasks.typeReminder`, `tasks.typeFollowUp` (PT/EN)

Cada tipo recebe um ícone (Phosphor) usado em listagens e cards Kanban:
- `general` → `CheckSquare`
- `call` → `Phone`
- `message` → `ChatCircle`
- `whatsapp` → `WhatsappLogo`
- `reminder` → `Bell`
- `follow_up` → `ArrowsClockwise`

Helper único `src/lib/taskTypes.ts` exporta `TASK_TYPES` (id, label key, icon) — usado no dialog e nos cards para evitar duplicação.

## 2. Visão Kanban

Adicionar um toggle Lista / Kanban no header da página `TasksList` (componente `Tabs` ou `ToggleGroup` já existentes do shadcn — mesma estética usada em outras telas). Persistir escolha em `localStorage` (`tasks_view_mode`).

Novo componente `src/components/tasks/TasksKanban.tsx` com **3 colunas fixas** (mesma lógica de status que já existe nos filtros):

- **Atrasadas** — `status='open' AND due_at < now()`
- **Hoje** — `status='open' AND due_at` no dia local
- **Futuras** — `status='open' AND due_at > endOfToday OR due_at IS NULL`

Cada coluna:
- Header com label + contador (mesmo padrão `Badge` da Seialz)
- Cards usando o componente `Card` existente
- Card mostra: ícone do tipo, título, prioridade (cor já existente em `getPriorityIcon`), contato/oportunidade se houver, hora se `due_at` tiver horário
- Click no card abre `TaskDialog` em modo edição (reutilizando o dialog atual)
- Checkbox para concluir inline (reusa `handleCompleteTask`)
- Estado vazio: "Nenhuma tarefa nesta coluna"

Layout responsivo com `grid-cols-1 md:grid-cols-3`, scroll interno por coluna. Tudo em tokens Seialz (`bg-card`, `border-border`, `text-foreground`, `text-muted-foreground`).

No modo Kanban as Tabs de status (Todas/Atrasadas/Hoje/Open/Completed) ficam ocultas — já estão representadas como colunas. Filtros de busca/prioridade/responsável continuam visíveis e aplicam-se às colunas.

Sem drag-and-drop nesta entrega.

---

## Arquivos afetados

- ✏️ `src/components/tasks/TaskDialog.tsx` — adicionar 3 novos `SelectItem` no select de Tipo
- ✏️ `src/components/contacts/ContactTasks.tsx` — mesmos 3 itens no select inline
- 🆕 `src/lib/taskTypes.ts` — config central (ids, labels, ícones)
- 🆕 `src/components/tasks/TasksKanban.tsx` — visão Kanban
- ✏️ `src/pages/tasks/TasksList.tsx` — toggle Lista/Kanban + render condicional
- ✏️ `src/lib/i18n.ts` — 3 novas chaves PT/EN

## Banco

Nenhuma migration. `task_type` é `string` livre na tabela `tasks` — só estamos passando novos valores.

## Fora de escopo

- Drag-and-drop entre colunas
- Visão Calendário
- Categorias customizáveis pelo usuário (admin) — pode vir depois se precisar