

# Unificar Contatos Duplicados + Fix last_inbound_at

## Passo 1: Deploy imediato -- Fix `last_inbound_at` no webhook

Adicionar `last_inbound_at` nos dois pontos do arquivo `supabase/functions/twilio-whatsapp-webhook/index.ts`:

**Linha 376 (update de thread existente):**
```typescript
.update({
  whatsapp_last_inbound_at: new Date().toISOString(),
  last_inbound_at: new Date().toISOString(),
  external_id: waId,
  updated_at: new Date().toISOString(),
})
```

**Linha 392 (insert de thread nova):**
```typescript
.insert({
  organization_id: orgId,
  contact_id: contactId,
  channel: 'whatsapp',
  subject: 'WhatsApp',
  external_id: waId,
  whatsapp_last_inbound_at: new Date().toISOString(),
  last_inbound_at: new Date().toISOString(),
})
```

Deploy da edge function `twilio-whatsapp-webhook`.

---

## Passo 2: Script SQL de unificacao completo

Dados levantados:

| Item | Contato Principal | Contato Duplicado |
|------|-------------------|-------------------|
| ID | `699b8729-a619-4423-9565-1f76bb15beea` | `228ae7b0-cc34-46e9-ba82-96e6cfc0754f` |
| Nome | andre rodrigues da cruz | Andre Cruz |
| Phone | +5543988758000 | +554388758000 |
| Thread ID | `9a9d191c-d73f-4a0d-a693-f6c09115cd5e` | `11dc02fc-d26f-42fd-b9ea-426755f6de2c` |
| Mensagens | 1 (outbound) | 15 (toda a conversa) |

Ambos tem thread WhatsApp, entao precisamos mesclar as threads.

**Thread principal**: `9a9d191c` (mais antiga, criada 22:00:29)
**Thread duplicada**: `11dc02fc` (criada 22:02:07, tem 15 mensagens)

### SQL completo (a ser executado no SQL Editor com Live selecionado):

```sql
BEGIN;

-- == ETAPA 1: Mesclar threads WhatsApp ==

-- Mover todas as mensagens da thread duplicada para a thread principal
UPDATE messages 
  SET thread_id = '9a9d191c-d73f-4a0d-a693-f6c09115cd5e'
  WHERE thread_id = '11dc02fc-d26f-42fd-b9ea-426755f6de2c';

-- Mover message_thread_reads da thread duplicada
UPDATE message_thread_reads 
  SET thread_id = '9a9d191c-d73f-4a0d-a693-f6c09115cd5e'
  WHERE thread_id = '11dc02fc-d26f-42fd-b9ea-426755f6de2c'
  AND NOT EXISTS (
    SELECT 1 FROM message_thread_reads mtr 
    WHERE mtr.thread_id = '9a9d191c-d73f-4a0d-a693-f6c09115cd5e' 
    AND mtr.user_id = message_thread_reads.user_id
  );
-- Deletar reads duplicados que nao puderam ser movidos
DELETE FROM message_thread_reads 
  WHERE thread_id = '11dc02fc-d26f-42fd-b9ea-426755f6de2c';

-- Mover scheduled_messages da thread duplicada
UPDATE scheduled_messages 
  SET thread_id = '9a9d191c-d73f-4a0d-a693-f6c09115cd5e'
  WHERE thread_id = '11dc02fc-d26f-42fd-b9ea-426755f6de2c';

-- Mover ai_agent_logs da thread duplicada
UPDATE ai_agent_logs 
  SET thread_id = '9a9d191c-d73f-4a0d-a693-f6c09115cd5e'
  WHERE thread_id = '11dc02fc-d26f-42fd-b9ea-426755f6de2c';

-- Atualizar thread principal com dados mais recentes da duplicada
UPDATE message_threads SET
  last_inbound_at = '2026-02-13 22:27:51.005+00',
  whatsapp_last_inbound_at = '2026-02-13 22:27:51.005+00',
  updated_at = '2026-02-13 22:32:51.493366+00',
  external_id = '554388758000',
  subject = 'WhatsApp'
  WHERE id = '9a9d191c-d73f-4a0d-a693-f6c09115cd5e';

-- Deletar thread duplicada (agora vazia)
DELETE FROM message_threads 
  WHERE id = '11dc02fc-d26f-42fd-b9ea-426755f6de2c';

-- == ETAPA 2: Mover registros vinculados ao contato duplicado ==

UPDATE opportunities SET contact_id = '699b8729-a619-4423-9565-1f76bb15beea' 
  WHERE contact_id = '228ae7b0-cc34-46e9-ba82-96e6cfc0754f';

UPDATE tasks SET contact_id = '699b8729-a619-4423-9565-1f76bb15beea' 
  WHERE contact_id = '228ae7b0-cc34-46e9-ba82-96e6cfc0754f';

UPDATE activities SET contact_id = '699b8729-a619-4423-9565-1f76bb15beea' 
  WHERE contact_id = '228ae7b0-cc34-46e9-ba82-96e6cfc0754f';

UPDATE calls SET contact_id = '699b8729-a619-4423-9565-1f76bb15beea' 
  WHERE contact_id = '228ae7b0-cc34-46e9-ba82-96e6cfc0754f';

UPDATE ai_agent_logs SET contact_id = '699b8729-a619-4423-9565-1f76bb15beea' 
  WHERE contact_id = '228ae7b0-cc34-46e9-ba82-96e6cfc0754f';

UPDATE contact_memories SET contact_id = '699b8729-a619-4423-9565-1f76bb15beea' 
  WHERE contact_id = '228ae7b0-cc34-46e9-ba82-96e6cfc0754f';

UPDATE scheduled_messages SET contact_id = '699b8729-a619-4423-9565-1f76bb15beea' 
  WHERE contact_id = '228ae7b0-cc34-46e9-ba82-96e6cfc0754f';

-- == ETAPA 3: Deletar contato duplicado ==

DELETE FROM contacts WHERE id = '228ae7b0-cc34-46e9-ba82-96e6cfc0754f';

COMMIT;
```

### O que esse script faz, em ordem:

1. Move as 15 mensagens da thread duplicada para a thread principal
2. Move/limpa `message_thread_reads`, `scheduled_messages` e `ai_agent_logs` vinculados a thread duplicada
3. Atualiza `last_inbound_at`, `whatsapp_last_inbound_at`, `updated_at` e `external_id` na thread principal com os valores mais recentes
4. Deleta a thread duplicada (agora vazia)
5. Move todos os registros de outras tabelas (opportunities, tasks, etc.) do contato duplicado para o principal
6. Deleta o contato duplicado

### Resultado final:
- 1 contato: "andre rodrigues da cruz" com phone `+5543988758000`
- 1 thread WhatsApp com todas as 16 mensagens unificadas

---

## Ordem de execucao

1. Corrigir webhook (`last_inbound_at`) e deploy
2. Voce executa o SQL acima no Cloud View > Run SQL (com **Live** selecionado)
