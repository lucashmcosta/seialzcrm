# Comercial: remover fichas de status e filtro de responsável com seleção múltipla

## O que muda para o usuário

1. **Fichas removidas**: somem de vez "Minhas", "Não atribuídas", "Todas abertas" e "Resolvidas" do topo da lista. A lista passa a mostrar sempre as conversas abertas (o comportamento atual de "Todas abertas" para quem pode ver tudo; para quem não pode, continua vendo só as suas e as sem responsável, como a regra de acesso já garante).
2. **Filtro de Responsáveis com várias escolhas**: a janela do filtro troca a escolha única por caixas de marcar. Dá para marcar vários responsáveis e também "Sem responsável" junto. "Limpar" desmarca tudo (= todos). O marcador verde no botão continua aparecendo quando há filtro, e o "Limpar filtros" da lista também zera essa seleção.
3. **Não-admins**: quem não tem permissão de ver todas as conversas só consegue marcar a si mesmo e "Sem responsável". Ao tentar marcar outra pessoa, a caixa não marca e aparece um aviso: "Você não tem permissão para ver conversas de outros responsáveis."

## Detalhes técnicos

- `src/pages/messages/MessagesList.tsx`
  - Remover `allFilterOptions`/`filterOptions`, a renderização das fichas e o `useEffect` que força `mine`; fixar o filtro interno em `all_open` (sem estado de ficha). Ajustar `hasActiveListFilters` e `clearListFilters`.
  - `assigneeFilter` vira `string[]` (ids + token `'unassigned'`); limpeza automática remove ids que não existem mais.
  - Passar ao hook `assignedUserIds` e `includeUnassigned`.
- `src/components/messages/AssigneeFilterDialog.tsx`: Checkbox em vez de RadioGroup; prop `canSelectOthers` + `currentUserId`; clique bloqueado dispara toast de permissão.
- `src/hooks/useMessageThreads.ts`: novas opções `assignedUserIds?: string[]`, `includeUnassigned?: boolean`, enviadas na carga inicial e no `loadMore`, na chave de dependência; realtime continua refazendo a consulta quando houver filtro.
- Banco — `rpc_list_message_threads`: adicionar `p_assigned_user_ids uuid[] DEFAULT NULL` na **mesma** função (DROP + CREATE com a lista completa de parâmetros, todos os novos com default), mantendo `p_assigned_user_id`/`p_unassigned_only` para o app nativo publicado. Sem criar overload (regra PGRST203). Filtro: `(assigned_user_id = ANY(p_assigned_user_ids)) OR (p_unassigned_only AND assigned_user_id IS NULL)` quando algum for informado, antes do LIMIT/cursor. Regras de visibilidade, SECURITY DEFINER e GRANTs inalterados — a permissão real continua no servidor; o bloqueio na tela é só aviso.
- Docs: atualizar assinatura em `docs/modules/messages/data-model.md`.

## Validação
- Marcar 2 responsáveis + "Sem responsável" e conferir contagem contra o banco, com "carregar mais".
- Como usuário sem "ver todas", confirmar aviso ao marcar outra pessoa e que a lista não mostra nada além do permitido.
- App nativo: chamada antiga (um responsável) continua funcionando.
