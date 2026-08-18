# Preview da última mensagem — padrão WhatsApp (checks + ícones)

Somente UI/leitura. Nada de envio, thread, roteamento, backend ou banco.

## Auditoria

**Campos de status em `messages`**: existe apenas `whatsapp_status` (texto) + `error_code`, `error_message`, `whatsapp_message_sid`, `sent_at`. Não há coluna separada de "provider status". Valores reais observados nos últimos 30 dias (outbound, agrupado por provider do endpoint):

| Provider | sending | sent | delivered | read | failed |
|---|---|---|---|---|---|
| meta_cloud_api | 3 | 1.939 | 5.450 | 30.776 | 112 |
| evolution_api | 0 | 2.083 | 0 | 0 | 27 |
| twilio | — | — | — | — | — (nenhum outbound no período) |

Respostas objetivas:

- META_DELIVERY_STATUS_AVAILABLE=YES
- META_READ_STATUS_AVAILABLE=YES
- EVOLUTION_DELIVERY_STATUS_AVAILABLE=NO (nenhuma linha `delivered`; hoje o webhook Evolution só grava `sent`/`failed`)
- EVOLUTION_READ_STATUS_AVAILABLE=NO
- TWILIO_DELIVERY_STATUS_AVAILABLE=YES pelo contrato do webhook, porém SEM_DADOS no período auditado
- TWILIO_READ_STATUS_AVAILABLE=YES apenas para WhatsApp com read receipts, SEM_DADOS no período

Consequência: nenhum mapeamento por provider é necessário e nenhum check azul é inventado — o ícone deriva **só** do `whatsapp_status` real gravado. Evolution simplesmente para em ✓ porque é o que o dado diz.

**Realtime**: `useMessageThreads` escuta apenas `message_threads` (INSERT/UPDATE). Uma mudança de status é um UPDATE em `messages`, que dispara o slow path de `fn_update_thread_last_message` e faz `UPDATE message_threads ... updated_at = now()` — ou seja, o evento de thread **já chega** ao frontend hoje. O que falta é o hook de preview refazer a consulta: sua chave é só `last_message_id`, que não muda. Correção mínima: incluir `updated_at` da thread na chave.

**Duração de áudio**: PARCIAL e não barata. Não existe coluna de duração; para Evolution o valor aparece aninhado em `metadata.evolution.raw.audioMessage.seconds`, e para Meta não há garantia do mesmo caminho. Buscar `metadata` (jsonb grande, com base64 embutido) em lote seria caro. Portanto: exibir `[microfone] Áudio`, sem duração.

**"Você:"**: hoje é adicionado em `src/lib/messagePreview.ts` quando `sender_user_id` = usuário atual. Com o check antes do texto a autoria fica evidente (inbound nunca tem check), então remover não cria ambiguidade.

**Ícones**: projeto usa Phosphor (`@phosphor-icons/react`, peso `light` padrão). Já em uso: `Check`, `Checks`, `WarningCircle` (em `MessageStatusIndicator`). Para mídia: `Microphone`, `Image`, `VideoCamera`, `FileText`, `Sticker`.

## Implementação mínima

1. `src/hooks/messages/useThreadLastMessagePreviews.ts`
   - adicionar `whatsapp_status` e `error_code` ao `select` já existente (mesma query em lote, nada por thread);
   - incluir `updated_at` da thread na chave do efeito, para o status atualizar via realtime já existente.
2. `src/lib/messagePreview.ts`
   - deixar de retornar string pronta: retornar `{ kind: 'text' | 'audio' | 'image' | 'video' | 'document' | 'sticker', text: string | null }`;
   - remover o prefixo `Você:`;
   - manter o reconhecimento dos marcadores legados `[Áudio]`, `[Imagem]`, etc. quando `media_type` é nulo.
3. Novo `src/components/messages/LastMessagePreview.tsx` (apresentacional)
   - status à esquerda, só quando `direction = 'outbound'`: `sending` → `Clock`; `sent` → `Check` cinza; `delivered` → `Checks` cinza; `read` → `Checks` azul (`text-sky-400`, mesmo tom já usado no chat); `failed` → `WarningCircle` destructive. Qualquer outro valor/nulo → nenhum ícone;
   - inbound → nenhum ícone;
   - ícone de mídia (Phosphor, `weight="light"`, `h-3.5 w-3.5`, `currentColor`) + rótulo `Áudio` / `Foto` / `Vídeo` / `Documento` / `Figurinha`;
   - uma linha só: `flex items-center gap-1 text-xs text-muted-foreground truncate whitespace-nowrap`, sem alterar a altura do item.
4. `src/pages/messages/MessagesList.tsx`
   - `ChatListItem` passa a receber o objeto de preview em vez da string e renderiza `<LastMessagePreview />` no mesmo lugar da linha atual. Ordenação, horário à direita e linha de meta intactos.

## Validação

Typecheck + conferência visual na lista: outbound sent/delivered/read/failed, inbound texto, áudio, imagem, documento, figurinha, texto longo (truncate) e transição de status sem reload.
