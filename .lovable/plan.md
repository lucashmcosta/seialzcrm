# Trocar a listagem de conversas do mobile por `rpc_list_inbox_threads`

## Situação verificada

- `rpc_list_inbox_threads` existe e já encapsula todo o escopo de Atendimento, o filtro de aba, o `only_mine`, a ordenação e o limite.
- Neste repositório, os componentes mobile de Atendimento (`src/components/mobile/MobileInbox.tsx`) **já** consomem a RPC via `useInboxThreads` / `useInboxQueueCounts`. Os únicos acessos diretos a `message_threads` restantes no mobile são lookups pontuais por contato (criação de nova conversa), que não são varreduras de histórico.
- Portanto, o `select` sem `status`/`limit` que está estourando CPU está no cliente mobile externo (fora deste repo). O trabalho abaixo é a troca nesse cliente, usando o contrato exato já validado no banco.

## Contrato a usar no mobile

Chamada única, com todos os parâmetros nomeados:

```text
rpc_list_inbox_threads(
  p_organization_id           = <org atual>
  p_tab                       = 'active' | 'waiting' | 'resolved_today'
  p_only_mine                 = <bool do toggle "minhas">
  p_assigned_user_id          = <users.id interno> quando p_only_mine, senão null
  p_resolved_since            = início do dia na timezone da org (ISO)
  p_include_service_endpoints = organization.cs_inbox_includes_service_endpoints
  p_limit                     = 50
)
```

Retorno: `SETOF jsonb` — cada linha já é o objeto da thread, com `contact { id, name, phone, lifecycle_stage }` e `primary_endpoint { id, purpose, external_address, provider }` resolvidos. Não vem nome do responsável nem `business_context`.

## Mudanças no mobile

1. Remover a busca "todas as threads `channel='whatsapp'` da organização" e todo o filtro em JS de escopo/status/aba — isso passa a ser responsabilidade da RPC.
2. Criar um único fetcher de lista (espelhando `src/hooks/inbox/inboxScope.ts`): recebe aba, `onlyMine`, `internalUserId`, `orgTimezone`, `organizationId` e a flag da org; devolve as linhas na ordem recebida.
3. Calcular `p_resolved_since` com a mesma lógica de início-do-dia na timezone da org já usada para `rpc_inbox_queue_counts` (reaproveitar a função existente, sem duplicar regra).
4. `p_limit = 50` como page size do mobile; sem paginação incremental nesta etapa. Se o usuário chegar ao fim da lista, apenas indicar que há mais itens (nenhum "carregar mais" agora).
5. Não reordenar no cliente: renderizar na ordem retornada (`last_message_at DESC NULLS LAST`).
6. Se a tela exibir o nome do responsável, resolver por um lookup separado em `users` apenas para os `assigned_user_id` presentes na página (máx. 50 ids), em vez de buscar todos os usuários.
7. Realtime: manter a assinatura em `message_threads` filtrada por `organization_id`, com refetch debounced (~1,5s) chamando a RPC — nunca refetch por linha.
8. Tratar o erro `42501` da RPC (org não pertencente ao usuário) como estado vazio + mensagem, não como crash.

## Notas técnicas

- A RPC é `STABLE SECURITY DEFINER` e valida a associação via `current_user_org_ids()`; passar `organization_id` explicitamente é obrigatório e é o que habilita os índices compostos.
- `channel` não é filtrado pela RPC. Se o mobile precisar restringir a WhatsApp, filtrar no cliente sobre as 50 linhas (custo irrelevante) — não voltar a filtrar no banco por fora.
- Paginação por cursor exigiria alterar a assinatura da RPC; fora do escopo desta etapa.
