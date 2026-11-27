# Documentos do cliente indo para o Nammux

## O que foi confirmado
- A certidão de casamento do Flavio (19/11 19:31 UTC) foi salva **no cliente**, não na oportunidade. Os outros 3 documentos dele (06/11) também.
- Ele tem uma oportunidade **ganha** (`ec25368d…`).
- O envio automático pós-ganho só olha documentos salvos **na oportunidade**. Documento salvo no cliente só vai sozinho se for contrato assinado (SuvSign). Por isso a certidão não foi.

## O que vai mudar
1. Documento salvo no cliente passa a ir para o Nammux automaticamente, para cada oportunidade ganha desse cliente que já foi enviada ao Nammux com sucesso (mesma regra que o contrato assinado já usa).
2. Cliente sem oportunidade ganha enviada: nada muda, nenhum processo novo é criado.
3. Reenvio único da certidão do Flavio. Os documentos de 06/11 serão checados antes: se já foram no envio do ganho, não reenvio.

## Detalhes técnicos
- Migration: novo trigger AFTER INSERT em `documents` para `entity_type='contact'` (exceto `external_source='suvsign'`, que já tem fluxo próprio), reaproveitando a montagem de payload/idempotência de `fn_emit_nammux_post_win_document`, iterando as oportunidades won do contato com job `send_opportunity_won` em `success`. Grava só no outbox `integration_events`; entrega continua no `integration-worker`.
- Falha no trigger vira `warning`, nunca bloqueia o upload.
- Idempotência por (documento, oportunidade) para não duplicar com o fluxo da oportunidade.
- Backfill pontual só do documento `a3be1f68-29db-42c7-b6d3-1c7db668c66c`, com SQL de rollback em `docs/`.
- Teste SQL em `tests/sql/` cobrindo: cliente com ganha enviada → evento; sem ganha → nada; contrato SuvSign → não duplica.
- Atualizar `docs/integrations` do Nammux e catálogo.
