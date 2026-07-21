## Objetivo

Remover apenas o balão interno persistido `THREAD_PROVIDER_MIGRATED` da thread da Ralis, sem tocar em nenhum outro registro.

## Passos

1. **Localizar IDs** via `supabase--read_query` (read-only):
   - `thread_id` da Ralis (thread WhatsApp da contato Ralis, org Viagi).
   - `endpoint_id` do Meta ••••2890 e do Evolution ••••8439 (via `communication_endpoints`).
   - Confirmar existência de exatamente **1** linha em `messages` que satisfaça todos os filtros abaixo. Se >1 ou 0, parar e reportar.

2. **DELETE estritamente seletivo** via `supabase--insert` (tool para DML):

```sql
DELETE FROM public.messages
WHERE thread_id = '<ralis_thread_id>'
  AND direction = 'internal'
  AND metadata->>'kind' = 'THREAD_PROVIDER_MIGRATED'
  AND from_endpoint_id = '<meta_2890_endpoint_id>'
  AND to_endpoint_id   = '<evolution_8439_endpoint_id>';
```

3. **Verificar** com `SELECT count(*)` pós-delete que retorna 0 para o mesmo filtro, e que a thread da Ralis continua com as demais mensagens intactas (contagem antes/depois difere em exatamente 1).

## Garantias

- Nenhuma outra thread é afetada (filtro por `thread_id`).
- Nenhum outro tipo de evento é afetado (filtro por `metadata.kind`).
- Nenhuma mensagem inbound/outbound é afetada (`direction = 'internal'`).
- Sem alteração de código, edge function ou schema.
