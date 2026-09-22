# Sincronizar leitura para apagar a notificação no celular

## Auditoria (estado atual, verificado no código e no banco)

**1. Quem envia push**
Edge function `push-dispatch` (`supabase/functions/push-dispatch/index.ts`), acionada por cron
`pg_cron` a cada 30s com header `x-worker-token` (segredo do vault `push_dispatch_worker_token`).
Ela usa a **API da Expo** (`POST https://exp.host/--/api/v2/push/send`) — não fala direto com
FCM/APNs. Consome a fila `push_delivery_jobs` via `rpc_claim_push_delivery_jobs` (FOR UPDATE SKIP
LOCKED), com backoff e 5 tentativas até `dead_letter`.

Payload montado hoje, um objeto por token ativo do usuário:

```json
{ "to": "<expo_push_token>", "title": "<nome do contato>", "body": "<prévia>",
  "sound": "default", "priority": "high", "channelId": "messages",
  "threadId": "<thread_id>",
  "data": { "url": "/messages/<thread_id>" ou "/inbox/<thread_id>",
            "thread_id": "...", "message_id": "...", "business_context": "sales|customer_service|null" } }
```

Não há `badge`, não há `_contentAvailable`, não há `collapseId`.

**2. Push silencioso**
Sim, o caminho suporta: a API da Expo aceita `_contentAvailable: true` e mensagens sem
`title`/`body`. Hoje o código sempre preenche `title`/`body`, e a fila exige isso
(`push_delivery_jobs.title` e `body` são `NOT NULL`) — é o único ajuste necessário.

**3. Tokens**
Tabela `public.user_push_tokens` (`id`, `user_id` = id interno de `public.users`,
`expo_push_token`, `platform`, `is_active`, `last_seen_at`, `created_at`, `updated_at`), único por
`(user_id, expo_push_token)`. Listar todos os aparelhos ativos de um usuário é direto
(`user_id = X and is_active`). **Não existe hoje** como saber de qual aparelho veio uma ação: a
gravação de leitura não registra origem. Precisa ser adicionado.

**4. Leitura no web**
Mesma tabela que o app: `message_thread_reads (thread_id, user_id, last_read_at)`, chave
`(thread_id, user_id)`, gravada por `upsert` direto do cliente ao abrir a conversa —
`src/pages/messages/MessagesList.tsx` (Comercial no desktop) e
`src/components/mobile/MobileMessagesList.tsx` (versão mobile do site). **Não há trigger nenhuma**
nessa tabela hoje. Observação relevante: a tela **Atendimento (/inbox) não grava leitura** — ela
não usa `message_thread_reads`; então, sem mudança, ler no Atendimento pelo web não apagaria nada.

**5. Gatilho atual de push**
Somente **mensagem recebida**: trigger `new_message_notification` → `notify_new_message()`, quando
`direction='inbound'`, não apagada, não é nota interna e a conversa tem `assigned_user_id`.
Destinatário = responsável da conversa. Atribuição **não** gera push. Logo, só existe uma
notificação a apagar: "mensagem nova daquela conversa".

**6. Badge**
O servidor **não** controla badge hoje (nenhum campo `badge` no payload). Se quisermos badge
correto, ele passa a ser calculado no servidor e enviado nos dois tipos de push.

## Proposta

Evento único de leitura no servidor, enviado como push silencioso, com disparo condicional.

1. **Gravação de leitura passa por RPC** `rpc_mark_thread_read(p_thread_id, p_source, p_device_token)`:
   resolve o usuário por `current_user_id()`, faz o upsert e devolve se a leitura realmente zerou
   não lidas. `p_source` = `'web'` ou `'mobile'`; `p_device_token` identifica o aparelho de origem
   (o app manda o próprio token) para **não** avisar quem já leu. O upsert direto continua
   funcionando (compatibilidade com o app publicado), e a trigger cobre esse caminho também.
2. **Disparo condicional**: a trigger em `message_thread_reads` (INSERT/UPDATE) só enfileira
   quando existe mensagem **inbound** na conversa com `created_at > last_read_at anterior` e
   nenhuma restante depois do novo `last_read_at` — ou seja, só quando a leitura de fato zerou a
   conversa. Reabrir conversa já lida não gera nada.
3. **Janela mínima por usuário**: se já houver um `read_sync` pendente para o mesmo usuário nos
   últimos 20s, o job existente é **atualizado** (acumula os `thread_id`) em vez de criar outro.
   Um usuário varrendo 30 conversas gera ~1 push silencioso, não 30.
4. **Fila reaproveitada**: `push_delivery_jobs` ganha `kind` (`'message'` default | `'read_sync'`),
   `payload jsonb` (lista de threads lidas), `exclude_push_token` e `title`/`body` passam a aceitar
   nulo. Nada do fluxo de mensagem muda.
5. **`push-dispatch`** ganha o ramo `read_sync`: envia data-only para os tokens ativos do usuário,
   exceto o de origem — `_contentAvailable: true`, `priority: 'high'`, sem `title`/`body`/`sound`,
   `data: { type: 'thread_read', thread_ids: [...], badge: <n> }`.
6. **Badge no servidor**: contagem de conversas com mensagem inbound posterior ao `last_read_at` do
   usuário, enviada como `badge` tanto no push de mensagem nova quanto no `read_sync`.
7. **Atendimento passa a gravar leitura** também (mesma RPC), senão ler no /inbox não apaga nada.
8. Documentação: `docs/modules/messages/README.md`, `docs/modules/inbox/README.md`,
   `docs/operations/README.md`.

### Caminho inverso (ler no celular fechar aviso do navegador)
Viável e **barato, sem push**: o web não tem push de navegador hoje, o aviso é sino + toast
(`src/components/Notifications.tsx`, realtime na tabela `notifications`). Basta o web assinar
realtime de `message_thread_reads` do próprio usuário e, ao receber a leitura, marcar como lida a
notificação daquela conversa e zerar o não lido na lista. O mesmo evento serve para os dois lados —
o push silencioso é só o transporte para o celular. Fica fora deste escopo, mas o desenho acima já
o permite sem mudanças.

## Fora de escopo
- Push de navegador (Web Push).
- Apagar notificação por atribuição (não existe push de atribuição hoje).
- Garantia de entrega no iOS: push silencioso é best-effort; a rede de segurança é o app limpar ao abrir.
