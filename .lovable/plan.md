## Diagnóstico

O badge "Novo · 7020" na lista de `/messages` (`EndpointBadge` em `src/components/messages/EndpointBadge.tsx`) depende de:

```
endpointById[ threadEndpointMap[thread.id] ?? primary_endpoint_id ].external_address
```

`threadEndpointMap` (hook `src/hooks/useThreadEndpointMap.ts`) lê **apenas** `message_threads.primary_endpoint_id`. Ou seja: o pill só aparece se a coluna `primary_endpoint_id` da thread apontar para o endpoint Meta 7020 (`407ff93d-4860-49cd-82ae-beda456c1774`).

A thread do **Fineias Santos** já foi rerouteada (a nota interna *"A partir deste ponto, este número passou a operar via Meta Cloud API…"* está lá), porém:

- O update de `primary_endpoint_id` para o endpoint Meta 7020 só foi adicionado em `supabase/functions/meta-whatsapp-send/index.ts` (linhas 560-611) **depois** que essa thread foi migrada.
- Resultado: a nota foi inserida por uma versão anterior do código (que só gravava a nota), mas a coluna `primary_endpoint_id` continua apontando para o endpoint legado Twilio (cujo `external_address` está no set de "números oficiais" → `EndpointBadge` retorna `null` e o pill some).
- Threads migradas após o deploy do bloco de persistência (Dany, SAMUEL, Cheila, etc.) têm `primary_endpoint_id` correto e por isso exibem "Novo · 7020".

Conclusão: **não é bug de render** e **não é bug do dispatcher atual** — é resíduo de dados em threads migradas antes da persistência ser adicionada.

## O que vou fazer

### 1. Backfill SQL (single migration, idempotente)
Para a org `40ae935c-a7f7-4ad7-8ea4-91be6404a95f`, atualizar `message_threads.primary_endpoint_id` para `407ff93d-4860-49cd-82ae-beda456c1774` em toda thread que:

- tenha pelo menos uma mensagem `direction='internal'` com `metadata->>'kind' = 'endpoint_migration_meta_7020'`;
- e cujo `primary_endpoint_id` atual seja diferente do target.

```sql
UPDATE public.message_threads t
SET primary_endpoint_id = '407ff93d-4860-49cd-82ae-beda456c1774'
WHERE t.organization_id = '40ae935c-a7f7-4ad7-8ea4-91be6404a95f'
  AND t.primary_endpoint_id IS DISTINCT FROM '407ff93d-4860-49cd-82ae-beda456c1774'
  AND EXISTS (
    SELECT 1 FROM public.messages m
    WHERE m.thread_id = t.id
      AND m.direction = 'internal'
      AND m.metadata->>'kind' = 'endpoint_migration_meta_7020'
  );
```

Read-only `SELECT COUNT(*)` da mesma query antes de aplicar, só para reportar quantas threads serão corrigidas (Fineias deve ser uma delas).

### 2. Self-heal no dispatcher (defesa em profundidade)
Em `src/lib/dispatchWhatsAppSend.ts`, no ramo `shouldReroute`, hoje só dispara a re-rota quando `resolved.provider === "twilio" || source === "default"`. Vou ampliar a guarda para também checar se já existe nota `endpoint_migration_meta_7020` na thread — nesse caso forçar `endpointId = REROUTE_TARGET_ENDPOINT_ID` mesmo se o `primary_endpoint_id` estiver inconsistente, garantindo que cada novo envio re-aplique o update via `migrationContext` (a edge function já faz `UPDATE ... neq` idempotente).

Nada muda visualmente além do badge passar a aparecer; nenhum endpoint novo é criado, nenhum dado de outras orgs é tocado.

## Arquivos afetados

- `supabase/migrations/<timestamp>_backfill_primary_endpoint_meta_7020.sql` (novo)
- `src/lib/dispatchWhatsAppSend.ts` (ajuste pequeno no guard de reroute)

## O que NÃO vou mexer

- `EndpointBadge.tsx`, `useOrgWhatsAppEndpoints.ts`, `useThreadEndpointMap.ts`, `MessagesList.tsx`, `meta-whatsapp-send/index.ts` permanecem intactos.
- Threads de outras organizações.
- Endpoints, integrações, tokens, webhooks.

## Validação

1. Rodar `SELECT count(*)` filtrando pelas condições do UPDATE → confirmar > 0 (esperado: Fineias + eventuais).
2. Aplicar migration.
3. Recarregar `/messages` em Central Trabalhista → thread do Fineias passa a exibir o pill "Novo · 7020" igual às demais.
