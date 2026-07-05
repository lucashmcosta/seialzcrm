# Módulo: Messages (Comercial / Pré-venda)

Superfície de conversas da **equipe comercial**: qualificação de leads, follow-up, negociação e avanço de pipeline até a conversão em cliente. **Não confundir com o Inbox** (atendimento/pós-venda) — a separação é decisão de negócio, ver [`product/channel-boundaries.md`](../../product/channel-boundaries.md).

## Rotas
- **`/messages`** — MessagesList (layout de viewport fixo).
- Threads comerciais têm `message_threads.business_context = 'sales'` e falam por endpoints com `purpose ∈ {commercial, vendor_personal}` (`src/lib/endpointPurpose.ts`).

## Comportamentos
- Ingestão inbound via `meta-whatsapp-webhook` / `twilio-whatsapp-webhook` — coexistem caminho legado (grava direto) e novo (fila `integration_inbound_events` → `integration-inbound-dispatcher`, [ADR-0004](../../decisions/0004-inbound-events-queue.md)).
- Envio via `dispatchWhatsAppSend` (`src/lib/dispatchWhatsAppSend.ts`) escolhendo provider/endpoint ativo, com re-rota "sales → endpoint comercial" (ver channel-boundaries).
- Formatação de saída: máx 2 quebras consecutivas, sem espaços à esquerda.
- Renderização: markdown + spacing próprio.
- Janela 24h WhatsApp recalculada por `last_inbound_at` (`src/lib/serviceWindow.ts`, hook `useServiceWindow`).
- Áudio: player compacto (43px) + transcrição via `transcribe-audio`.
- Notas internas inline na thread (`messages.direction = 'internal'`).
- Denormalização: `message_threads.last_message_*` via trigger `trg_update_thread_last_message`.
- Unread tracking por usuário via `message_thread_reads`.
- Mobile: fullscreen + polling fallback quando realtime falha.
- Snippets internos (respostas rápidas fora do fluxo de templates Meta): plano em [`plans/2026-07-snippets-internos.md`](../../plans/2026-07-snippets-internos.md), tabela `message_snippets`.

## Hooks
`useMessageThreads`, `useThreadBusinessContext`, `useThreadEndpointMap`, `useServiceWindow`, `useSnippets`.
