# P1 — Template em massa cria thread nova em vez de reabrir thread existente

**Status:** Aberto (não corrigir agora — apenas registrado)
**Criado:** durante Batch A do merge de threads duplicadas (2026-07-03)

## Bug confirmado

O fluxo de envio de template em massa está criando uma nova `message_thread`
em vez de reabrir/reusar uma thread existente com a mesma chave lógica:

- `organization_id`
- `contact_id`
- `channel`
- `primary_endpoint_id`
- `business_context`

Isso gera duplicatas que precisam ser consolidadas manualmente (batch merge).

## Correção futura

Antes de criar thread para envio de template:

1. Buscar thread existente pela chave lógica **sem filtrar apenas status ativo**
   (ou seja, incluir `resolved` e `closed`).
2. Se existir uma thread `resolved`/`closed`, **reabrir** (atualizar `status`
   para `open` e limpar `resolved_at` se necessário) e usar essa thread.
3. Só criar thread nova se realmente não houver nenhuma na chave lógica.

Mesma regra que já foi aplicada no `NewConversationDialog` corrigido.

## Locais prováveis de mudança

- Fluxo de envio em massa de template (procurar por `whatsapp_templates` +
  criação de `message_threads` no frontend/edge functions).
- Reaproveitar helper de lookup usado pelo `NewConversationDialog`.

## Prevenção estrutural

Após 24h de operação estável pós-merge, avaliar:

- Criar constraint UNIQUE parcial em
  `(organization_id, contact_id, channel, primary_endpoint_id, business_context)`
  filtrando `WHERE merged_into_thread_id IS NULL AND status <> 'closed'`
  (ou variação equivalente) para tornar a duplicata impossível no banco.
