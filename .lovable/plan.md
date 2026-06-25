# Exibir histórico completo de mensagens do contato

## Problema

A contato ANA LUCIA MOREIRA BALBINO tem **2 threads** de WhatsApp no banco:

| Thread | Criada em | Mensagens | Última msg |
|---|---|---|---|
| `1ca34450…` (antiga) | 22/jun | 47 | hoje 13:59 |
| `59494c5f…` (atual) | hoje 14:24 | 8 | hoje 17:21 |

A aba **Mensagens** do contato usa `.limit(1)` ao buscar a thread (`ContactMessages.tsx` linha 278-286), então só renderiza a thread mais recente — por isso o histórico aparenta começar "Hoje". Não é dado perdido, é só a UI escondendo a thread antiga.

Isso acontece sempre que uma nova conversa é aberta para um contato que já tinha thread (ex.: endpoint diferente, ou nova conversa criada manualmente).

## Solução

Carregar **todas** as threads WhatsApp do contato e mesclar as mensagens em ordem cronológica única na timeline. A thread "ativa" para envio/janela 24h continua sendo a mais recente (comportamento atual preservado).

### Mudanças em `src/components/contacts/ContactMessages.tsx`

1. **Buscar todas as threads** do contato (canal whatsapp), ordenadas por `updated_at desc`, em vez de `.limit(1).maybeSingle()`.
2. **Guardar `threadIds: string[]`** (todas) além do `threadId` atual (a mais recente — usada para envio, janela 24h e realtime de updates).
3. **`fetchMessages`** passa a usar `.in('thread_id', threadIds)` para retornar mensagens de todas as threads, ordenadas por `sent_at`.
4. **Realtime de novas mensagens**: ajustar o filtro do canal Supabase para escutar todas as threads (criar um channel com filtro `thread_id=in.(...)` ou um channel por thread). Manter o realtime de `message_threads` apenas na thread ativa (janela 24h).
5. **Envio (texto/áudio/template)**: continua usando `threadId` ativo. Se a edge function retornar um `threadId` diferente, ele é adicionado à lista e vira o ativo (já é o fluxo atual).
6. **Separadores de data** já são gerados a partir do array `messages` ordenado, então funcionam automaticamente após o merge.

### Fora do escopo

- Não unificar threads no banco (são threads separadas legítimas, possivelmente de endpoints diferentes).
- Não mudar a aba Mensagens global nem o Inbox.
- Sem mudanças de backend, schema ou edge functions.

## Validação

- Abrir o contato ANA LUCIA: devem aparecer as 47 + 8 = 55 mensagens, com separadores "22 jun", "23 jun"…, "Hoje".
- Enviar nova mensagem: deve entrar na thread ativa (mais recente) e aparecer no fim da lista.
- Receber nova mensagem inbound em qualquer thread: aparece em tempo real.
