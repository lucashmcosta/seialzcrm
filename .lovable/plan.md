## Diagnóstico

O Sentry breadcrumb `Uncaught TypeError: Cannot read properties of undefined (reading 'close')` em `encoderWorker.umd-CIaCbDnT.js:1:10666` vem do worker do pacote `opus-media-recorder`. Sequência do usuário: clicou em **Gravar áudio** e, ~2 s depois, clicou em outro botão do próprio recorder (fluxo confirmado nos breadcrumbs `ui.click` em `13:42:49` e `13:42:51`).

O que acontece em `src/components/whatsapp/AudioRecorder.tsx`:
- No 1º click de "Gravar", `startRecording()` faz `void warmEncoder()` (linha 178). O warmup instancia um `OpusMediaRecorder` throwaway contra um `AudioContext` silencioso, chama `rec.start()` e agenda `safeStop()` — que dispara `rec.stop()`.
- Dentro do worker (`encoderWorker.umd.js`), o handler de `stop` chama `encoder.close()`. Se a mensagem `stop` chega antes de a WASM ter alocado o encoder (janela de corrida entre `start` e `stop` no warmup), `encoder` é `undefined` e o worker lança — escapa como erro top-level do Worker e sobe para `window.onerror`.
- O `rec.onerror = () => {}` definido no warmup só cobre erros que o polyfill roteia via `MediaRecorder.onerror`; erros crus do próprio Worker não passam por ali.

Impactos observados:
- `src/instrument.ts` (linhas 86-95) já dropa esse evento no Sentry, então **não gera issue**.
- Nenhum handler global reagirá — `src/main.tsx` só reage a stale-chunk. O ErrorBoundary não é acionado (não é erro de render React).
- Efeito real: ruído no console + breadcrumb. O fluxo de gravação funciona normalmente.

Ou seja, **hoje o erro já é benigno e filtrado no Sentry**, mas continua poluindo o console e o breadcrumb. A correção é curta e cirúrgica no próprio recorder.

## Escopo da correção (frontend only)

Arquivo único: `src/components/whatsapp/AudioRecorder.tsx`.

1. **Prender o erro no próprio Worker do warmup.** Trocar o factory:
   ```
   encoderWorkerFactory: () => new Worker(workerUrl)
   ```
   por uma factory que registra `worker.onerror` engolindo o evento (chamando `event.preventDefault()`) para que ele não escape para `window.onerror`. Aplica-se a todas as instâncias (warmup e gravação real). Como o polyfill já tem seu próprio protocolo de erro via `postMessage` para o consumidor, capturar `onerror` do Worker não quebra o fluxo — só evita o log cru.

2. **Endurecer o warmup contra a corrida start/stop.** No `warmEncoder()`:
   - Só chamar `safeStop()` **depois** que o primeiro `ondataavailable` chegar (isso já é a intenção do código, mas o `setTimeout(safeStop, 1500)` fallback continua disparando cedo). Reduzir a chance de corrida: só permitir o `setTimeout` chamar `safeStop` se pelo menos um chunk foi recebido; caso contrário, apenas soltar tracks/ctx sem chamar `rec.stop()`.
   - Isso remove a causa raiz da corrida em navegadores lentos.

3. **Nada mais.** Não mexo em `src/instrument.ts` (o filtro do Sentry fica como cinto+suspensório), nem no `dispatchWhatsAppSend`, nem em edge functions.

## Verificação

- Abrir uma thread e clicar "Gravar áudio" pela primeira vez na sessão. Console limpo — sem `Uncaught TypeError: ... 'close'`. Sentry breadcrumb `exception` some.
- Gravar por >1 s e enviar: fluxo continua funcionando (blob OGG/Opus válido, upload OK).
- Typecheck.

## Fora do escopo

- Reportar o bug upstream para `opus-media-recorder` (o worker deveria checar `encoder != null` antes de `close`). Só listado.
