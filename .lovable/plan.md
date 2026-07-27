## Contexto

Sentry capturou `TypeError: Failed to fetch dynamically imported module: .../ContactsList-dXVK5Xlv.js` no `ProtectedRoute`, com a navegação `/inbox → /contacts`. O usuário viu tela branca com o erro no canto (widget do Sentry).

Já existe defesa em camadas:

- `retryImport` em `src/App.tsx` intercepta o rejeito do `import()` dinâmico, chama `reloadForChunkRecovery()` e devolve uma Promise pendente (Suspense infinito) para não estourar até o reload acontecer.
- `SentryFallback` em `src/main.tsx` é belt-and-suspenders: se algo escapar, detecta via `isStaleChunkError` e força reload.

Mesmo assim o erro chegou ao ErrorBoundary. Causas plausíveis (não confirmadas 100%, mas consistentes com o stack):

1. **Bundle antigo em cache no cliente.** O `retryImport` só existe nos builds recentes. Clientes que ainda estão executando um bundle prévio (pré-`retryImport` para essa rota) não têm o interceptor — o rejeito do `import()` sobe direto ao ErrorBoundary.
2. **Throttle de 10 s bloqueando o reload.** Se houve algum reload nos últimos 10 s (por outra causa: HMR, SW unregister, versão nova detectada), `reloadForChunkRecovery` retorna `false` e o `SentryFallback` mostra o botão "Recarregar agora" em vez de reload automático — visualmente é a "tela branca com mensagem".
3. **Erro pós-mount que o ErrorBoundary intercepta antes do fallback re-renderizar** — Sentry ainda envia o evento mesmo quando o reload é disparado.

## Objetivo

Reduzir a probabilidade de o usuário ver qualquer UI de erro por chunk stale, mesmo em clientes rodando bundles antigos, e garantir que o reload sempre aconteça na primeira ocorrência.

## Plano

### 1. Guard global antes do React montar (`src/main.tsx`)

Registrar, no topo do arquivo (antes do `createRoot`), listeners globais que capturam chunk stale ainda no nível do `window`, independentemente de qual componente/versão de bundle disparou:

- `window.addEventListener('error', ...)` — cobre erros síncronos e falhas de `<script type="module">`.
- `window.addEventListener('unhandledrejection', ...)` — cobre `import()` rejeitados que não passaram por nenhum `.catch`.
- `window.addEventListener('vite:preloadError', ...)` — evento oficial do Vite para falha de preload de chunk (o dispatch acontece antes do erro subir ao React).

Em todos os três: se `isStaleChunkError(err)` → `event.preventDefault()` + `reloadForChunkRecovery()`. Isso protege clientes com bundle antigo sem `retryImport`, porque o handler vive no HTML/entrypoint.

### 2. Reload garantido no `SentryFallback`

Hoje, se o throttle bloqueia (`return false`), o usuário fica com a tela do botão. Ajustar para:

- Sempre agendar um `setTimeout(() => window.location.reload(), 1500)` como fallback quando `reloadTriggered === false`, mantendo o botão para o caso extremo.
- Isso garante que, na pior hipótese, o usuário espera ~1,5 s e o app se recupera sozinho — sem clique manual.

### 3. Reset do flag `reloadInFlight` em `pageshow`

`reloadInFlight` é módulo-level. Se um reload for disparado mas o browser servir bfcache (voltar/avançar), o flag permanece `true` e bloqueia novas recuperações. Adicionar `window.addEventListener('pageshow', () => { reloadInFlight = false; })` em `src/App.tsx` onde a variável vive.

### 4. Filtrar telemetria em `src/instrument.ts`

Chunk stale é operacional, não bug de código. Adicionar no `beforeSend` do Sentry (mesmo padrão do filtro do Twilio já implementado) o descarte de erros que passem por `isStaleChunkError`, para não poluir o Sentry com o mesmo evento a cada deploy. Manter breadcrumb, só suprimir o `capture`.

### 5. Verificação

- Após deploy, forçar cenário: simular chunk stale renomeando um asset em produção não é viável; validamos com a asserção lógica: os três listeners globais são registrados antes do `createRoot`, e o `vite:preloadError` cobre o caminho que hoje escapa em bundles antigos.
- Confirmar no Sentry que o volume desse erro cai a zero após 48 h (o bundle antigo eventualmente é substituído em todos os clientes ativos).

## Detalhes técnicos

- Arquivos afetados: `src/main.tsx`, `src/App.tsx`, `src/instrument.ts`. Sem migrations, sem mudanças de schema, sem novas rotas.
- Nenhuma mudança de comportamento em fluxo normal — só ativa em erros de carregamento de módulo.
- O guard global usa `isStaleChunkError` já exportado por `App.tsx`, então há um import cross-module; isso é aceitável porque `App.tsx` já é importado em `main.tsx`.

## Fora de escopo

- Não vamos mudar a estratégia de chunking do Vite (última tentativa causou TDZ, documentado em `vite.config.ts`).
- Não vamos introduzir service worker de cache de assets — o `public/sw.js` atual é kill-switch intencional e mexer nele é outro risco.
- Não vamos alterar CDN/headers de cache — fora do frontend.
