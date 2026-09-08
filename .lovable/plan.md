# Push notification de mensagem nova (app mobile)

## Regras confirmadas

- Destinatário: `message_threads.assigned_user_id`. Sem responsável, nenhum push.
- Vale para Comercial e Atendimento.
- Só mensagens recebidas (`direction = 'inbound'`, `deleted_at IS NULL`).
- O sininho/toast do web e o insert em `notifications` ficam exatamente como estão.

## Contrato para o app

Tabela `public.user_push_tokens`:

| coluna | tipo | observação |
|---|---|---|
| `id` | uuid PK | default `gen_random_uuid()` |
| `user_id` | uuid | id interno de `public.users` (não `auth.uid()`) |
| `expo_push_token` | text | token do Expo |
| `platform` | text | `'ios'` ou `'android'` |
| `is_active` | boolean | default `true`; virar `false` no logout |
| `last_seen_at` | timestamptz | default `now()` |
| `created_at` / `updated_at` | timestamptz | `updated_at` por trigger |

Único: `(user_id, expo_push_token)`.

Registro no app: **RPC** `rpc_register_push_token(p_expo_push_token text, p_platform text)` e
`rpc_deactivate_push_token(p_expo_push_token text)`. Motivo: o app não precisa descobrir o
`users.id` interno nem o `organization_id` — a RPC resolve via `current_user_id()` e faz o upsert
reativando a linha e atualizando `last_seen_at`. O insert direto continua possível (RLS permite a
própria linha), mas a RPC é o caminho recomendado.

Payload enviado:

```json
{ "title": "<nome do contato>",
  "body": "<prévia da mensagem>",
  "data": { "url": "/messages/<thread_id>", "thread_id": "...", "business_context": "sales" } }
```

`url` = `/inbox/<thread_id>` quando `business_context = 'customer_service'`;
`/messages/<thread_id>` para `sales`, `other` e nulo.

## O que será construído

1. Migração: `user_push_tokens` (GRANT `authenticated`/`service_role`, RLS por `current_user_id()`)
   e `push_delivery_jobs` (fila, apenas `service_role`), com índice `(status, next_attempt_at)`.
2. As duas RPCs de registro/desativação (`SECURITY DEFINER`, escopo do próprio usuário).
3. `notify_new_message()` via `CREATE OR REPLACE`: mantém o insert em `notifications` byte-a-byte e
   acrescenta o enfileiramento em `push_delivery_jobs` quando há `assigned_user_id`.
4. Edge function `push-dispatch`: autenticada por `x-worker-token` (segredo novo, padrão do
   `integration-worker`), claim com `FOR UPDATE SKIP LOCKED`, POST para
   `https://exp.host/--/api/v2/push/send`, título com nome do contato, corpo com prévia
   (rótulo para áudio/imagem/documento/contato), backoff exponencial com limite de tentativas,
   erro persistido no job e `is_active = false` quando a Expo devolve `DeviceNotRegistered`.
5. Cron `pg_cron` a cada 30s chamando a function (mesmo padrão dos workers atuais).
6. Documentação: `docs/modules/messages/README.md`, `docs/modules/inbox/README.md` e
   `docs/operations/README.md` (novo cron).

## Fora de escopo

- Push no navegador (web) e som/badge no web.
- Notificação para supervisores ou não atribuídos.
- Supressão quando a conversa já está aberta na tela.
