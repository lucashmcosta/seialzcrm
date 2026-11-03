# Chat do Portal do Cliente — lado Seialz

O app de clientes guarda as conversas e expõe `portal-staff`. Aqui construímos: (1) o recebimento do aviso e (2) a tela da equipe. Nada é copiado para `message_threads`/`messages` (Inbox e Comercial intocados).

## 1. Aviso — Edge `client-portal-chat-notify`
- `verify_jwt = false`; HMAC igual ao otp-send (`x-portal-timestamp`, `x-portal-signature: sha256=<hex>` de `"{timestamp}.{corpo}"`, janela 5 min, tempo constante) com `CLIENT_PORTAL_HMAC_SECRET`. OPTIONS → 405. Erros `{ code }`.
- `organizationId` ≠ `CLIENT_PORTAL_ORGANIZATION_ID` → 403.
- Corpo: `{ organizationId, conversationId, seialzContactId, event: "message.created"|"conversation.updated", lastMessageAt, lastFrom: "client"|"staff", unreadForStaff }` — sem texto.
- Upsert por `conversationId` em `client_portal_chat_events` (último estado). Ignora aviso mais antigo que o guardado.
- Notificação só se `event = message.created` e `lastFrom = client`: responsável da conversa (estado mais recente conhecido via `conversation.assign` feito pela tela) ou, sem responsável, todos com permissão de Atendimento ativa na Central. Texto fixo "Nova mensagem no App do cliente".

## 2. Proxy — Edge `client-portal-staff-proxy`
- JWT obrigatório; valida usuário, membership ativa na Central e permissão de Atendimento (RBAC V2).
- Permite exatamente: `conversations.list`, `messages.list`, `messages.send`, `attachment.prepare`, `conversation.read`, `conversation.resolve`, `conversation.reopen`, `conversation.assign`. Qualquer outra → 400.
- `organizationId` e `staff { userId, displayName }` vêm da sessão; o navegador não os envia. Em `conversation.assign`, assignee só pode ser o próprio usuário ou `null`.
- Assina e faz POST em `CLIENT_PORTAL_STAFF_URL`; repassa `{ code }` de erro.

## 3. Tela — `/inbox/portal` (Atendimento, desktop)
- Lista (abertas/resolvidas, paginação por cursor) com nome/telefone do contato via `seialzContactId`, prévia, não lidas, responsável.
- Conversa: histórico paginado (`before`), anexos abrindo pela URL assinada, campo de texto e clipe (jpeg/png/pdf ≤ 10 MB: `attachment.prepare` → PUT → `messages.send`), `clientMessageId` para não duplicar.
- Ao abrir: `conversation.read`. Botões Resolver, Reabrir, "Atribuir a mim".
- Aviso fixo: "Esta conversa é pelo App: a resposta chega no aplicativo do cliente, não pelo WhatsApp."
- Atualização a cada 30 s + Realtime de `client_portal_chat_events`.
- Atrás da flag `client_portal_chat`, ligada só na Central. Mobile [TODO].

## Detalhes técnicos
- Migration: `client_portal_chat_events` (conversation_id PK, organization_id, seialz_contact_id, last_event, last_message_at, last_from, unread_for_staff, assigned_user_id, timestamps) — CREATE → GRANT service_role + SELECT authenticated restrito por RLS (org da Central e permissão de Atendimento) → RLS; FKs ON DELETE CASCADE; publicação Realtime.
- Secret novo: `CLIENT_PORTAL_STAFF_URL = https://fhntazbluzzbmvcwraox.supabase.co/functions/v1/portal-staff`. Nenhum segredo HMAC novo.
- `logic.ts` + testes Deno em cada função (assinatura, validação, lista de operações, regra de destinatário); teste do gate de permissão da tela.
- Docs em `docs/modules/` (Inbox) + ADR "chat do portal fora de message_threads".

## Verificação
- Aviso: assinatura errada/vencida → 401; outra org → 403; formato inválido → 400.
- Proxy: sem JWT → 401; operação fora da lista → 400.
- Com João Teste e `staff-reply.ts`: aviso chega, tela mostra, resposta chega no app, reenvio não duplica.
- Entrega final: URL da `client-portal-chat-notify`.
