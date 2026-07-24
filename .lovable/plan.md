
## Contexto do erro

Sentry capturou `Uncaught TypeError: Cannot read properties of undefined (reading 'close')` originado **dentro** de `opus-media-recorder/encoderWorker.umd.js`, com mecanismo `auto.browser.global_handlers.onerror` (`handled: false`). O throw acontece dentro do Web Worker do codificador Opus — não no nosso código React — e escapa direto para `window.onerror` porque nenhum handler acima do worker captura.

O timing do replay (clique em "Gravar áudio" → 1,25 s → erro) casa com o `warmEncoder()` em `src/components/whatsapp/AudioRecorder.tsx` (linhas 46-77): logo após o `getUserMedia` do clique real, disparamos um **segundo `OpusMediaRecorder` descartável** contra um `AudioContext` silencioso e chamamos `rec.stop()` num `setTimeout` fixo de **120 ms** (linha 72). Se em 120 ms o worker ainda não terminou de bootar (Worker JS parseado + WASM compilada), o `stop()` chega antes de o worker ter `encoder`/`context` prontos e ele tenta `.close()` em `undefined`.

Por que **não é** o `stopRecording()` real do usuário:
- `stopRecording()` já bloqueia stop antes de `MIN_RECORD_MS = 1000 ms` (linha 245), então na gravação real o worker sempre teve ≥1 s de boot.
- O warmup usa 120 ms fixos, independente da máquina.
- O `try/catch` externo em `warmEncoder` **não pega** throws que ocorrem dentro do worker (são assíncronos, cross-thread).

## Impacto

- **Gravação real do usuário:** o warmup é fire-and-forget, roda numa instância separada de `OpusMediaRecorder`, contra um `AudioContext` diferente do stream do microfone. Um erro do warmup **não interfere** no `mediaRecorder` real (referência distinta em `mediaRecorderRef`). O áudio do usuário continua sendo gravado e enviado. Confirmado por leitura das linhas 46-77 vs 156-238.
- **Sentry:** como `handled: false`, o alerta é escalado como crítico e polui o painel.

Portanto, esta correção é **primariamente higiene do Sentry** — não é para "consertar a gravação", que está funcionando. A meta é parar o vazamento do worker vendor sem tocar em uma linha sequer do caminho crítico da gravação real.

## Princípio de segurança do plano

Este plano é **cirúrgico** e obedece a três invariantes duras:

1. **Zero mudança no fluxo real de gravação.** Não tocamos em `startRecording`, `stopRecording`, `resetRecording`, `cancelRecording`, `handleSend`, `doSendAudio`, `doSendAsDocument`, nem em `mediaRecorderRef`, `chunksRef`, `streamRef`, `MIN_RECORD_MS`, `validateOggOpus`, `pickNativeMime`, `workerOptions`. Nada dessa cadeia entra na diff.
2. **Zero mudança no vendor.** Não patchamos `opus-media-recorder` nem tocamos em `encoderWorker.umd.js`, `OggOpusEncoder.wasm`, `WebMOpusEncoder.wasm`, imports do worker, ou opções passadas ao construtor.
3. **`warmEncoder` só fica mais tolerante — nunca mais agressivo.** Mudamos o gatilho do `stop()` do warmup para depender de um evento observável (`ondataavailable` do próprio warmup) com fallback de tempo **maior** que os 120 ms atuais. Se o evento não vier, cai no fallback; se vier, para com segurança. Em nenhum cenário o warmup fica mais rápido ou mais frágil do que hoje.

## Mudanças propostas (curtas e isoladas)

### Mudança 1 — `warmEncoder()` em `src/components/whatsapp/AudioRecorder.tsx` (linhas 46-77)

Substituir o `setTimeout(() => rec.stop(), 120)` fixo por:

- Um `rec.ondataavailable` que, ao receber o primeiro chunk (prova de que encoder+WASM estão vivos), chama `rec.stop()`.
- Um fallback com `setTimeout` **maior** (proposta: 1500 ms) que só dispara se o evento não vier — e mesmo assim, dentro de `try/catch`, e só se `rec.state === 'recording'` (evita chamar stop em estado inválido).
- Adicionar `rec.onerror = () => { /* swallow */ }` para engolir localmente qualquer erro que o polyfill exponha via API. Não substitui o `window.onerror` do worker, mas cobre o caminho documentado.

Diff conceitual (não é o código final):

```
- rec.start();
- setTimeout(() => { try { rec.stop(); } catch { /* noop */ } }, 120);
+ let stopped = false;
+ const safeStop = () => {
+   if (stopped) return;
+   stopped = true;
+   try { if (rec.state === 'recording') rec.stop(); } catch { /* noop */ }
+ };
+ rec.onerror = () => { /* swallow warmup errors */ };
+ const originalOnData = rec.ondataavailable;
+ rec.ondataavailable = (ev) => {
+   try { originalOnData?.(ev); } catch { /* noop */ }
+   safeStop();
+ };
+ rec.start();
+ setTimeout(safeStop, 1500); // fallback bem acima do boot time
```

Nada nessa mudança altera o warmup do worker/WASM (`warmupOpusPolyfill`) nem o construtor de `OpusMediaRecorder`. Só muda **quando** o warmup chama `stop()` e adiciona um handler local de erro.

**Por que é seguro:**
- O warmup permanece fire-and-forget, contido em `try/catch`.
- Se o novo caminho falhar, `encoderWarmed` volta a `false` no `catch`, exatamente como hoje.
- Não afeta `mediaRecorderRef` (recorder real usa outra instância).
- Se por acaso `ondataavailable` nunca disparar, o fallback de 1500 ms garante que não vazamos o `AudioContext` — o `onstop` existente já limpa `osc`, `dst.stream` e `ctx`.

### Mudança 2 — Filtro adicional em `src/instrument.ts` `beforeSend`

Estender o `beforeSend` existente para também dropar eventos cujo primeiro frame venha de `encoderWorker.umd.js` **E** mecanismo seja `auto.browser.global_handlers.onerror`. A checagem é aditiva ao filtro atual de chunks stale — não muda nem remove o filtro que já existe.

Regra explícita para não silenciar demais:
- **Só drop** quando o `filename` do stacktrace top-frame contém `encoderWorker.umd.js` **E** o mechanism type é `onerror`.
- Erros nossos que apenas *usem* `opus-media-recorder` (ex.: `logAudioEvent('audio_record_polyfill_init_error', ...)`) **não** são filtrados — passam pelo Sentry normalmente.

**Por que é seguro:**
- Filtro é de saída (`beforeSend`), não altera nenhum runtime.
- Não remove nada; só amplia o predicado atual.
- Se um dia o warmup for reescrito, o filtro segue inerte para tudo que não venha desse arquivo específico.

## O que este plano **não** faz

- Não anexa `onerror` no `mediaRecorder` real da linha 198 (originalmente pensei nisso, mas retirei — mudar handlers no caminho crítico contradiz a invariante 1).
- Não substitui `opus-media-recorder` por outra lib.
- Não muda `MIN_RECORD_MS`, timeslice, MIME, validação OGG, fallback MP4/WebM.
- Não muda `workerOptions`, imports do worker, ou paths de WASM.
- Não adiciona dependência.
- Não muda telemetria (`logAudioEvent`).

## Validação depois de implementar

1. **Smoke manual do fluxo real** (obrigatório antes de considerar feito):
   - Clicar em "Gravar áudio" no Comercial → gravar 3 s → parar → botão "Enviar" aparece → enviar. Precisa funcionar idêntico a hoje.
   - Segundo clique consecutivo (encoder já quente): mesmo fluxo, ainda funcional.
   - Cancelar durante gravação: `cancelRecording` limpa estado sem erro.
2. **Console limpo:** após o clique de gravar, nenhum `TypeError` do worker deve aparecer.
3. **Sentry (24-48 h de observação):** o alerta com `encoderWorker.umd.js` + `handled: false` para de vir. Alertas de outras origens continuam chegando normalmente.
4. **Se um erro do worker escapar por outra via**, ele continua chegando ao Sentry (nosso filtro é estrito no `filename` + `mechanism`).

## Arquivos tocados

- `src/components/whatsapp/AudioRecorder.tsx` — apenas o bloco `warmEncoder` (linhas 46-77). Nenhuma outra linha do arquivo é alterada.
- `src/instrument.ts` — apenas o predicado interno do `beforeSend` existente.

## Reversão

Ambas as mudanças são de baixo risco e triviais de reverter:
- Reverter `warmEncoder`: restaurar `setTimeout(() => { try { rec.stop(); } catch { /* noop */ } }, 120)`.
- Reverter filtro: remover a nova condição do `beforeSend`.

Sem migrations, sem novo estado, sem novos arquivos.
