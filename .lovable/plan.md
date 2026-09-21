# Filtro por responsável na tela Comercial

## Objetivo

Adicionar, ao lado do filtro por número, um novo filtro que mostra apenas as conversas de um responsável escolhido. O filtro é aplicado no banco (antes da paginação), igual ao que foi feito no filtro por número — assim, mesmo responsáveis com conversas antigas aparecem no primeiro lote.

## Comportamento

- Novo botão de filtro no cabeçalho da lista de conversas (ícone de pessoa), com marcador verde quando há filtro ativo.
- Ao abrir, uma lista com:
  - "Todos os responsáveis" (sem filtro)
  - "Sem responsável" (conversas não atribuídas)
  - cada usuário ativo da organização, com avatar e nome
- Só um responsável por vez (mesmo padrão do filtro por número), com botões Limpar e Aplicar.
- Combina com os outros filtros já existentes: busca, número e as fichas "Minhas / Não atribuídas / Todas abertas / Resolvidas".
- A escolha fica guardada na sessão do usuário, como os outros filtros, e entra no "Limpar filtros" e no contador de conversas.
- Regras de acesso continuam iguais: quem não pode ver todas as conversas continua vendo apenas as suas — escolher outro responsável não revela nada a mais.
- O Atendimento (número 7027) permanece fora do Comercial, sem alteração.

## Detalhes técnicos

1. Banco: nova versão de `rpc_list_message_threads` com dois parâmetros adicionais, mantendo `SECURITY DEFINER`, validação de membro ativo, contexto comercial, busca, cursor e ordenação atuais:
   - `p_assigned_user_ids uuid[]` — quando não nulo, filtra `mt.assigned_user_id = ANY(...)`
   - `p_unassigned_only boolean default false` — quando verdadeiro, filtra `mt.assigned_user_id IS NULL`
   - Filtro aplicado no `WHERE`, antes de `LIMIT`/cursor; `GRANT EXECUTE` para `authenticated` e `service_role`.
   - Índice de apoio em `message_threads (organization_id, assigned_user_id, last_message_at DESC)` se ainda não existir.
2. `src/hooks/useMessageThreads.ts`: novas opções `assignedUserIds?: string[]` e `unassignedOnly?: boolean`, enviadas na carga inicial e no `loadMore`, incluídas nas chaves de dependência; com filtro ativo, o realtime refaz a consulta em vez de inserir thread não validada (mesmo tratamento do filtro por número).
3. Novo hook `src/hooks/useOrgUserFilterOptions.ts` — usuários ativos via `user_organizations` + `users` (mesma consulta do `OwnerSelector`), ordenados por nome.
4. Novo componente `src/components/messages/AssigneeFilterDialog.tsx` — mesmo layout do `EndpointFilterDialog`.
5. `src/pages/messages/MessagesList.tsx`: estado `assigneeFilter` persistido, botão no cabeçalho, passagem dos parâmetros ao hook, inclusão em `hasActiveListFilters` / `clearListFilters`, e limpeza automática se o responsável escolhido não existir mais na lista.
6. Documentação: registrar a nova assinatura da RPC em `docs/modules/messages/data-model.md` e atualizar o item de drift de overloads em `docs/operations/conflicts.md`.

## Validação

- Filtrar por um responsável com conversas antigas e confirmar que já vêm no primeiro lote, com "carregar mais" funcionando.
- Filtrar por "Sem responsável" e conferir contagem contra o banco.
- Confirmar que um usuário sem permissão de ver todas as conversas continua vendo apenas as próprias.
- Conferir que 7067/7020 seguem corretos e que o 7027 não aparece.
