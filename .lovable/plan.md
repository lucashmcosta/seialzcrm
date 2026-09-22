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

Evento único de leitura no servidor, enviado como push silencioso, **somente para aparelhos que
declaram suporte**. Quem está na build publicada (iOS 26 / Android 10) não recebe nada novo: sem
badge, sem push de dados — comportamento idêntico ao de hoje.

1. **Capacidade por aparelho**: `user_push_tokens` ganha `app_version text` e
   `supports_read_sync boolean not null default false`.
   Correção aceita: `CREATE OR REPLACE` com parâmetros extras **criaria uma sobrecarga**, porque no
   Postgres a identidade é nome + tipos dos argumentos — a chamada de 2 parâmetros do app publicado
   ficaria ambígua (PGRST203) e o registro de push cairia para todos. Escolhido o **caminho (a)**:
   `rpc_register_push_token(text, text)` fica **intocada** (assinatura e grants conferidos no banco:
   `EXECUTE` para `anon`, `authenticated`, `service_role`; o app publicado grava
   `supports_read_sync = false`, que é o desejado) e criamos **`rpc_register_push_token_v2(
   p_expo_push_token text, p_platform text, p_app_version text default null,
   p_supports_read_sync boolean default false)`** para a nova versão do app. Nenhum `DROP`, nenhum
   grant a refazer, nenhum instante de ambiguidade.
   Validação obrigatória depois da migration: chamar a função antiga com exatamente
   `p_expo_push_token` + `p_platform` e confirmar que resolve sem PGRST203.
2. **Gravação de leitura passa por RPC** `rpc_mark_thread_read(p_thread_id, p_source, p_device_token)`:
   resolve o usuário por `current_user_id()`, faz o upsert e devolve se a leitura zerou não lidas.
   `p_device_token` identifica o aparelho de origem para não avisar quem já leu. O upsert direto
   continua funcionando (é o que o app publicado faz) e a trigger cobre esse caminho também.
3. **Trigger à prova de erro** em `message_thread_reads` (INSERT/UPDATE): corpo inteiro em
   `EXCEPTION WHEN OTHERS THEN RETURN NEW`, com `log` de aviso — ela roda em toda abertura de
   conversa, de todos os usuários, e **jamais** pode derrubar o upsert de leitura em produção.
   Consulta de "havia inbound depois do `last_read_at` anterior" usando índice existente de
   `messages (thread_id, created_at)` (confirmar/criar índice antes de ligar).
4. **Disparo condicional**: só enfileira quando existia mensagem inbound posterior ao
   `last_read_at` anterior e nada resta depois do novo — ou seja, só quando a leitura realmente
   zerou a conversa. Reabrir conversa já lida não gera nada.
5. **Janela mínima por usuário (20s)**: acúmulo de `thread_id` **somente em job com
   `status = 'pending'`** (`FOR UPDATE`), nunca em job já reivindicado pelo dispatcher. Se não
   houver pendente, cria um novo.
6. **Fila reaproveitada**: `push_delivery_jobs` ganha `kind` (`'message'` default | `'read_sync'`),
   `payload jsonb` (threads lidas) e `exclude_push_token`; `title`/`body` passam a aceitar nulo.
   Nada do fluxo de mensagem muda.
7. **`push-dispatch`** ganha o ramo `read_sync`: seleciona apenas tokens ativos
   **`supports_read_sync = true`**, exceto o de origem. Se sobrar zero token, o job encerra como
   `skipped` sem chamar a Expo. Payload data-only: `_contentAvailable: true`, `priority: 'high'`,
   sem `title`/`body`/`sound`, `data: { type: 'thread_read', thread_ids: [...] }`.
8. **Badge**: enviado **apenas** para tokens `supports_read_sync = true`, nos dois tipos de push.
   Para os demais, nenhum campo `badge` — evita a bolinha permanente no app publicado, que não sabe
   limpar badge.
9. **Atendimento no web passa a gravar leitura** (mesma RPC). Mudança visível: conversas lidas no
   computador passam a aparecer como lidas no celular. Avisar a equipe antes de ligar.
10. Documentação: `docs/modules/messages/README.md`, `docs/modules/inbox/README.md`,
    `docs/operations/README.md`.

### Ordem de rollout
1. Servidor completo (capacidade no token, trigger, fila, ramo `read_sync`, badge condicional).
   Nenhum token declara suporte → efeito zero em produção.
2. Nova versão do app declara a capacidade, trata o push silencioso e limpa o badge.
3. O recurso passa a valer só nos aparelhos atualizados.

### Caminho inverso (ler no celular fechar aviso do navegador)
Viável e **barato, sem push**: o web não tem push de navegador hoje, o aviso é sino + toast
(`src/components/Notifications.tsx`, realtime na tabela `notifications`). Basta o web assinar
realtime de `message_thread_reads` do próprio usuário e, ao receber a leitura, marcar como lida a
notificação daquela conversa e zerar o não lido na lista. O mesmo evento serve para os dois lados —
o push silencioso é só o transporte para o celular. Fora deste escopo, mas o desenho já permite.

## Fora de escopo
- Push de navegador (Web Push).
- Apagar notificação por atribuição (não existe push de atribuição hoje).
- Enviar badge ou push de dados para a build publicada (iOS 26 / Android 10).
- Garantia de entrega no iOS: push silencioso é best-effort; a rede de segurança é o app limpar ao abrir.
