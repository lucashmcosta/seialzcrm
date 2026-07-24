## Diagnóstico (confirmado)

O logo aparece quebrado em `crm.seialz.com/auth/signin` porque o `AuthLayout.tsx` referencia o logo via **lovable-assets** (`/__l5e/assets-v1/...`), e o domínio `crm.seialz.com` **não é servido pelo Lovable — é uma implantação Vercel** (confirmado por `vercel.json` no projeto).

Prova empírica (curl direto):

- `https://seialz.com/__l5e/assets-v1/.../seialz-logo-color.png` → **200 image/png** (Lovable serve o asset).
- `https://crm.seialz.com/__l5e/assets-v1/.../seialz-logo-color.png` → **200 text/html** com `content-disposition: filename="index.html"` (Vercel devolve o SPA por causa do rewrite `/(.*) -> /index.html`).

Como o browser recebe HTML no lugar de PNG, a `<img>` falha e o alt "Seialz" aparece como texto — exatamente o que a captura mostra. O mesmo problema atinge, no mínimo, estes 4 arquivos que consomem `*.asset.json`:

- `src/components/auth/AuthLayout.tsx` (logo + linhas decorativas)
- `src/pages/LandingPage.tsx`
- `src/components/landing/LandingNavbar.tsx`
- `src/components/landing/LandingFooter.tsx`

Ou seja: a landing e o auth em `crm.seialz.com` estão com logos/linhas quebrados hoje, mesmo que só o signin tenha sido reportado.

## Plano

Trocar a estratégia dos assets de marca no build Vercel. Duas opções — recomendo a **A** por ser autocontida e não depender de infra externa em runtime.

### Opção A (recomendada) — republicar os assets de marca em `/public/brand/`

1. Baixar cada binário referenciado pelos 4 arquivos acima (a partir do CDN Lovable, usando o `url` de cada `.asset.json`) e gravar em `public/brand/`:
   - `seialz-logo-color.png`
   - `seialz-logo-white.svg`, `seialz-logo-black.svg`
   - `linhas-sutil-light.svg`, `linhas-sutil-dark.svg`, `linhas-media-light.svg`, `linhas-media-dark.svg`, `linhas-forte-dark.svg`, `linhas-ultrasutil-light.svg`
2. Substituir em cada um dos 4 componentes:
   - `import x from '@/assets/brand/....asset.json'` → import removido
   - `x.url` → string literal `/brand/<arquivo>` (Vite serve `public/` na raiz, Vercel também)
3. Manter os `.asset.json` no repositório por enquanto (não deletar do CDN) — ninguém mais os importa, e evita quebrar deploys antigos.
4. Verificação: build local + `curl -I https://crm.seialz.com/brand/seialz-logo-color.png` deve retornar `image/png` depois do deploy.

Vantagens: funciona igual em Lovable, Vercel e qualquer futuro host; sem proxy; sem custo de CDN adicional; cache do Vercel já configurado.

### Opção B (alternativa) — proxy `/__l5e/*` no Vercel

Adicionar em `vercel.json` um rewrite antes do catch-all:

```
{ "source": "/__l5e/:path*", "destination": "https://seialz.com/__l5e/:path*" }
```

Menos código alterado, mas depende do domínio Lovable continuar respondendo e mantém `crm.seialz.com` como "cliente" de outro host para servir estáticos. Não recomendo.

## Não faz parte deste plano

- Não altera nada nas Edge Functions, RLS, telefonia, WhatsApp, ou qualquer lógica de negócio.
- Não mexe em auth, session, roteamento ou Sentry.
- Não redesenha a tela — só corrige o `src` das imagens.
- Não muda o fluxo do `lovable-assets` para o resto do projeto (documentos, uploads etc.); só assets de marca usados fora do host Lovable.

## Detalhes técnicos

- Impacto: 4 arquivos de componente + ~8 binários adicionados em `public/brand/`.
- Tamanho: logo PNG 32 KB + SVGs pequenos — trivial no bundle Vercel (`public/` não entra no JS).
- Compatibilidade: em Lovable `/brand/*` também funciona (Vite dev + build), então nenhum dos dois hosts fica quebrado.
