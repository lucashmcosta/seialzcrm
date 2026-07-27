## Diagnóstico

O erro `'text/html' is not a valid JavaScript MIME type.` é a variante Safari/WebKit de **stale chunk pós-deploy** (o servidor entregou `index.html` no lugar de um chunk JS que sumiu do CDN após deploy).

O sistema já **recupera** esse caso automaticamente:

- `isStaleChunkError` em `src/App.tsx` já reconhece este texto (linhas 39‑40)
- `retryImport` suspende o lazy() e dispara `reloadForChunkRecovery`
- Guards globais em `src/main.tsx` (`error`, `unhandledrejection`, `vite:preloadError`) chamam o mesmo recovery
- `SentryFallback` também detecta e recarrega

O usuário nunca vê tela quebrada. Porém o evento **ainda chega ao Sentry** porque:

- `Sentry.ErrorBoundary` reporta o erro **antes** de renderizar o fallback → dispara `React ErrorBoundary TypeError` no dashboard.
- O filtro `beforeSend` em `src/instrument.ts` tem sua própria lista `STALE_CHUNK_PATTERNS` que **não** inclui as variantes de MIME type:
  ```
  "failed to fetch dynamically imported module",
  "error loading dynamically imported module",
  "importing a module script failed",
  "unable to preload css",
  "loading chunk",
  "chunkloaderror",
  "module script",
  ```
- A mensagem `"'text/html' is not a valid JavaScript MIME type."` não bate com "module script" nem com nenhum outro item → passa pelo filtro e vira issue.

## Escopo da correção (somente `src/instrument.ts`)

Alinhar `STALE_CHUNK_PATTERNS` do `beforeSend` do Sentry com a lista já aprovada em `App.tsx#isStaleChunkError`, acrescentando os três padrões que faltam:

- `"'text/html' is not a valid javascript mime type"`
- `"is not a valid javascript mime type"` (cobre outras variações: `text/plain`, `text/x-server-parsed-html`, etc.)
- `"expected a javascript module script but the server responded"` (Chromium)
- `"expected a javascript-or-wasm module script"` (Chromium mais recente)

Nada mais muda. O predicado continua sendo simples `includes(...)` sobre a mensagem normalizada em lowercase — os padrões novos são strings estáveis emitidas pelos próprios navegadores, então não geram falso positivo.

## Fora do escopo

- Não mexer em `App.tsx`, `main.tsx`, `SentryFallback` — a recuperação funcional já está correta.
- Não alterar throttle, service worker, versão de bundle ou qualquer lógica de deploy.
- Não adicionar heartbeat de versão.

## Validação

- Reler `src/instrument.ts` e confirmar que os 4 padrões novos aparecem em `STALE_CHUNK_PATTERNS` e que `isStaleChunkMessage` continua sendo o único caller.
- No Sentry: novas ocorrências deste erro deixam de ser criadas; o issue atual pode ser marcado como resolvido.
- Comportamento do usuário permanece idêntico (reload silencioso).
