# SEIALZ-26 "Blocking Operation" em `/` — diagnóstico e correção mínima

## O que o Sentry reportou (verificado nas imagens)

Não é um erro de código: é um **detector de performance** (level `warning`, 1 evento, 0 usuários afetados).

- `pageload — /` = 3,60 s
- `ui.long-animation-frame` = **2.706 ms** (a thread principal travada de uma vez)
- FCP 3.600 ms / LCP 3.792 ms / TTFB 620 ms
- Assets no caminho crítico: `index-*.js` 1,60 s, `index-*.css` 790 ms, `fonts.googleapis.com/css2` 77 ms + 699 ms, `manifest.webmanifest` 672 ms

## Causa (confirmada no código)

A rota `/` é pública (redirect para a landing), mas paga o custo do app inteiro antes do primeiro paint:

1. `index.html` carrega o CSS do Google Fonts com `<link rel="stylesheet">` **bloqueante**, com 5 famílias e muitos pesos (Inter, Outfit, Share Tech Mono, Sora, Space Mono).
2. `src/App.tsx` monta, já na raiz, toda a árvore de providers e dependências do CRM (`QueryClientProvider`, `TooltipProvider`, `TelephonyProvider`, `AuthProvider`, `OrganizationProvider`, Sentry, `framer-motion`) — tudo dentro do bundle único `index-*.js`, sem `manualChunks` em `vite.config.ts`. Isso é o long animation frame de 2,7 s (parse + execução do bundle).
3. `RootRedirect` ainda espera o `resolveInitialLocale()` (lookup de IP, até 1,2 s) mostrando `PageLoader` antes de navegar para `/pt-br`.

## Correção proposta (mínima, só apresentação/carregamento)

1. **Fontes não bloqueantes** (`index.html`): manter `preconnect`, carregar o CSS das fontes com `media="print" onload="this.media='all'"` + `<noscript>` de fallback, e reduzir a lista de pesos para os efetivamente usados. Elimina o CSS de fonte do caminho crítico.
2. **Split de bundle** (`vite.config.ts`): adicionar `build.rollupOptions.output.manualChunks` separando `react`/`react-dom`/`react-router`, `@supabase/supabase-js`, `@sentry/react` e `framer-motion`. Quebra o `index-*.js` de 1,6 s em chunks paralelos e cacheáveis, encurtando o long animation frame.
3. **Não esperar o geo-IP na raiz** (`src/App.tsx`): redirecionar imediatamente para o slug do `detectLocale()` (navigator/preferência salva) e deixar o ajuste por IP acontecer depois, dentro do `SiteI18nProvider`, sem bloquear o paint. Remove até 1,2 s do FCP.

Nada de banco, RLS, edge functions ou regra de negócio. Sem mudança de layout ou de conteúdo visual.

## Opcional (só se você quiser)

Ajustar `beforeSend` em `src/instrument.ts` para não enviar o detector `Blocking Operation` quando ele vier apenas de latência de rede/DNS na primeira visita — mantendo os erros reais e as regressões de Web Vitals. Fica de fora por padrão, porque a correção acima já deve derrubar o detector.

## Validação

`tsgo` + build, e comparar no build o tamanho do chunk de entrada antes/depois. Depois do deploy, confirmar no Sentry que o evento não reaparece em `/`.
