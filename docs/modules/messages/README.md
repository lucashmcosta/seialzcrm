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

## Push mobile (mensagem nova)
- Trigger `new_message_notification` → `notify_new_message()` mantém o insert em `notifications` (sininho/toast web, destinatário = `contacts.owner_user_id`) **e** enfileira `push_delivery_jobs` quando a thread tem `assigned_user_id`. Sem responsável, nenhum push.
- Worker: edge fn `push-dispatch` (cron 30s) consome a fila com `rpc_claim_push_delivery_jobs`, envia ao Expo (`https://exp.host/--/api/v2/push/send`), aplica backoff (5 tentativas → `dead_letter`) e desativa token em `DeviceNotRegistered`. Autenticação server-to-server por header `x-worker-token`, comparado ao segredo do vault `push_dispatch_worker_token` via `fn_get_push_dispatch_token()` (grant só para `service_role`) — o cron envia o mesmo valor lido do vault. ⚠️ Não usar `Authorization: Bearer service_role_key`: o valor guardado no vault difere do env da function e resultava em 401 silencioso (incidente 2026-09-08).
- Tokens de aparelho: `user_push_tokens` (RLS por `current_user_id()`); app registra/desativa via `rpc_register_push_token(p_expo_push_token, p_platform)` e `rpc_deactivate_push_token(p_expo_push_token)`.
- `data.url` = `/messages/<thread_id>` (`sales`, `other`, nulo) ou `/inbox/<thread_id>` (`customer_service`).

## Sincronização de leitura (push silencioso `read_sync`)
- Objetivo: ler a conversa no web apaga a notificação já entregue no celular. Servidor não apaga nada — manda um push **data-only** e o app apaga.
- Capacidade por aparelho: `user_push_tokens.app_version` + `supports_read_sync` (default `false`). A build publicada (iOS 26 / Android 10) **não** trata push de dados nem limpa badge, então só recebe push de mensagem. Registro novo: `rpc_register_push_token_v2(p_expo_push_token, p_platform, p_app_version, p_supports_read_sync)` — a `rpc_register_push_token(text, text)` fica **intocada** (nunca criar sobrecarga: PGRST203 derrubaria o registro de push de todo mundo).
- Gravação de leitura: `rpc_mark_thread_read(p_thread_id, p_source, p_device_token)` (SECURITY DEFINER, valida membro ativo). Front usa `src/lib/markThreadReadRemote.ts`, com fallback para o upsert direto. Telas que gravam: Comercial desktop (`MessagesList.tsx`), mobile do site (`MobileMessagesList.tsx`) e **Atendimento** (`InboxPage.tsx`, `MobileInbox.tsx` — antes não gravava).
- Enfileiramento: trigger `trg_enqueue_read_sync_push` → `fn_enqueue_read_sync_push()` em `message_thread_reads`. Corpo inteiro protegido por `EXCEPTION WHEN OTHERS THEN RETURN NEW` — a trigger roda em toda abertura de conversa e **jamais** pode derrubar o upsert. Dispara só quando a leitura realmente zerou não lidas; acumula `thread_id` em job `status = 'pending'` dentro de 20s (nunca em job reivindicado).
- Fila: `push_delivery_jobs.kind` (`message` | `read_sync`), `payload.thread_ids`, `exclude_push_token`; `title`/`body`/`target_url`/`thread_id`/`message_id` aceitam nulo.
- Dispatcher: ramo `read_sync` envia `{ _contentAvailable: true, priority: 'high', data: { type: 'thread_read', thread_ids, badge } }` só para tokens `supports_read_sync = true`, exceto o de origem. Sem token com suporte → `skipped`, **sem contar tentativa nem erro** (nada em `dead_letter`).
- Badge: `fn_push_unread_thread_count(user_id)`, enviado apenas a tokens com suporte, nos dois tipos de push.
- Rollout: servidor primeiro (efeito zero, nenhum token declara suporte) → nova versão do app → recurso passa a valer nos aparelhos atualizados.
- iOS: push silencioso é best-effort; rede de segurança é o app limpar as notificações lidas ao abrir.
