# Módulo: Mensagens (legado + Inbox v2)

Duas superfícies coexistem:
- **`/messages`** — MessagesList (legado, memory `messages/fixed-viewport-layout`).
- **`/inbox`** — Inbox v2 (memory `features/inbox-v2/status-2026-06-11`, feature-flag off até cutover).

## Comportamentos
- Ingestão inbound via `meta-whatsapp-webhook` / `twilio-whatsapp-webhook` — coexistem caminho legado (grava direto) e novo (fila `integration_inbound_events` → `integration-inbound-dispatcher`).
- Envio via `dispatchWhatsAppSend` (`src/lib/dispatchWhatsAppSend.ts`) escolhendo provider ativo.
- Formatação: máx 2 quebras consecutivas, sem espaços à esquerda (memory `formatacao-e-sanitizacao-mensagens`).
- Renderização: markdown + spacing (memory `whatsapp/ui-rendering-engine`).
- Janela 24h recalculada por `last_inbound_at` (memory `janela-comunicacao-24h-logic`).
- Áudio: player compacto 43px (memory `whatsapp-audio-player-architecture`).
- Notas internas inline em thread (memory `internal-notes-activity-integration`).
- Denormalização: `last_message_*` via trigger (memory `performance-denormalization-strategy`).
- Unread tracking por usuário via `message_thread_reads` (memory `multi-user-unread-tracking-logic`).
- Mobile: fullscreen + polling fallback (memory `features/mobile/messages-view-logic`).

## Hooks
Ver `src/hooks/inbox/*` (`useInboxThreads`, `useInboxThread`, `useInboxThreadMessages`, `useInboxQueueCounts`) e `useMessageThreads`, `useThreadBusinessContext`, `useThreadEndpointMap`.
