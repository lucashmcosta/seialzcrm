## Execução aprovada (com salvaguarda extra) — aguardando build mode

### 1. Patch `supabase/functions/meta-whatsapp-send/index.ts` (após linha 433)

```ts
// Self-heal: carimba primary_endpoint_id em threads pré-existentes que nunca
// foram carimbadas. Idempotente — só atualiza quando ainda está NULL.
if (currentThreadId && endpoint?.id) {
  try {
    await supabase
      .from("message_threads")
      .update({ primary_endpoint_id: endpoint.id })
      .eq("id", currentThreadId)
      .eq("organization_id", organizationId)   // ← salvaguarda adicional
      .is("primary_endpoint_id", null);
  } catch (healErr) {
    console.warn("[meta-whatsapp-send] primary_endpoint_id self-heal failed", healErr);
  }
}
```

### 2. SELECT de conferência (gate)

```sql
SELECT COUNT(DISTINCT t.id) AS will_update
FROM public.message_threads t
JOIN public.messages m
  ON m.thread_id = t.id
 AND m.direction = 'outbound'
 AND m.endpoint_id = '407ff93d-4860-49cd-82ae-beda456c1774'
WHERE t.organization_id = '40ae935c-a7f7-4ad7-8ea4-91be6404a95f'
  AND t.primary_endpoint_id IS NULL;
```

**Se ≠ 29 → PARO e reporto. Sem UPDATE.**

### 3. UPDATE idempotente (somente se count = 29)

```sql
UPDATE public.message_threads t
SET primary_endpoint_id = '407ff93d-4860-49cd-82ae-beda456c1774'
WHERE t.organization_id = '40ae935c-a7f7-4ad7-8ea4-91be6404a95f'
  AND t.primary_endpoint_id IS NULL
  AND EXISTS (
    SELECT 1 FROM public.messages m
    WHERE m.thread_id = t.id
      AND m.direction = 'outbound'
      AND m.endpoint_id = '407ff93d-4860-49cd-82ae-beda456c1774'
  );
```

### 4. Validação

- Re-rodar SELECT → 0.
- Conferir badge **Novo · 7020** nas 29 threads em `/messages`.

Salvaguardas mantidas: não toca 2.452 legadas, não mexe 7027, não altera UI, nunca sobrescreve carimbo existente, não toca mensagens/contatos/oportunidades.

**Troca para build mode para eu prosseguir.**
