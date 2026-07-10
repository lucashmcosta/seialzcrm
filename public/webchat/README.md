# Webchat widget (estático)

Assets do widget de captação, servidos pelo mesmo host do frontend (Vercel) em
`/webchat/loader.js` e `/webchat/app.html`. Zero build — vanilla JS.

- **`loader.js`** — snippet de 2 linhas injeta isto; ele monta o launcher e, no
  clique, cria o iframe apontando pra `app.html`.
- **`app.html`** — o app do chat (iframe self-contained: HTML+CSS+JS inline).
  Conversa via as edge functions `webchat-*`.

## Antes do deploy

`app.html` tem o placeholder **`__SUPABASE_ANON_KEY__`** — substituir pela
`VITE_SUPABASE_PUBLISHABLE_KEY` (chave anon/publishable; é pública, safe para
expor, igual ao frontend). O gateway do Supabase exige o `apikey` mesmo com
`verify_jwt=false`.

## Nota Vercel

O rewrite catch-all do `vercel.json` (`/(.*) -> /index.html`) NÃO intercepta
estes arquivos: a Vercel serve estáticos existentes antes de aplicar rewrites.
Confirmar no deploy que `/webchat/loader.js` retorna o JS (não o index.html).

Detalhes: [`docs/plans/2026-07-webchat-v1.md`](../../docs/plans/2026-07-webchat-v1.md).
