

## PWA Setup + Tela de Login Mobile-First

Projeto em duas partes: (1) configurar PWA e (2) criar a primeira tela mobile — Login.

### Parte 1: Setup PWA

**`vite.config.ts`** — Instalar e configurar `vite-plugin-pwa`:
- Adicionar manifest com nome "Seialz CRM", cores do tema, ícones
- Service worker com `navigateFallbackDenylist: [/^\/~oauth/]`
- Display: `standalone`

**`index.html`** — Adicionar meta tags mobile:
- `<meta name="apple-mobile-web-app-capable">`
- `<meta name="theme-color">`
- `<meta name="viewport">` (já deve existir, validar)
- `<link rel="apple-touch-icon">`

**`public/`** — Criar ícones PWA (192x192 e 512x512) com o logo Seialz

### Parte 2: Tela de Login Mobile

Nova estrutura de componentes mobile em `src/components/mobile/` — totalmente separados do desktop.

**`src/components/mobile/auth/MobileSignIn.tsx`** — Tela de login mobile-first:
- Layout full-screen, sem split panel (elimina o banner lateral do desktop)
- Logo Seialz centralizado no topo
- Inputs grandes e touch-friendly (h-14, rounded-2xl)
- Botão primário full-width
- Link para signup
- Animações suaves com framer-motion
- Design escuro seguindo o tema Seialz (fundo `--sz-bg1`)

**`src/App.tsx`** — Adicionar detecção mobile no fluxo de auth:
- Usar `useIsMobile()` nas rotas `/auth/signin` e `/auth/signup`
- Quando mobile → renderizar `MobileSignIn` ao invés de `SignIn`
- A lógica de autenticação (Supabase) é reutilizada, só o layout muda

### Estrutura de pastas para o futuro

```text
src/components/mobile/
  auth/
    MobileSignIn.tsx      ← primeira tela (este PR)
    MobileSignUp.tsx      ← próximo
  layout/
    MobileShell.tsx       ← shell com bottom tabs (futuro)
    MobileHeader.tsx
  dashboard/
    MobileDashboard.tsx   ← futuro
  ...
```

### Pacote a instalar
- `vite-plugin-pwa` (inclui `workbox-precaching`)

