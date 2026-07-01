
# Correção: endpoint 7027 = Atendimento

## 3 confirmações

**1. Flag `cs_inbox_includes_service_endpoints` na Central** → **`true`** ✓

```
id   = 40ae935c-a7f7-4ad7-8ea4-91be6404a95f
name = Central Trabalhista
cs_inbox_includes_service_endpoints = true
```

Ou seja, o segundo ramo do WHERE do `rpc_list_inbox_threads` já está armado:

```sql
OR (p_include_service_endpoints AND e.purpose = 'customer_service')
```

Só não dispara porque `e.purpose = 'other'`, não `'customer_service'`.

**2. Por que 7027 está `purpose='other'`**

```
id                = c09bd713-0225-4533-afe8-20ac07bd3a7c
external_address  = +551150287027
purpose           = other          ← problema
provider          = meta_cloud_api
is_active/status  = true / online
created_at        = 2026-05-28 17:22:02.165+00
```

Esse timestamp bate exatamente com o batch da migration `populate_communication_endpoints_from_v2_senders` (o mesmo cutoff `MIGRATION_GHOST_CUTOFF = 2026-05-28T17:22:03Z` documentado em `src/hooks/useOrgWhatsAppEndpoints.ts`). Aquela migration criou os endpoints replicando `whatsapp_senders` com `purpose='other'` como default e o valor nunca foi corrigido depois — a UI de "Números adicionais" (`AdditionalEndpointsSection.tsx`) permite editar apelido, ativar/desativar e remover, mas **não expõe edição de `purpose`**. Por isso o número dedicado de Atendimento nasceu como `other` e ficou assim.

Comparação: `+551150287020` (Comercial) foi criado bem depois (`2026-06-26 22:41:21`), por outro fluxo, e nasceu com `purpose='commercial'` — coerente.

**3. UPDATE proposto (única mudança de dado)**

```sql
UPDATE public.communication_endpoints
SET    purpose    = 'customer_service',
       updated_at = now()
WHERE  id                    = 'c09bd713-0225-4533-afe8-20ac07bd3a7c'
  AND  organization_id       = '40ae935c-a7f7-4ad7-8ea4-91be6404a95f'
  AND  external_address      = '+551150287027'
  AND  purpose               = 'other';
```

Escopo travado por `id + organization_id + external_address + purpose atual` — impossível atingir Viagi ou o 7020.

## Efeito esperado no `/inbox` da Central

Reavaliando o WHERE do `rpc_list_inbox_threads` para a thread ativa do Joao Teste (`f235fc05…`):

- Ramo 1: `lifecycle='lead' = 'customer'` → FALSE (inalterado, sem promover contato)
- Ramo 2 (depois): `true AND 'customer_service' = 'customer_service'` → **TRUE** → linha entra na CTE base → aparece na aba "Ativos".

Mesma coisa em `rpc_inbox_queue_counts` — contadores passam a incluir threads do 7027 mesmo com contato ainda como lead.

## O que NÃO muda (garantias)

- Nenhum `UPDATE` em `contacts` (lifecycle preservado).
- Nenhum `UPDATE` em `message_threads` / `messages` / `thread_assignment_history`.
- Endpoint `+551150287020` (Comercial) intocado — continua `purpose='commercial'`, continua fora do Inbox de Atendimento.
- Nenhuma outra org tocada — filtro por `organization_id = 40ae935c…`.
- Nenhuma alteração de schema, RPC, RLS, índice, código de frontend ou edge function.
- Nada em Viagi.

## Validação pós-UPDATE

1. `SELECT purpose FROM communication_endpoints WHERE id='c09bd713-…'` → `customer_service`.
2. Abrir `/inbox` → aba "Ativos": thread `f235fc05…` (Joao Teste, 7027) presente.
3. Aba "Ativos" da /messages não deve mais mostrar essa thread como pertencente ao fluxo Comercial (a separação por endpoint agora fica coerente).
4. Contador da aba "Ativos" incrementa em +1 (essa thread) — se houver outras threads antigas em 7027 com contato-lead + status open/in_progress/awaiting_client, também aparecem. Sanity-check via:
   ```sql
   SELECT count(*) FROM message_threads t
     JOIN contacts c ON c.id=t.contact_id
    WHERE t.organization_id='40ae935c-a7f7-4ad7-8ea4-91be6404a95f'
      AND t.primary_endpoint_id='c09bd713-0225-4533-afe8-20ac07bd3a7c'
      AND t.status IN ('open','in_progress','awaiting_client');
   ```
   Contar antes para conferir o delta esperado nos badges.

## Follow-up recomendado (não incluído nesta correção)

Expor `purpose` como editável em `AdditionalEndpointsSection.tsx` (dropdown: Comercial / Atendimento / Vendedor pessoal / Outro), para que qualquer novo número herdado da migration antiga possa ser reclassificado pelo próprio admin — sem depender de UPDATE manual. Faço em uma segunda rodada se você quiser.

Aprove para eu executar o UPDATE via insert tool.
