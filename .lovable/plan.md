## Remover tipo "Whatsapp" das tarefas

O tipo "Whatsapp" é redundante com "Mensagem". Vou removê-lo de todas as referências.

### Mudanças

1. **`src/lib/taskTypes.ts`** — Remover a entrada `{ id: 'whatsapp', ... }` de `TASK_TYPES`. O fallback existente em `getTaskTypeConfig` (`?? TASK_TYPES[0]`) garante que tarefas antigas salvas como `whatsapp` no banco continuem renderizando como "Geral" sem quebrar.

2. **`src/components/contacts/ContactTasks.tsx`** — Remover o `<SelectItem value="whatsapp">` do select de tipo (linha 201).

3. **`src/lib/i18n.ts`** — Remover as chaves `'tasks.typeWhatsapp'` em PT (linha 204) e EN (linha 672).

### Sobre dados existentes
Tarefas já salvas com `task_type = 'whatsapp'` continuam no banco (não há migração destrutiva). Elas serão exibidas com o ícone/label "Geral" via fallback. Se o usuário editar e salvar, passará a ser do tipo escolhido. Não recomendo migração SQL para reescrever para `'message'` sem confirmação, mas posso fazer se quiser.

### Fora de escopo
Os usos de `'whatsapp'` em outros módulos (mensagens, canais, threads) **não** são alterados — referem-se ao canal de comunicação, não ao tipo de tarefa.