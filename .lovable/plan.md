
## Contexto verificado

- A timeline já renderiza um divisor visual `📞 Número alterado: XXXX → YYYY` de forma automática, comparando `endpoint_id` entre mensagens consecutivas (`src/pages/messages/MessagesList.tsx` linhas 2103–2123, via `useEndpointNumbers`).
- A Edge Function `thread-migrate-endpoint-send` insere hoje uma mensagem com `direction='internal'`, `sender_type='system'` e `metadata.kind='THREAD_PROVIDER_MIGRATED'`. Esse `kind` **não é reconhecido** pelo renderer de migração (que só trata `endpoint_migration_meta_7020` e `endpoint_provider_migration`), então ela cai no fluxo padrão de mensagem e aparece como o segundo balão redundante que o usuário reclamou.
- Após a migração, `bypassWindow` já é limpo e `composerEndpointId` é resetado. O `primary_endpoint_id` da thread passa a ser o Evolution (via `refetchThreads()`), então `composerIsEvolution` fica `true`. Porém o gate `outOfWindow = !serviceWindow.isOpen && messages.length>0 && !bypassWindow` (linha 2359) continua verdadeiro enquanto o cliente não responder, forçando novamente o botão de template + botão "digitar livre" — exatamente o comportamento que o usuário quer eliminar.

## Mudanças

### 1. Backend — `supabase/functions/thread-migrate-endpoint-send/index.ts`
- Remover o bloco que insere a nota `THREAD_PROVIDER_MIGRATED` na tabela `messages` (e o lookup idempotente associado).
- Manter todo o resto: envio primeiro, `UPDATE primary_endpoint_id` só após sucesso, validações, logs `console.log` de auditoria (`[thread-migrate-endpoint-send] migrate done { from, to, messageId }`) — esse log já é o "registro técnico" pedido.
- Retornar `noteInserted: false` fixo (ou remover o campo do payload; o wrapper client-side já tolera ausência).
- Nenhuma outra Edge Function é tocada. O divisor visual continua funcionando porque depende apenas de `endpoint_id` das mensagens reais.

### 2. Frontend — `src/pages/messages/MessagesList.tsx`
- Alterar a derivação do gate no bloco de input (linha 2359) para não considerar fora da janela quando o composer já opera via Evolution:

  ```
  const composerBypassesWindow = composerIsEvolution; // Evolution não exige janela 24h
  const outOfWindow =
    !serviceWindow.isOpen && messages.length > 0 && !bypassWindow && !composerBypassesWindow;
  ```

  Efeito: após a migração, `primary_endpoint_id` = Evolution → `composerIsEvolution=true` → `outOfWindow=false` → composer normal habilitado (MediaUpload, AudioRecorder, textarea), sem seletor de template e sem botão "Enviar pelo … e migrar conversa".

- Adicionar um aviso informativo discreto acima do input quando `composerIsEvolution && !serviceWindow.isOpen && messages.length > 0`: uma linha pequena tipo `Sem inbound recente — envio livre pelo Evolution ••••{last4}`. Reaproveita o mesmo estilo `text-[11px] text-muted-foreground` já usado no header, sem bloquear nada.

- Nenhuma mudança em `dispatchWhatsAppSend`, no path de envio nativo (Evolution já é o `primary_endpoint_id` → dispatcher envia por ele naturalmente).

## Validação

Após o deploy, com F5 na thread da Ralis já migrada:
- Não deve haver mais o balão "Conversa migrada do número Meta ••••2890 para o Evolution ••••8439…" (mensagens antigas continuam, mas nenhuma nova é criada).
- O divisor `📞 Número alterado: 2890 → 8439` permanece na timeline.
- Cabeçalho mostra o número Evolution 8439.
- Composer aparece habilitado, sem botão de template obrigatório e sem botão de migração, com o aviso "Sem inbound recente — envio livre pelo Evolution ••••8439".
- Enviar mensagem sai diretamente pelo dispatcher normal via Evolution.

## Fora de escopo

- Limpeza histórica das notas `THREAD_PROVIDER_MIGRATED` já persistidas (opcional; posso propor DELETE seletivo depois se você quiser sumir com o balão antigo da Ralis).
- Qualquer alteração em Inbox, mobile, ContactMessages ou no fluxo de outros providers.
