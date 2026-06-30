Diagnóstico read-only realizado:

- Thread selecionada pelo print/Joao Teste mais recente:
  - `thread_id`: `f235fc05-e995-446d-b8a5-357571823ab4`
  - `contact.lifecycle_stage`: `lead`
  - `primary_endpoint_id`: `b303253e-a7f3-49b7-b92f-efdeb12071f4`
  - `endpoint.purpose`: `other`
  - `message_threads.last_routing_decision`: `null`
- Código verificado:
  - `NewConversationDialog` só grava `last_routing_decision` ao criar thread nova, mas a thread do teste foi criada sem marcador.
  - `useInboxThread` já traz `last_routing_decision` no select.
  - `InboxThreadDetail` passa a `thread` completa para o `InboxComposer`.
  - `InboxComposer` já checa `thread.last_routing_decision?.action === 'inbox_manual_start'` e endpoint `customer_service` ou `other`.
  - Endpoint da thread é `other`, então deveria liberar se o marcador existisse.

Plano de correção objetiva:

1. Corrigir `NewConversationDialog` para, quando usado com `routingDecision`, garantir o marcador também em thread existente aberta no mesmo contato + endpoint.
   - Hoje ele retorna a thread existente sem gravar nada.
   - Ajuste: se `existingThread` existir e `routingDecision` estiver definido, fazer `update({ last_routing_decision: routingDecision })` nessa thread antes de selecionar.
   - Isso cobre o caso real: usuário clica Nova conversa, seleciona contato, e o sistema reaproveita thread aberta já existente sem marcador.

2. Ajustar a query de thread existente no `NewConversationDialog` para buscar também `last_routing_decision`, evitando update desnecessário se já for `inbox_manual_start`.

3. Corrigir tipos mínimos:
   - Incluir `last_routing_decision?: Record<string, unknown> | null` em `ThreadLike`/`InboxScopedThread` se necessário para reduzir casts e garantir que o composer enxergue o campo.

4. Verificação pós-correção:
   - Confirmar que a thread `f235fc05-e995-446d-b8a5-357571823ab4` passará a receber `last_routing_decision.action = 'inbox_manual_start'` se for reaberta pelo botão Nova conversa do Atendimento.
   - Confirmar que o guard do composer libera porque: lifecycle `lead` + endpoint `other` + marcador `inbox_manual_start`.
   - Confirmar que reload preserva a liberação porque o marcador fica persistido em `message_threads.last_routing_decision`.

Escopo mantido:
- Não mexer na listagem do Inbox.
- Não liberar threads antigas sem ação explícita via botão Nova conversa.
- Não alterar endpoint comercial/vendor.
- Envio continua saindo pelo `primary_endpoint_id` da thread de Atendimento.