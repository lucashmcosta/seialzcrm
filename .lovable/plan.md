# Corrigir "Tempo médio 1ª resposta" no Dashboard de Atendimento

## Diagnóstico

O KPI lê `message_threads.first_response_at` em `src/hooks/useServiceStats.ts`, mas essa coluna **nunca é populada** — confirmado no banco:

- Central Trabalhista: 4.529 threads, **0** com `first_response_at`.
- Globalmente: 8.436 threads, **0** com `first_response_at`.

Não existe trigger/job atualizando essa coluna. Já os demais KPIs funcionam porque vêm de `message_response_times` (que é populada normalmente — daí "Tempo médio de resposta" mostrar 7h 52m).

## Solução

Derivar a 1ª resposta a partir de `message_response_times` em vez da coluna morta. Para cada thread criada no período, pegar o **primeiro** registro de resposta (menor `inbound_at`) e usar seu `response_seconds` na média.

## Alteração

**`src/hooks/useServiceStats.ts`** — trocar a leitura de `first_response_at`:

1. Remover `first_response_at` do `select` de `threadRowsPromise` (ficam `contact_id, id, created_at`).
2. Substituir o cálculo atual de `firstResponseDiffs` por:
   - Buscar de `message_response_times` os campos `thread_id, inbound_at, response_seconds` filtrando por `organization_id`, `thread_id IN (ids das threads do período)` e, se `ownerId !== 'all'`, `user_id = ownerId`.
   - Usar `fetchAllPagedRows` para paginar; chunkar o `.in('thread_id', …)` em lotes de 300 para evitar URL gigante.
   - Reduzir para um Map<thread_id, {inbound_at, response_seconds}> mantendo apenas o registro com menor `inbound_at` por thread.
   - `avgFirstResponseSeconds = média dos response_seconds finitos e ≥ 0` desse Map (ou `null` se vazio).
3. Manter todo o resto (contactsCount, totalCount, resolvedCount, avgResponseSeconds) inalterado.

## Fora de escopo

- Backfill/trigger para popular `first_response_at` (coluna fica como está — opcional para uma próxima).
- Mudanças em `MobileReports` / Inbox (eles usam outras fontes).
- UI: nenhum componente muda.
