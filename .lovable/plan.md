# Sentry SEIALZ-23 — "Degraded UI Performance" em /auth/signin

## Diagnóstico

O evento não é um erro de código. É um **detector de performance** do Sentry:
1 evento, 0 usuários afetados, 8 dias atrás. O que ele mediu:

- `browser.DNS` de `https://crm.seialz.com` levou **541ms** (resolução DNS do
  próprio domínio, no primeiro acesso do visitante — cache DNS frio).
- Isso empurrou o TTFB para 636ms e o LCP para 1.773s.
- Na mesma trace aparecem dois recursos pesados e bloqueantes:
  `/assets/index-*.css` (287ms) e `/assets/index-*.js` (623ms).

Não existe stack trace nem exceção: não há bug para corrigir. O DNS do próprio
domínio não é controlável pelo frontend. O que dá para melhorar de fato é o
caminho crítico do primeiro carregamento, e o que dá para fazer no Sentry é
parar de tratar esse detector como issue acionável.

## O que será feito

### 1. Encurtar o caminho crítico do primeiro paint (`index.html`)

- Adicionar `preconnect` para o domínio do Supabase (`VITE_SUPABASE_URL`), que
  hoje só é resolvido depois do JS carregar — hoje só existe preconnect para
  as fontes do Google.
- Tornar o CSS das Google Fonts **não bloqueante** (padrão
  `media="print" onload="this.media='all'"` com `<noscript>` de fallback),
  mantendo exatamente as mesmas famílias e pesos. Isso remove os 287ms de
  render-blocking sem mudar tipografia.

Nada de troca de fonte, nada de self-host nesta etapa.

### 2. Reduzir o peso do bundle inicial (`vite.config.ts`)

- Adicionar `build.rollupOptions.output.manualChunks` separando `react`/
  `react-dom`/`react-router` e `@supabase/supabase-js` do chunk de entrada.
  O `index-*.js` de 623ms hoje é um bundle único; separar vendor permite que
  ele seja cacheado entre deploys (`/assets/*` já é `immutable`).

Sem mexer em rotas, lazy loading ou `retryImport`.

### 3. Silenciar o detector no Sentry (`src/instrument.ts`)

- No `beforeSend`, descartar eventos cujo tipo é detector de performance de
  navegação sem exceção associada (DNS/consecutive-http e similares em
  pageload). Motivo registrado em comentário: latência de DNS do domínio raiz
  não é acionável no código do app; regressões reais de LCP/TTFB continuam
  visíveis em Web Vitals / Insights, que não são filtrados.

## Fora de escopo

- Nenhuma mudança de backend, RLS, edge function, migração ou integração.
- Nenhuma mudança em `/auth/signin` (lógica, layout ou auth).
- Nenhuma alteração de `vercel.json` (headers de cache já estão corretos).

## Verificação

`tsgo` + `bun run build` verdes, e confirmação de que o HTML gerado mantém as
mesmas fontes e que o build emite os chunks vendor separados.
