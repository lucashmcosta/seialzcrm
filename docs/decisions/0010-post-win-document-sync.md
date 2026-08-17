# ADR 0010 — Documentos pós-venda via outbox do Nammux

**Status:** Aceito.

## Contexto

O evento `opportunity.won` leva ao Nammux um retrato dos documentos existentes no
momento da venda. Um contrato assinado pode chegar depois desse evento, sobretudo
via callback do SuvSign, e então não aparece no processo jurídico sem replay manual.

Documentos de contato não podem ser roteados implicitamente: um contato pode ter
mais de uma oportunidade/processo e o mesmo arquivo nem sempre pertence a todos.

## Decisão

- Um trigger `AFTER INSERT` em `documents` publica um replay focado de
  `opportunity.won` quando o documento pertence diretamente a uma oportunidade
  já ganha e cujo job original do Nammux terminou com `status='success'`.
- O trigger grava apenas em `integration_events`; nenhuma chamada de rede ocorre
  na transação do documento.
- O payload contém somente o documento novo. Dados da oportunidade e do contato
  continuam sendo montados por `fn_build_opportunity_won_payload`.
- A chave é determinística por documento:
  `seialz:opportunity.won:{org}:{opportunity}:replay:document:{document}`.
- A opção existente `include_opportunity_attachments` controla também o envio
  pós-venda.
- Documentos de `contact`/`contact_document` ficam fora desta fase até existir
  política explícita de roteamento por processo.
- Erros do automatismo são registrados em `nammux_sync_events` e não invalidam o
  documento criado.
- Callbacks SuvSign passam a preencher e consultar
  `(organization_id, external_source, external_ref)`, aproveitando a unicidade
  já existente em `documents` como proteção de idempotência.
- A migration de ativação executa um backfill global dos documentos elegíveis,
  usando a mesma chave determinística do fluxo contínuo.

## Consequências

- Contratos assinados após a venda entram automaticamente no processo já criado.
- O worker existente conserva retries e dead letter; o trigger não aumenta o
  acoplamento entre upload e disponibilidade do Nammux.
- Reentregas do mesmo evento/documento são seguras.
- Documentos históricos elegíveis são enfileirados na ativação; documentos de
  contato continuam exigindo roteamento explícito.

## Rollback

Desativar `include_opportunity_attachments` interrompe novos replays por tenant.
Uma migration de rollback pode remover `trg_emit_nammux_post_win_document` e
`fn_emit_nammux_post_win_document` sem alterar documentos nem eventos já criados.
