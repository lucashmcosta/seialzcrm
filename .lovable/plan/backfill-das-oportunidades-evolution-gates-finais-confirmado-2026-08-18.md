# Backfill das oportunidades Evolution — gates finais confirmados

## Confirmação dos gates (verificados agora, read-only)

```text
BACKFILL_SCOPE=CENTRAL_ONLY                     (org 40ae935c…; Viagi fora)
CONTACTS_TO_CREATE=28
CONTACTS_WITH_OPEN_OPPORTUNITY_SKIPPED=YES
PIPELINE_STAGE=Novo (b2fca5f6-9fb6-422f-bfe3-7495dcccec55)
OWNER_RULE=contact.owner_user_id                (28/28 têm dono; 0 nulos)
TRANSACTION=ONE_TRANSACTION
BATCH_ID=GENERATED
ROLLBACK_SUPPORTED=YES
```

Observações de precisão sobre dois gates:

- **CONTACTS_TO_CREATE=28** — são os contatos com inbound em endpoint Evolution da Central que hoje têm **zero** oportunidades não excluídas. Eram 29 no levantamento de ontem; um deles (`4f002159…`) recebeu oportunidade nesse intervalo e saiu da lista. O número é recalculado dentro da própria transação, então se algo mudar até o commit o lote acompanha.
- **CONTACTS_WITH_OPEN_OPPORTUNITY_SKIPPED=YES** — a guarda é a mesma do webhook (`status='open' AND deleted_at IS NULL`). Na prática ela é redundante aqui, porque o recorte já exige zero oportunidades; fica no SQL como cinto de segurança contra corrida.

## Como o rollback é suportado

`opportunities` não tem coluna de lote. O webhook nunca grava `source_external_id` (fica NULL) e deixa `source` no default `manual`. Então o marcador do lote vai em `source_external_id`:

```text
source_external_id = 'evolution_backfill:<batch_id>'
source             = default ('manual', idêntico ao webhook)
```

Reversão do lote inteiro:

```sql
UPDATE public.opportunities
   SET deleted_at = now()
 WHERE source_external_id = 'evolution_backfill:<batch_id>';
```

Nenhum outro campo divergirá do que o webhook teria criado.

## O que o commit executa (transação única)

1. Gerar `batch_id` (`gen_random_uuid()`) inédito e registrá-lo no `RAISE NOTICE` do bloco.
2. Selecionar os contatos elegíveis: org Central, `deleted_at IS NULL`, com pelo menos um inbound em endpoint `provider='evolution_api'`, sem nenhuma oportunidade não excluída e sem oportunidade aberta.
3. Inserir uma oportunidade por contato, replicando `autoCreateOpportunityIfEnabled`:
   - `title = 'Oportunidade - ' || nome do contato`
   - `status = 'open'`
   - `pipeline_stage_id` = primeira etapa da org por `order_index` (`Novo`), pois `default_stage_id` é null
   - `owner_user_id` = `contacts.owner_user_id` quando existir
   - `source_external_id` = marcador do lote
4. Pós-condições verificadas na mesma transação, com `RAISE EXCEPTION` (rollback automático) se qualquer uma falhar:

```text
INSERTED_COUNT = ELIGIBLE_COUNT
CONTACTS_ELEGIVEIS_RESTANTES = 0
OPPS_CRIADAS_FORA_DA_CENTRAL = 0
OPPS_CRIADAS_EM_OUTRA_ETAPA = 0
OPPS_DUPLICADAS_POR_CONTATO = 0
```

## Fora de escopo

- Viagi (406 contatos do piloto de julho) — não tocada.
- Nenhuma alteração em endpoints, `active_endpoint_id`, integrações, webhooks ou Atendimento.
