## Aplicar regra de Data de Fechamento obrigatória no menu de Mensagens

Hoje, no menu **Ações → Oportunidades → Marcar como Ganho/Perdido** dentro de `/messages`, a oportunidade é atualizada direto via `ConfirmDialog`, sem exigir `close_date`. Vamos alinhar com o comportamento já implementado no detalhe e no Kanban.

### Arquivo

- `src/pages/messages/MessagesList.tsx`

### Mudanças

1. **Tipo `ChatOpp`** (linha 287): incluir `close_date: string | null`.
2. **Query de oportunidades do contato** (próxima ao `setContactOpportunities`, ~linha 560): adicionar `close_date` ao `select`.
3. **`handleMarkOpportunity`** (linhas 564–601):
   - Se `opp.close_date` já existir → comportamento atual (segue direto).
   - Se estiver vazio → não fazer o update; em vez disso, abrir o `CloseDatePromptDialog` já criado em `src/components/opportunities/CloseDatePromptDialog.tsx`.
4. **Estado novo**: `pendingCloseDate: { kind: 'won' | 'lost'; opp: ChatOpp } | null` para guardar a ação enquanto o usuário escolhe a data.
5. **Fluxo do Confirm atual**:
   - Quando o usuário confirmar no `ConfirmDialog`, chamar `handleMarkOpportunity`. Se faltar `close_date`, fechar o `ConfirmDialog`, abrir o `CloseDatePromptDialog`. Ao confirmar a data, executar o update com `{ status, pipeline_stage_id, close_date, updated_by }` e atualizar a lista local.
6. **Render**: adicionar `<CloseDatePromptDialog>` próximo ao `ConfirmDialog` existente (~linha 1920), com título "Marcar como Ganho/Perdido" conforme `kind`.

### Não muda

- Versão mobile (`MobileMessagesList`) não tem essa ação — sem alterações.
- Banco, RLS, edge functions e relatórios permanecem iguais.
- Oportunidades que já tinham `close_date` continuam sendo marcadas direto, sem prompt extra.