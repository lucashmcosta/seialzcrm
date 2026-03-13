

## Nova Página de Login e Cadastro — Seialz

### Visão Geral
Redesign das páginas de login (`/auth/signin`) e cadastro (`/auth/signup`) com layout moderno split-screen (meia tela), usando os brand assets da Seialz.

### Layout

```text
┌──────────────────────┬──────────────────────┐
│                      │                      │
│   BANNER SEIALZ      │   FORMULÁRIO         │
│                      │                      │
│   Fundo #09090B      │   Logo Seialz        │
│   Grid sutil verde   │   Título / Subtítulo │
│   Logo grande        │   Inputs             │
│   Tagline            │   Botão primário     │
│   Features bullets   │   Link signup/signin │
│                      │                      │
└──────────────────────┴──────────────────────┘
        (mobile: banner escondido, form full)
```

### Design

- **Lado esquerdo (banner)**: Fundo `#09090B` com grid pattern sutil em `#00FF88` (igual landing), logo da Seialz, tagline "Do clique ao contrato fechado", e 3 bullets com features
- **Lado direito (form)**: Fundo branco (light) ou escuro (dark), formulário centralizado com a logo Seialz no topo
- **Fonte**: Michroma para títulos, Outfit para body (via Google Fonts import no CSS)
- **Cor primária dos botões**: `#00FF88` com texto `#09090B`
- **Inputs**: Estilo dark/tech com bordas sutis
- **Mobile**: Banner escondido, formulário ocupa tela inteira

### Arquivos a Modificar

1. **Copiar logo** `user-uploads://seialz-logo-transparent-green-1200x240.png` → `src/assets/seialz-logo-green.png`
2. **`src/pages/auth/SignIn.tsx`** — Redesign completo com layout split-screen, mantendo toda a lógica de autenticação existente (session, device_id, redirect)
3. **`src/pages/auth/SignUp.tsx`** — Mesmo layout split-screen, mantendo lógica de signup
4. **`src/index.css`** — Adicionar import das fontes Michroma e Outfit, e estilos do grid pattern para o banner

### Detalhes Técnicos

- Componente compartilhado `AuthLayout` para evitar duplicação do banner entre SignIn e SignUp
- Responsivo: `lg:grid-cols-2` para split, `grid-cols-1` para mobile
- Animações sutis com framer-motion (já instalado) no banner
- Toda lógica de auth permanece inalterada — apenas visual muda
- Botão verde `#00FF88` com hover `#00E07A` usando classes inline do Tailwind

