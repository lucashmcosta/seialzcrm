Plano aprovado para implementação

Escopo
- Corrigir somente `NewConversationDialog` e validações relacionadas ao fluxo de Atendimento.
- Manter `/messages` e Twilio legado intactos.
- Não fazer migration, backfill ou correção em lote.

Mudanças
1. `NewConversationDialog`
   - Detectar quando `forcePurposes` representa fluxo de Atendimento (`customer_service` ou `other`).
   - Dentro dos endpoints elegíveis por `forcePurposes`, se existir endpoint `provider='meta_cloud_api'`, ele será escolhido antes de qualquer Twilio/transitional.
   - A busca de thread existente continuará filtrando por `primary_endpoint_id = effectiveEndpointId`, agora com o endpoint efetivo Meta quando houver Meta elegível, evitando reaproveitar thread Twilio antiga do mesmo contato.

2. Threads criadas erradas
   - Não fazer backfill.
   - Não fazer correção em lote.
   - Só avaliar correção pontual da thread do teste se houver certeza de que ela tem:
     - `last_routing_decision.action='inbox_manual_start'`;
     - endpoint Twilio;
     - criação recente por este fluxo.
   - Se houver dúvida, não alterar dados e reportar.

Validação
- Confirmar que Nova conversa pelo Atendimento com contato lead cria/reaproveita thread em endpoint Meta Cloud quando houver Meta elegível.
- Confirmar que o template selector recebe/usa `provider='meta_cloud_api'` e lista somente templates Meta.
- Confirmar que envio pelo Inbox sai via endpoint Meta.
- Confirmar que `/messages` e fluxo Twilio legado permanecem sem alteração.