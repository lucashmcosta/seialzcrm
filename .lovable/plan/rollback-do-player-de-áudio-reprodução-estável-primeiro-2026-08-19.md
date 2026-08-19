# Rollback do player de áudio (reprodução estável primeiro)

Objetivo único: voltar `src/components/whatsapp/AudioMessagePlayer.tsx` ao estado anterior ao fix de progresso, restaurando carregamento e reprodução estáveis. O progresso visual volta a ficar parado durante o playback — isso é aceito e será tratado depois, em alteração isolada.

Nenhum outro arquivo é tocado: sem mudanças em proxy/URL de mídia, storage, backend, `MessagesList`, envio, banco ou outros componentes.

## O que será revertido

Todas as adições do último fix, dentro do próprio arquivo:

1. Helper `readProgressDenominator` (denominador tolerante `duration → seekable → buffered`) — removido.
2. Estado `progressDuration` e seus resets — removido.
3. Listeners adicionados: `durationchange`, `progress`, `timeupdate`, `play`, `playing`, `seeked` — removidos (voltam apenas `loadedmetadata`, `canplay`, `ended`, `pause`, `error`).
4. `onPause` volta a apenas `setIsPlaying(false)` quando não terminou (sem `cancelAnimationFrame` nem sincronização de tempo).
5. Laço `startProgress` volta a ticar sem a condição de parada `audio.paused || audio.ended` e sem gravar `progressDuration`.
6. `progress` volta a `duration > 0 ? currentTime / duration : 0`.
7. `handleSeek` volta a usar `duration` direto, sem `try/catch` em `currentTime`.
8. Dependência extra `startProgress` no efeito de listeners — removida (o efeito volta a `[src, srcOk, messageId, threadId, mediaType]`).

Preservado sem alteração: `togglePlay`, `isIgnorablePlayError`, `handleManualRetry`, download, `cycleRate` (1x/1.5x/2x), waveform, layout e o elemento `<audio>`.

## Por que isso restaura a estabilidade

O fix passou a atualizar estado React em eventos de alta frequência (`timeupdate` + `progress` + rAF), multiplicando re-renderizações do componente durante o carregamento/playback e adicionando escrita em `currentTime` no seek. Removendo essas adições, o componente volta exatamente ao ciclo de vida de mídia que já reproduzia de forma estável em produção.

## Validação após o rollback

Verificação automatizada no preview (`/commercial`), com Playwright, em conversa real com áudios:

- áudio inbound: play sem mensagem de erro;
- áudio outbound: play sem mensagem de erro;
- pause e retomada;
- ciclo de velocidade 1x → 1.5x → 2x → 1x refletido em `playbackRate` do elemento;
- ausência do texto "Não foi possível carregar este áudio" em mídia válida;
- console sem erro de mídia; build e typecheck OK.

Relatório final entregue no formato pedido (`AUDIO_PLAYER_ROLLED_BACK`, `VALID_AUDIO_LOADS`, `PLAYBACK_WORKS`, `PAUSE_RESUME_WORKS`, `SPEED_CONTROL_WORKS`, `FILES_CHANGED`, `REVERTED_COMMIT_OR_DIFF` com o diff resumido).

## Fora de escopo agora

Qualquer nova tentativa de corrigir a bolinha/progresso. A causa já diagnosticada (`duration = Infinity` durante streaming) fica registrada para uma alteração isolada posterior.
