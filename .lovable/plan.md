## Aplicação aprovada — aguardando build mode

Os 6 patches e a migration estão prontos. Vou executar nesta ordem assim que o build mode for ativado.

### 1) Patches de código (paralelos)

**A. `supabase/functions/twilio-whatsapp-send/index.ts` (linhas 607–616)**
Substituir `.limit(1).single()` pelo fallback ordenado:
```ts
} else {
  // Legacy fallback: threadId not provided. Pick the most recently updated
  // WhatsApp thread for this contact (any endpoint).
  const { data: existingThread } = await supabase
    .from('message_threads')
    .select('id, whatsapp_last_inbound_at')
    .eq('organization_id', organizationId)
    .eq('contact_id', contactId)
    .eq('channel', 'whatsapp')
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle()
```

**B. `src/components/messages/NewConversationDialog.tsx` (82–89)** — mesma troca: `.order('updated_at',{ascending:false}).limit(1).maybeSingle()`.

**C. `src/components/whatsapp/WhatsAppChat.tsx` (133–139)** — idem.

**D. `src/components/contacts/ContactMessages.tsx` (273–279)** — idem.

**E. `supabase/functions/twilio-whatsapp-webhook/index.ts`**
- Linha 715 (`!contactId`) → TwiML vazio.
- Linha 855 (erro criando thread) → TwiML vazio.
- `/status` (linhas 1036 e 1104) **permanece `OK`** (conforme combinado).

### 2) Migration (chamada separada, sem paralelo)

```sql
SET lock_timeout = '5s';
SET statement_timeout = '60s';

DROP INDEX IF EXISTS public.message_threads_unique_open_per_contact;

CREATE UNIQUE INDEX message_threads_unique_open_per_contact_endpoint
  ON public.message_threads (organization_id, contact_id, channel, primary_endpoint_id)
  WHERE status IN ('open', 'awaiting_client', 'in_progress')
    AND primary_endpoint_id IS NOT NULL;

CREATE UNIQUE INDEX message_threads_unique_open_per_contact_legacy
  ON public.message_threads (organization_id, contact_id, channel)
  WHERE status IN ('open', 'awaiting_client', 'in_progress')
    AND primary_endpoint_id IS NULL;
```

Se falhar por `lock_timeout` ou `statement_timeout`, paro e reporto sem retry automático.

### 3) Deploy
`twilio-whatsapp-webhook` e `twilio-whatsapp-send` são deployados automaticamente.

### 4) Teste end-to-end (João Teste — `+5511964298621`)
1. Cliente envia inbound para 7067 → confere via logs do webhook (`endpointId = b303253e-…`, `Created new thread`).
2. `/messages` mostra nova conversa "Joao Teste" com badge `via …7067`.
3. Thread 7027 antiga (`26e41c8b-…`) continua aberta, sem badge.
4. Twilio **não** envia mais `OK` ao cliente (resposta TwiML vazia).
5. Segundo inbound do 7067 cai na **mesma** nova thread (log `Updated existing thread`).

### Fora de escopo (mantido)
- Threads antigas, mensagens antigas, Inbox v2, `twilio-whatsapp-send` fora do fallback legacy.

**Ação necessária:** mudar para build mode para eu executar.