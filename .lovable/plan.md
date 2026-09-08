# Push notification de mensagem nova (app mobile)

## Situação atual (verificada)

- O web não tem push do navegador nem som. Existe apenas o sininho (`src/components/Notifications.tsx`) lendo a tabela `notifications` em tempo real, com aviso na tela enquanto o sistema está aberto.
- O disparo é um gatilho no banco: `new_message_notification` → `notify_new_message()`, em `AFTER INSERT ON messages` quando `deleted_at IS NULL`. Ele grava em `notifications` só para mensagens `inbound` e só para o **responsável pelo contato** (`contacts.owner_user_id`) — hoje ignora `message_threads.assigned_user_id`.
- Não existe nenhuma tabela de token de dispositivo/inscrição de push: greenfield.
- Mensagem recebida já dispara vários gatilhos (última mensagem da conversa, reabertura, tempo de resposta, eventos de integração). O push pode se encaixar no mesmo ponto de notificação, sem criar caminho paralelo.

## Decisões assumidas (padrões, ajustáveis)

- Destinatário: responsável da conversa (`assigned_user_id`); se não houver, responsável do contato; se não houver nenhum, ninguém recebe push (fica só no sininho).
- Vale para os dois módulos (Comercial e Atendimento), diferenciados por `message_threads.business_context`, com o mesmo comportamento.
- Envio via Expo Push (sem exigir credenciais Firebase/Apple). O plano isola o envio para permitir trocar o provedor depois.
- Uma notificação por conversa (agrupada por `thread_id`), substituindo a anterior não lida.

## O que será construído

1. **Guardar dispositivos**: nova tabela `user_push_tokens` (organização, usuário, token, plataforma, ativo, últimos acessos), com permissões e políticas de acesso para o próprio usuário. O app registra/atualiza o token ao entrar e remove ao sair.
2. **Ajustar a regra de destinatário**: `notify_new_message()` passa a priorizar `assigned_user_id` da conversa e usar o responsável do contato como reserva. Nada muda no sininho do web além de o aviso chegar à pessoa certa.
3. **Enfileirar o push**: o gatilho grava a intenção de envio numa fila leve (`push_delivery_jobs`) em vez de chamar serviço externo dentro da transação.
4. **Entregar**: nova função de servidor `push-dispatch` consome a fila, monta título (nome do contato) e corpo (prévia da mensagem, com rótulo para áudio/imagem/documento), envia ao Expo, marca entregue/erro e desativa tokens rejeitados.
5. **Rodar sozinho**: agendamento a cada 30s para consumir a fila, com tentativas e limite de repetição.
6. **Abrir no lugar certo**: o push carrega `thread_id` e módulo, para o app abrir a conversa correspondente.
7. **Não incomodar**: se o app informar que a conversa já está aberta na tela (registro de leitura recente em `message_thread_reads`), o envio é suprimido.

## Detalhes técnicos

- Migração: `create table public.user_push_tokens` + GRANT (`authenticated`, `service_role`) + RLS por `current_user_id()`; `create table public.push_delivery_jobs` (service_role apenas); índice em `(status, next_attempt_at)` e único em `(user_id, token)`.
- `notify_new_message()`: substituição via `CREATE OR REPLACE`, mantendo o insert em `notifications`; recipiente = `coalesce(mt.assigned_user_id, c.owner_user_id)`; só `direction = 'inbound'`; enfileira job com `organization_id`, `thread_id`, `message_id`, `recipient_user_id`, `business_context`.
- Edge function `supabase/functions/push-dispatch/index.ts`: autenticada por `x-worker-token` (segredo novo), claim de lote com `FOR UPDATE SKIP LOCKED`, POST para `https://exp.host/--/api/v2/push/send`, `collapseId`/`channelId` por `thread_id`, backoff exponencial, desativa token em `DeviceNotRegistered`.
- Cron `pg_cron` a cada 30s chamando a function (mesmo padrão do `integration-worker`).
- Documentação: atualizar `docs/modules/messages/README.md`, `docs/modules/inbox/README.md` e `docs/operations/README.md` (novo cron).
- Fora de escopo: push no navegador (web) e notificação para supervisores.
