## Diagnóstico

Mesmo padrão já tratado nas rodadas anteriores: **stale chunk pós-deploy**.

- A sessão do usuário ficou aberta de 16/jul a 23/jul (breadcrumbs cobrindo 7 dias).
- Bundle carregado era o antigo (`index-DcMBZh5t.js`), com o hash de `InboxPage-Dkblxycs.js` já removido do CDN após deploy.
- Ao navegar `/opportunities/... → /inbox`, o `React.lazy(InboxPage)` tentou baixar o chunk inexistente e o `SentryFallback` capturou.

O bundle atual em produção já contém todas as camadas de defesa:

- `retryImport` envolvendo os 61 `lazy()` em `App.tsx`
- Guards globais em `src/main.tsx` para `error` e `unhandledrejection` interceptando padrões de importação dinâmica antes do React
- Matcher ampliado (Chrome, Safari/WebKit, Firefox) — inclui `'text/html' is not a valid javascript mime type`, `is not a valid javascript mime type`, `expected a javascript module script`, etc.
- `SentryFallback` disparando reload resiliente
- `beforeSend` do Sentry descartando esses eventos como ruído

Ou seja: uma sessão que abrisse esse mesmo cenário hoje seria auto-recuperada silenciosamente por reload antes de chegar ao ErrorBoundary. O evento reportado é histórico de uma sessão antiga que já ficou órfã do CDN.

## Ação recomendada

**Nada a alterar no código.** O sistema já cobre este cenário:

- Sessões novas: `retryImport` + reload silencioso resolvem sem UI de erro.
- Sessões antigas ainda vivas: no próximo reload buscam o bundle atualizado e passam a herdar toda a blindagem.
- No Sentry: o evento pode ser resolvido/ignorado — o `beforeSend` já descarta novos eventos idênticos.

## Fora do escopo

- Não mexer em `App.tsx`, `main.tsx`, `SentryFallback`, `instrument.ts` — a lógica atual já é suficiente.
- Não adicionar heartbeat de versão / forced reload periódico sem pedido explícito (mudaria comportamento além do reportado).

## Validação

- Confirmar em `src/App.tsx` que `InboxPage` está envolvido em `retryImport` (todos os 61 `lazy()` já foram cobertos em rodadas anteriores).
- Confirmar em `src/instrument.ts` que `beforeSend` filtra "failed to fetch dynamically imported module" (já presente em `STALE_CHUNK_PATTERNS`).
- Se quiser, marcar o issue como resolvido no Sentry — novas ocorrências não serão mais enviadas.
