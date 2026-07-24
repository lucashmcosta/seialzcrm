## Diagnóstico (verificado no código atual)

Evento antigo (14/jul), mas a causa raiz **continua no `src/App.tsx`** (linhas 41‑68). O Sentry capturou `Failed to fetch dynamically imported module` para **dois chunks no mesmo tick** (12:37:14.987 InboundCallHandler; 12:37:14.991 OutboundCallHandler) — os dois são montados juntos pelo `GlobalCallHandler` dentro do mesmo `Suspense`.

`reloadForChunkRecovery()` hoje:

```ts
if (Date.now() - lastReloadAt < 10_000) return false;
window.sessionStorage.setItem(reloadKey, Date.now().toString());
window.location.reload();
return true;
```

Fluxo do erro:
1. Deploy invalida os chunks. `InboundCallHandler` e `OutboundCallHandler` disparam `import()` em paralelo e falham em ~4ms de diferença.
2. Primeiro `retryImport` esgota retries → `reloadForChunkRecovery()` grava timestamp, chama `location.reload()`, retorna `true` → devolve Promise pendente (silencia).
3. Segundo `retryImport` esgota retries no mesmo tick → `reloadForChunkRecovery()` cai no `Date.now() - lastReloadAt < 10_000` → retorna `false` → `throw err`.
4. Erro sobe por `React.lazy` → `Suspense` não trata → `Sentry.ErrorBoundary` do `main.tsx` reporta.

A correção anterior (jul/17) só cobriu chunk único; concorrência ficou de fora.

## Correção

Separar duas responsabilidades hoje acopladas no mesmo booleano:

- **Disparar `location.reload()`** — mantém throttle de 10 s + sessionStorage para não haver loop se o reload trouxer chunks stale de novo.
- **Sinalizar "recovery em andamento"** para suspender lazies restantes — precisa ser `true` para *todo* `retryImport` que falhar entre o `reload()` e o unload real, mesmo dentro da janela de throttle.

Ajuste em `src/App.tsx`:

- Flag em escopo de módulo `let reloadInFlight = false` (síncrono, mesmo runtime — sessionStorage não serve aqui).
- `reloadForChunkRecovery()`: se `reloadInFlight` já for `true`, retorna `true` imediatamente (sem tocar em throttle nem `location.reload()`). Caso contrário, aplica o throttle atual; ao disparar o reload com sucesso, marca `reloadInFlight = true`.
- `retryImport`: comportamento inalterado — se `isStaleChunkError(err)` e `reloadForChunkRecovery()` retornar `true`, suspende com Promise pendente; senão, `throw`.

Resultado: o segundo/N‑ésimo chunk stale a falhar entre o `location.reload()` e o unload da página passa a ser suspenso silenciosamente. O evento não chega ao `Sentry.ErrorBoundary` — nada é escondido por `beforeSend`; a recuperação real passa a cobrir concorrência.

Efeito colateral considerado: se o reload for bloqueado pelo navegador, lazies subsequentes ficam suspensos indefinidamente. O `SentryFallback` em `main.tsx` já tem o botão "Recarregar agora" (`hardRefreshApp()`) como escape manual.

## Arquivo tocado

- `src/App.tsx` — apenas `reloadForChunkRecovery` (linhas 41‑52). `retryImport` fica igual. ~6 linhas alteradas.

## Fora do escopo

- Não altera `main.tsx`, `instrument.ts`, providers, rotas, `Suspense`, nem os call handlers.
- Não adiciona filtro no Sentry.
- Cenário single-chunk stale continua idêntico ao atual.