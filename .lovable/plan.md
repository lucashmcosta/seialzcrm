## Objetivo

No menu **Ações → Oportunidades** da página `/messages` (desktop), adicionar uma terceira opção **"Mover etapa…"** ao lado de *Marcar como Ganho* e *Marcar como Perdido*. Ao clicar, abre um modal listando todas as etapas do kanban da organização; o usuário escolhe a etapa de destino e confirma.

Os atalhos atuais de Ganho/Perdido continuam funcionando exatamente como hoje.

## Mudanças

### `src/pages/messages/MessagesList.tsx`

1. **Carregar etapas completas** (linha 547-557): incluir `name` e `order_index` no `select` de `pipeline_stages` para conseguir listar e ordenar no modal.

2. **Novo estado**: `const [moveStageOpp, setMoveStageOpp] = useState<ChatOpp | null>(null)`.

3. **Novo item no DropdownMenu** (linha 1418-1425) — após "Marcar como Perdido", adicionar:
   ```
   <DropdownMenuItem onClick={() => setMoveStageOpp(opp)}>
     <ArrowsLeftRight /> Mover etapa…
   </DropdownMenuItem>
   ```

4. **Novo handler** `handleMoveStage(opp, stageId)`:
   - Faz `UPDATE opportunities SET pipeline_stage_id = stageId, updated_by = userProfile.id WHERE id = opp.id`.
   - Se a etapa escolhida for `type='won'` ou `'lost'`: reutiliza o fluxo atual (`setConfirmAction` / `setPendingCloseDate`) para pedir `close_date` se necessário e setar `status`.
   - Se for etapa "aberta" (qualquer outro `type`): apenas troca `pipeline_stage_id`, mantém `status='open'`, mostra toast de sucesso e remove a opp da lista local se mudou de contato/contexto (mantém na lista).
   - Toast: "Etapa atualizada".

5. **Novo componente inline** `MoveStageDialog` (dentro do mesmo arquivo, próximo ao `ConfirmDialog` no final):
   - `Dialog` shadcn com lista de etapas (radio buttons) ordenadas por `order_index`.
   - Cada item mostra `name` + badge pequeno com o `type` (Aberto/Ganho/Perdido) usando cor semântica.
   - Desabilita a etapa atual da oportunidade.
   - Botões "Cancelar" / "Confirmar".
   - Estado de loading enquanto o update roda.

## Detalhes técnicos

- A tabela `pipeline_stages` já tem `id, name, type, order_index, organization_id` (verificado).
- Reuso de `ConfirmDialog` e `CloseDatePromptDialog` existentes para o caso won/lost — sem duplicação.
- Sem mudanças em backend, RLS, edge functions ou outras páginas.
- Ícone `ArrowsLeftRight` do `@phosphor-icons/react` já é padrão do projeto.

## Fora de escopo

- Mobile (`MobileMessagesList`) — pode ser feito depois se solicitado.
- Inbox novo (`InboxThreadDetail`) — explicitamente o usuário pediu só em `/messages`.
- Bulk move (já existe no kanban).
