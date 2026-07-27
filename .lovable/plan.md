## Diagnóstico atual

- **Módulos afetados:** Inbox (`/inbox`) e o player compartilhado de áudio usado também em Messages, contatos e mobile.
- **Documentação consultada:** `docs/README.md`, `docs/STATUS.md`, `docs/modules/inbox/README.md`, `docs/modules/messages/README.md`, `docs/product/channel-boundaries.md`, `docs/decisions/0009-inbox-messages-separation.md`, `docs/operations/conflicts.md`, documentação Twilio/Evolution.
- **ADR aplicável:** ADR-0009, porque Inbox e Messages compartilham `messages/message_threads`, mas não podem ter regras de negócio fundidas.
- **Banco/RLS/schema:** não precisa migration, não precisa alterar RLS, não precisa mexer em schema.
- **Edge Functions/integrações:** não parece ser falha de envio nem webhook; o warning nasce no frontend. Só revisaria `twilio-media-proxy` se a validação mostrar URLs Twilio expirando.

## O que encontrei

O evento **não é erro de envio de WhatsApp**. Ele é gerado manualmente pelo frontend em `AudioMessagePlayer`, via `Sentry.captureMessage('Audio playback failed')`, quando o `<audio>` dispara erro ou quando `audio.play()` rejeita. No `/inbox`, o player é renderizado por `InboxConversationTimeline` para mensagens com `media_type='audio'`.

A evidência mais forte é temporal: ao abrir uma conversa, o `<audio preload="metadata">` tenta carregar metadados automaticamente. Se falhar, o componente faz 3 retries com delays de 2s, 5s e 10s e só depois manda o warning. No evento que você mandou, a conversa carregou por volta de `17:39:26` e o warning apareceu em `17:39:46`, exatamente compatível com esse ciclo de retry. Ou seja: hoje o Sentry pode receber “Audio playback failed” mesmo quando o usuário nem tentou reproduzir o áudio.

No banco, para a org `40ae...`, há **35k+ mensagens de áudio em 90 dias**, quase todas em Storage público `whatsapp-media` com `.ogg`; os objetos conferidos existem e não estão com tamanho zero. Na thread citada no breadcrumb (`d2fc9a23...`) os áudios são `.ogg` válidos em Storage com `audio/ogg`. Portanto a hipótese principal não é “arquivo sumiu”, e sim uma mistura de: preload automático gerando warning em massa, incompatibilidade/instabilidade de codec em alguns browsers, e falta de deduplicação/sampling por mensagem.

## Plano de correção

1. **Separar falha de carregamento de falha de reprodução**
   - `loadedmetadata/error` não deve mais reportar como `Audio playback failed`.
   - Erro automático de metadata deve virar estado local do player, com retry manual/baixar áudio, mas sem bombardear Sentry.
   - `Audio playback failed` fica reservado para clique real no play.

2. **Evitar preload agressivo em listas/conversas**
   - Alterar o player para não depender de `preload="metadata"` para habilitar o botão.
   - Carregar/reproduzir sob demanda quando o usuário clicar.
   - Isso reduz eventos em massa ao abrir threads com muitos áudios.

3. **Deduplicar telemetria por áudio e sessão**
   - Reportar no máximo uma vez por `messageId + src + error_code` na sessão atual.
   - Adicionar `fingerprint`/tags no Sentry para agrupar por causa, não por cada clique/thread.
   - Manter dados úteis: `message_id`, `thread_id`, `media_type`, host, extensão, `readyState`, `networkState`, `MediaError.code`, `canPlayType`.

4. **Melhorar compatibilidade de tipos**
   - Incluir diagnóstico para `audio/webm`, `audio/amr` e `audio/aac`, além de ogg/mp3/mp4/wav.
   - Ajustar detecção visual para aceitar URLs `.webm` e `.amr` quando vierem como áudio.

5. **Validar no fluxo real do Inbox**
   - Abrir `/inbox`, selecionar uma thread com áudios, confirmar que abrir a conversa não dispara warning.
   - Clicar em áudio válido e confirmar reprodução.
   - Simular URL inválida e confirmar fallback visual sem spam no Sentry.
   - Conferir que Messages/contatos/mobile continuam usando o player sem regressão.