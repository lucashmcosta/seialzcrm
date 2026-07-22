# Módulo: Messages (Comercial / Pré-venda)

Superfície de conversas da **equipe comercial**: qualificação de leads, follow-up, negociação e avanço de pipeline até a conversão em cliente. **Não confundir com o Inbox** (atendimento/pós-venda) — a separação é decisão de negócio, ver [`product/channel-boundaries.md`](../../product/channel-boundaries.md).

## Rotas
- **`/messages`** — MessagesList (layout de viewport fixo).
- Threads comerciais têm `message_threads.business_context = 'sales'` e falam por endpoints com `purpose ∈ {commercial, vendor_personal}` (`src/lib/endpointPurpose.ts`).

## Comportamentos
- Ingestão inbound via `meta-whatsapp-webhook` / `twilio-whatsapp-webhook` — coexistem caminho legado (grava direto) e novo (fila `integration_inbound_events` → `integration-inbound-dispatcher`, [ADR-0004](../../decisions/0004-inbound-events-queue.md)).
- Envio via `dispatchWhatsAppSend` (`src/lib/dispatchWhatsAppSend.ts`) resolvendo o endpoint pela **linha ativa** (`messaging_lines.active_endpoint_id` do `purpose` derivado do `business_context` da thread). As send functions (`meta-whatsapp-send`, `twilio-whatsapp-send`, `evolution-whatsapp-send`) honram o `endpointId` explícito enviado pelo dispatcher após validar org/provider/`is_active`; fallback ao `thread.primary_endpoint_id` só quando nenhum endpoint explícito vier no payload. Ver [`plans/2026-07-endpoint-lines-rotation.md`](../../plans/2026-07-endpoint-lines-rotation.md).
- Thread guarda **histórico** (`primary_endpoint_id` = origem); a **linha ativa** define o número de envio. Trocar a linha ativa comercial (ex.: Meta 2890 → Evolution 8439) faz toda a superfície comercial passar a enviar pelo novo número sem migrar threads.
- Formatação de saída: máx 2 quebras consecutivas, sem espaços à esquerda.
- Renderização: markdown + spacing próprio.
- Janela 24h WhatsApp recalculada por `last_inbound_at` (`src/lib/serviceWindow.ts`, hook `useServiceWindow`). O gate "digitar livre fora da janela" no composer lê `communication_endpoints.requires_template_outside_window` do endpoint efetivo resolvido pela linha ativa (default `true`; `false` para Evolution). Não há mais hardcode por provider nem botão de migração manual — trocar `active_endpoint_id` da linha basta.
- Áudio: player compacto (43px) + transcrição via `transcribe-audio`.
- Notas internas inline na thread (`messages.direction = 'internal'`).
- Denormalização: `message_threads.last_message_*` via trigger `trg_update_thread_last_message`.
- Unread tracking por usuário via `message_thread_reads`.
- Mobile: fullscreen + polling fallback quando realtime falha.
- Snippets internos (respostas rápidas fora do fluxo de templates Meta): plano em [`plans/2026-07-snippets-internos.md`](../../plans/2026-07-snippets-internos.md), tabela `message_snippets`.

## Hooks
`useMessageThreads`, `useThreadBusinessContext`, `useThreadEndpointMap`, `useServiceWindow`, `useSnippets`.
