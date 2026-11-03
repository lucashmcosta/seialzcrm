# Chat do Portal do Cliente — lado Seialz

O app de clientes (outro projeto) guarda as conversas e expõe `portal-staff` (HMAC). Aqui no Seialz construímos: (1) receber o aviso de nova mensagem e (2) a tela da equipe para ler e responder. Nenhuma mensagem do portal é copiada para `message_threads`/`messages` (Inbox e Comercial intocados).

## 1. Receber o aviso — Edge `client-portal-chat-notify`
- `verify_jwt = false`, autenticação por HMAC-SHA256 (mesmo esquema das funções `client-portal-*`: timestamp + assinatura, janela de 5 min, comparação em tempo constante). Sem CORS (OPTIONS → 405).
- Confere `organizationId` = `CLIENT_PORTAL_ORGANIZATION_ID` (Central); outro → 403.
- Payload esperado: `{ organizationId, conversationId, accountId, preview(≤140), sentAt }` [INCERTO — confirmar com o app].
- Grava em `client_portal_chat_events` (nova, só service_role) e faz broadcast Realtime privado para a tela atualizar. Idempotente por `(conversationId, messageId)`.
- Notificação para a equipe: `admin_notifications`/`notifications` dos membros com permissão de Atendimento [INCERTO — quem recebe: responsável da conversa, ou todos do Atendimento?].

## 2. Tela da equipe — `/inbox/portal` (Atendimento)
- Lista de conversas (status, responsável, última mensagem, não lidas) e painel da conversa com texto, anexos (abrir via URL assinada) e campo de resposta.
- O navegador nunca tem o segredo HMAC: chama a Edge `client-portal-staff-proxy` com JWT; ela valida usuário, membership ativa na Central e permissão de Atendimento (RBAC V2), assina e chama `portal-staff` (operações list, messages, reply, read) [INCERTO — nomes exatos das operações].
- `staff_user_id`/`staff_name` vêm do servidor, nunca do navegador. Resposta idempotente com `client_message_id`.
- Atualização por Realtime + consulta periódica (30 s) como reserva.
- Escondida atrás de feature flag `client_portal_chat`, ligada só na Central. Desktop primeiro; mobile [TODO].

## Detalhes técnicos
- Migration: `client_portal_chat_events` (CREATE → GRANT service_role → REVOKE anon/authenticated → RLS), FK ON DELETE CASCADE, CHECKs por trigger quando dependerem de tempo.
- Secrets novos: `CLIENT_PORTAL_STAFF_URL`, `CLIENT_PORTAL_STAFF_HMAC_SECRET` (mesmo valor do app; formulário seguro). Reuso de `CLIENT_PORTAL_HMAC_SECRET` só se você preferir um segredo único.
- Lógica pura (assinatura, validação, projeção) em `logic.ts` de cada função com testes Deno; teste Bun para o gate de permissão da tela.
- Docs: `docs/modules/` (Inbox) + ADR curta "chat do portal fora de message_threads".

## Verificação
- Assinatura errada/vencida → 401; outra org → 403; sem permissão na tela → bloqueado.
- Com o script `staff-reply.ts` do app e a conta João Teste: mensagem do cliente aparece na tela; resposta da tela chega no app; reenviar não duplica.

## Perguntas antes de construir
1. Formato do aviso e operações de `portal-staff` (pode colar o contrato).
2. Quem recebe a notificação de nova mensagem.
