## Diagnóstico

O erro `Failed to fetch dynamically imported module: .../ContactForm-CoGVV9vg.js` é o clássico **stale chunk após deploy**: a sessão do usuário estava carregada com o bundle `index-Bpp8iGOI.js` desde 03/jul; ao clicar em "Editar contato" em 07/jul, o Vite tentou baixar o chunk do `ContactForm` cujo hash não existe mais no CDN.

O código atual **já trata isso** em três camadas:

1. `retryImport` em `src/App.tsx` detecta stale chunks e chama `reloadForChunkRecovery()`, retornando uma Promise que nunca resolve para o Suspense (não vaza para o ErrorBoundary).
2. Handlers globais em `src/main.tsx` (`error`, `unhandledrejection`, `vite:preloadError`) interceptam antes do React.
3. `SentryFallback` em `main.tsx` detecta stale chunk no boundary e dispara reload + spinner.
4. `beforeSend` em `src/instrument.ts` descarta esses eventos no Sentry.

O motivo do erro ter aparecido mesmo assim: **a sessão estava rodando o bundle de 03/jul**, que é anterior a parte dessas blindagens. Clientes já carregados não recebem o fix — só o próximo carregamento pega o bundle novo. Não há correção server-side possível para sessões antigas além de forçá-las a recarregar.

Para o bundle **atual** (o que sai agora), o fluxo já é: chunk 404 → reload silencioso (throttle 10s) → app volta funcional. O usuário viu o boundary porque estava numa sessão antiga.

## O que fazer

Duas opções, escolha uma antes de mudar código:

**A. Nada a fazer (recomendado).** O comportamento já está correto no bundle atual. Sessões antigas se auto-corrigem na próxima navegação/refresh. Fecho aqui.

**B. Camada extra de garantia** para sessões antigas que ainda estão rodando: adicionar um `Sentry.ErrorBoundary` de fallback que, ao detectar stale chunk, faça `location.reload()` **sem depender do throttle** na primeira ocorrência do boundary (hoje o throttle bloqueia se já reloadou nos últimos 10s, e o `SentryFallback` mostra um botão "Recarregar agora"). Mudaria só o `SentryFallback` de `main.tsx` para forçar reload em 1500ms independentemente do throttle. Impacto: baixo, ~10 linhas.

## Pergunta

Quer que eu aplique a opção B (endurecer o fallback do boundary) ou apenas confirme A (nada a fazer, o próximo bundle já cobre)?