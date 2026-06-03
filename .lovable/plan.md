## Problema

A edge function `twilio-whatsapp-send` (caminho `inbox`) bloqueia o envio com `400 no_endpoint` quando `message_threads.primary_endpoint_id` é NULL. Hoje há 30+ threads de WhatsApp abertas (org Viagi) sem esse campo preenchido — todas falham ao tentar responder pelo Atendimento.

A coluna foi adicionada em uma fase posterior; o webhook só faz backfill quando entra uma mensagem nova. Threads antigos sem inbound recente nunca foram preenchidos.

## Solução em 2 etapas

### 1. Backfill (migração SQL)

Preencher `primary_endpoint_id` em todos os threads de WhatsApp onde está NULL, usando o `endpoint_id` da mensagem mais recente do thread (já resolvido pelo webhook em mensagens novas).

```sql
UPDATE message_threads t
SET primary_endpoint_id = m.endpoint_id
FROM (
  SELECT DISTINCT ON (thread_id) thread_id, endpoint_id
  FROM messages
  WHERE endpoint_id IS NOT NULL
  ORDER BY thread_id, created_at DESC
) m
WHERE t.id = m.thread_id
  AND t.channel = 'whatsapp'
  AND t.primary_endpoint_id IS NULL;
```

Para threads que **nenhuma** mensagem tem `endpoint_id` resolvido, fazer uma 2ª passada usando o único endpoint ativo de `whatsapp` da organização (quando há apenas um candidato):

```sql
UPDATE message_threads t
SET primary_endpoint_id = ep.id
FROM communication_endpoints ep
WHERE t.primary_endpoint_id IS NULL
  AND t.channel = 'whatsapp'
  AND ep.organization_id = t.organization_id
  AND ep.channel = 'whatsapp'
  AND ep.is_active = true
  AND ep.purpose IN ('customer_service','other')
  AND (
    SELECT count(*) FROM communication_endpoints ep2
    WHERE ep2.organization_id = t.organization_id
      AND ep2.channel = 'whatsapp'
      AND ep2.is_active = true
      AND ep2.purpose IN ('customer_service','other')
  ) = 1;
```

### 2. Resiliência da edge function `twilio-whatsapp-send`

No bloco `senderContext === 'inbox'`, antes de retornar `no_endpoint`, tentar resolver dinamicamente:

1. `endpoint_id` da última mensagem do thread (`messages.endpoint_id IS NOT NULL ORDER BY created_at DESC LIMIT 1`).
2. Se ainda NULL e a organização tem **apenas um** endpoint `whatsapp` ativo (purpose `customer_service`/`other`), usar ele.
3. Se resolveu, fazer `UPDATE message_threads SET primary_endpoint_id = ...` best-effort (mesma lógica de backfill já existente no fim do arquivo) e seguir o fluxo normal.
4. Só retornar `no_endpoint` se nada resolver — com um log mais detalhado (`{ organization_id, candidates_count }`).

Isso evita que threads futuros que escapem do backfill quebrem o envio.

## Arquivos

- Nova migração SQL (via tool de migração).
- `supabase/functions/twilio-whatsapp-send/index.ts` — adicionar fallback de resolução no bloco `inbox`.

## Validação

- Reabrir conversa com CLAUDIOMARA e enviar mensagem → deve sair.
- Query: `SELECT count(*) FROM message_threads WHERE channel='whatsapp' AND primary_endpoint_id IS NULL AND status='open'` → deve cair para ~0.
- Conferir log da edge function: sem novos `[inbox-send] blocked reason=no_endpoint`.

## Observação sobre o Matheus

O thread atual do Matheus (`9d4dbb52...`) **tem** `primary_endpoint_id` válido e passa em todas as guardas. O erro que vocês viram veio de uma conversa diferente selecionada no momento (CLAUDIOMARA). Após o fix os dois funcionam.