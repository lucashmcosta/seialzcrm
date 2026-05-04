## Atualizar tipos de tarefa

Remover "Geral" e adicionar 4 novos tipos. Manter Ligação, Mensagem, Lembrete e Follow-up.

### Lista final de tipos
1. Criação de pasta (`folder_creation`)
2. Inicial (`initial`)
3. Correção (`correction`)
4. Distribuição (`distribution`)
5. Ligação (`call`)
6. Mensagem (`message`)
7. Lembrete (`reminder`)
8. Follow-up (`follow_up`)

### Mudanças técnicas

**1. `src/lib/taskTypes.ts`**
- Remover `{ id: 'general', ... }`.
- Adicionar 4 novas entradas com ícones Lucide/Phosphor:
  - `folder_creation` → `FolderPlus`
  - `initial` → `Flag`
  - `correction` → `PencilSimple`
  - `distribution` → `Share` (ou `ShareNetwork`)
- Ajustar `getTaskTypeConfig` para usar `'initial'` como fallback (em vez do primeiro item, para manter robusto se a ordem mudar).

**2. `src/lib/i18n.ts`**
- Remover chaves `tasks.typeGeneral` (PT/EN).
- Adicionar:
  - `tasks.typeFolderCreation`: "Criação de pasta" / "Folder creation"
  - `tasks.typeInitial`: "Inicial" / "Initial"
  - `tasks.typeCorrection`: "Correção" / "Correction"
  - `tasks.typeDistribution`: "Distribuição" / "Distribution"

**3. `src/components/tasks/TaskDialog.tsx`**
- Trocar default `task_type: 'general'` → `'initial'` (em ambos os `setFormData` — novo e fallback de edição).

**4. `src/components/contacts/ContactTasks.tsx`**
- Trocar `<SelectItem value="general">` por items dos 4 novos tipos.
- Atualizar default usado ao criar tarefa pra `'initial'`.

**5. Migração SQL (data update)**
```sql
UPDATE tasks SET task_type = 'initial' WHERE task_type IN ('general', 'whatsapp');
```
Inclui também `'whatsapp'` (tipo removido anteriormente que ainda pode ter registros) para limpar de vez. `task_type` é `text` livre — sem enum a alterar.

### Fora de escopo
Outros usos de `'general'` no código (canais de mensagem, categorias, etc.) **não** são alterados — referem-se a contextos diferentes.
