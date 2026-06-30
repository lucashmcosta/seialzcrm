## Backfill parcial — 28 threads não-conflitantes

### UPDATE
```sql
UPDATE message_threads t
SET primary_endpoint_id = '407ff93d-4860-49cd-82ae-beda456c1774'
WHERE t.organization_id = '40ae935c-a7f7-4ad7-8ea4-91be6404a95f'
  AND t.primary_endpoint_id IS NULL
  AND EXISTS (
    SELECT 1 FROM messages m
    WHERE m.thread_id = t.id
      AND m.direction = 'outbound'
      AND m.endpoint_id = '407ff93d-4860-49cd-82ae-beda456c1774'
  )
  AND NOT EXISTS (
    SELECT 1 FROM message_threads ot
    WHERE ot.organization_id = t.organization_id
      AND ot.contact_id = t.contact_id
      AND ot.channel = t.channel
      AND ot.primary_endpoint_id = '407ff93d-4860-49cd-82ae-beda456c1774'
      AND ot.status IN ('open','awaiting_client','in_progress')
      AND ot.id <> t.id
  );
```
Esperado: **28 linhas atualizadas**. Se ≠ 28 → para e reporta.

### Validações
1. Gate residual = `2` (apenas as duplicadas `3c4c43b3…` e `f6f135a2…`).
2. Confirmar que os 2 IDs residuais são exatamente os listados.
3. 7027: `COUNT` em `primary_endpoint_id='c09bd713-0225-4533-afe8-20ac07bd3a7c'` = `3532` (inalterado).
4. Legado NULL sem outbound `endpoint_id`: `COUNT` = `2450` (inalterado).
5. UI `/messages` da org Central → badge **Novo · 7020** nas 28 threads carimbadas.

### Não-ações (explícito)
- Não fechar, não mergear, não alterar status das 2 duplicadas.
- Não tocar 7027, não tocar legado, não alterar UI.
- Duplicadas ficam para plano separado.
