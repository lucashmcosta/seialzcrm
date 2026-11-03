# ADR-0012 — Chat do App do cliente fora de message_threads

Status: aceito (2026-11-03). Piloto: Central Trabalhista (flag `client_portal_chat`).

## Decisão
- As mensagens do chat do App ficam no projeto do App. O Seialz não copia mensagens para `message_threads`/`messages`.
- `client-portal-chat-notify` (HMAC, `CLIENT_PORTAL_HMAC_SECRET`) recebe avisos sem texto e faz upsert do último estado em `client_portal_chat_events` (uma linha por conversa). Avisos mais antigos são ignorados.
- Notificação só para `message.created` + `lastFrom=client`: responsável conhecido, senão todos com `dados.atendimentos.ver` ≠ nenhum. Texto fixo "Nova mensagem no App do cliente".
- `client-portal-staff-proxy` (JWT + membership ativa + RBAC V2) é o único caminho para `portal-staff`; só 8 operações; leitura exige `ver`, ações exigem `editar`; "atribuir" só ao próprio usuário ou remover.
- Tela `/inbox/portal` (desktop). Mobile: [TODO].

## Por quê
Inbox (WhatsApp) e chat do App têm provedores e regras diferentes; o segredo HMAC não pode ir ao navegador.
