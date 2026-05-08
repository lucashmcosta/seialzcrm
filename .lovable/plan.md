## Objetivo

Exibir o nome do criador da tarefa nos pontos onde hoje só aparece o atribuído. O dado já existe no banco (`tasks.created_by_user_id`) — falta apenas trazê-lo na query e renderizar.

## Mudanças

**1. Query (`src/pages/tasks/TasksList.tsx`)**
Adicionar join do criador junto com o atribuído:
```
created_by_user:users!tasks_created_by_user_id_fkey(full_name)
```
e estender a interface `Task` com `created_by_user?: { full_name: string } | null`.

**2. Card do Kanban (`src/components/tasks/TasksKanban.tsx`)**
Adicionar `created_by_user` ao tipo `Task` e renderizar uma linha discreta no rodapé do card:
- "Criada por: {nome}" — mesmo estilo `text-[11px] text-muted-foreground`, abaixo da data.
- Só renderiza se `created_by_user.full_name` existir e for diferente do `assigned_user` (evita ruído quando a pessoa cria pra si mesma).

**3. Card da Lista (linha 358)**
Acrescentar ao mesmo bloco de metadata:
```
{task.created_by_user && <span>Criada por: {task.created_by_user.full_name}</span>}
```

**4. Diálogo "Concluir tarefa" (`src/components/tasks/CompleteTaskDialog.tsx`, linha 142)**
Adicionar ao header (ao lado de "Atribuída a"): `Criada por: {nome}`.

**5. i18n (`src/lib/i18n.ts`)**
Adicionar chave `tasks.createdBy`:
- pt-BR: `'Criada por'`
- en-US: `'Created by'`

## O que NÃO muda

- Schema do banco (campo já existe e está populado pelo `TaskDialog`).
- Lógica de criação/edição.
- Permissões.

## Pontos a confirmar

- Mostrar criador **sempre**, ou **só quando for diferente do atribuído**? Recomendo "só quando diferente" pra reduzir poluição visual — confirma se prefere assim.
