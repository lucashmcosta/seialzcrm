# Auditoria — progresso visual do player de áudio (/commercial)

## Respostas diretas

```
AUDIO_COMPONENT=src/components/whatsapp/AudioMessagePlayer.tsx (usado em /commercial via src/pages/messages/MessagesList.tsx:2601)
PLAYBACK_ENGINE=<audio> nativo (sem lib, sem WebAudio); src = getProxiedMediaUrl(...), preload="none"
CURRENT_TIME_SOURCE=state React `currentTime`, alimentado APENAS pelo laço requestAnimationFrame `startProgress()` (AudioMessagePlayer.tsx:144-153), iniciado em togglePlay depois de `await audio.play()`
TIMEUPDATE_LISTENER=NO (listeners existentes: loadedmetadata, canplay, ended, pause, error)
REQUEST_ANIMATION_FRAME=YES (cancelado em pause manual, ended, troca de src e unmount)
PROGRESS_STATE=state React: `progress = currentTime / duration` (duration só é gravado quando `Number.isFinite(audio.duration)`), aplicado em CSS inline (`left: progress*100%` na bolinha, `opacity` das 45 barras)
```

## Diagnóstico

Medi o laço de rAF isolado (mesma ordem de chamadas do componente, ogg/opus real, Chromium headless): ~60 ticks/s, `currentTime` avançando e `duration` finita — ou seja, **o laço em si funciona**. Logo a falha está no cálculo do progresso, não na existência do rAF.

Causa provável (H1, a que explica exatamente o sintoma descrito): para o áudio servido pelo WhatsApp/proxy, `audio.duration` fica **não-finita (Infinity)** enquanto o arquivo não está totalmente bufferizado. Nesse caso:
- `duration` permanece `0` (o guard `Number.isFinite` nunca grava), então `progress = 0` → bolinha e barras **congeladas em 0** apesar de `currentTime` estar correto;
- ao pausar/seekar, o elemento termina de resolver a mídia e dispara `canplay`/`durationchange`; `onLoaded` grava a duração finita, o componente re-renderiza e a bolinha **salta para o ponto certo**;
- ao dar play de novo o `currentTime` volta a subir, mas se `duration` ainda oscilar para não-finita o congelamento repete.

Hipótese secundária (H2): o laço de rAF é cancelado durante a reprodução (cleanup do efeito de listeners ou do efeito `[src]`) sem nada retomar a atualização, já que não existe `timeupdate`. H1 e H2 têm o mesmo remédio, então a implementação cobre as duas — e o passo 1 confirma qual ocorre, com log temporário no preview.

Nenhuma das duas hipóteses envolve upload/download, storage, envio, mensagens, backend, waveform, velocidade, duração exibida ou layout.

```
ROOT_CAUSE=Posição visual depende de `currentTime/duration` com `duration` gravada só quando finita; com duration não-finita (streaming opus sem duração conhecida) o progresso fica 0 durante o playback e só corrige quando canplay/durationchange re-renderiza no pause/seek. Agravante: não há listener `timeupdate`, então o único atualizador contínuo é o rAF, sem rede de segurança se ele for cancelado.
MINIMAL_FIX=(1) manter o rAF, mas rodá-lo enquanto `!audio.paused` e (re)iniciá-lo também no evento `play`/`playing`, cancelando em pause/ended/unmount; (2) adicionar listener `timeupdate` (e `durationchange`) como fonte redundante do `currentTime`; (3) calcular o progresso com um denominador tolerante: `duration` finita, senão `audio.seekable.end(0)` / `audio.buffered.end(n)`, sem alterar o rótulo de duração exibido.
```

## Implementação proposta (somente sincronização visual)

Arquivo único: `src/components/whatsapp/AudioMessagePlayer.tsx`

1. Confirmação (1 rodada, log temporário no console do preview): logar `audio.duration`, `currentTime` e contagem de ticks durante o playback em /commercial para fixar H1 vs H2. Log removido no mesmo passo seguinte.
2. `timeupdate` → `setCurrentTime(audio.currentTime)`; `durationchange` → grava duração quando finita. Ambos no efeito de listeners já existente (mesmas deps, mesmo cleanup).
3. `play`/`playing` → chama `startProgress(audio)`; `pause`/`ended` → `cancelAnimationFrame`. Assim o laço sempre existe enquanto o áudio toca, mesmo que um cleanup o tenha cancelado.
4. Denominador do progresso: novo valor derivado `progressDuration = duration finita ?? seekable.end(0) ?? buffered.end(last) ?? 0`, usado só em `progress`. O texto de duração/tempo (`formatTime`) e o botão 1x/1.5x/2x ficam exatamente como estão.
5. `handleSeek` passa a usar o mesmo `progressDuration` para não travar o seek quando `duration` não é finita.

Sem mudanças em: props/contrato do componente, `reportAudioFailure`, estados de erro/retry, markup, estilos, tamanhos, waveform (45 barras aleatórias mantidas), envio, storage, backend.

## Validação após implementar

- Play em áudio inbound e outbound em /commercial: bolinha e barras avançam continuamente (sem esperar pause).
- Pause: bolinha para no mesmo ponto, sem salto.
- Play novamente: retoma do ponto, continua animando.
- Seek clicando na waveform: posição muda e continua acompanhando.
- 1x / 1.5x / 2x: progresso acompanha na velocidade correta.
- Rótulo de tempo/duração e altura/layout da bolha idênticos ao atual.
- Áudio com URL inválida continua no estado "Não foi possível carregar este áudio".
- Sem novos erros de console; build OK.
