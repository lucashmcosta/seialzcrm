## Execução aprovada — backfill 30 threads Lead Ads 7020

### 1. Gate SELECT (esperando 30)
```sql
SELECT COUNT(DISTINCT t.id)
FROM message_threads t
WHERE t.organization_id = '40ae935c-...'
  AND t.primary_endpoint_id IS NULL
  AND EXISTS (
    SELECT 1 FROM messages m
    WHERE m.thread_id = t.id
      AND m.direction = 'outbound'
      AND m.endpoint_id = '407ff93d-4860-49cd-82ae-beda456c1774'
  );
```
- `= 30` → segue para passo 2
- `≠ 30` → **PARA** e reporta

### 2. UPDATE idempotente (somente se gate = 30)
```sql
UPDATE message_threads t
SET primary_endpoint_id = '407ff93d-4860-49cd-82ae-beda456c1774'
WHERE t.organization_id = '40ae935c-...'
  AND t.primary_endpoint_id IS NULL
  AND EXISTS (
    SELECT 1 FROM messages m
    WHERE m.thread_id = t.id
      AND m.direction = 'outbound'
      AND m.endpoint_id = '407ff93d-4860-49cd-82ae-beda456c1774'
  );
```
A cláusula `primary_endpoint_id IS NULL` garante zero sobrescrita.

### 3. Validações
- **Re-SELECT gate** → deve retornar `0`.
- **Contagem de UPDATE** → deve ser `30` (linhas afetadas).
- **Sanity 7027 intacto**: `SELECT COUNT(*) FROM message_threads WHERE organization_id='40ae935c-...' AND primary_endpoint_id='c09bd713-...'` antes/depois → idêntico.
- **Sanity legado**: `SELECT COUNT(*) WHERE primary_endpoint_id IS NULL AND NOT EXISTS(outbound com endpoint_id)` antes/depois → idêntico (2.452 não tocadas).
- **UI**: abrir `/messages`, confirmar badge **Novo · 7020** nas threads Lead Ads afetadas.

### Salvaguardas mantidas
- Escopo restrito à org Central (`40ae935c-...`).
- Não toca 7027 (`c09bd713-...`).
- Não toca 2.452 threads legadas sem outbound `endpoint_id`.
- Não altera `messages`, `contacts`, `opportunities`, status ou timestamps.
- Patch self-heal já ativo em `meta-whatsapp-send` cobre envios futuros.

### Abort conditions
- Gate `≠ 30` → para sem UPDATE, reporta delta.
- UPDATE retorna `≠ 30` linhas → reporta e investiga antes de qualquer ação adicional.
