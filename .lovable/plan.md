

## Landing Page Institucional do Seialz

Criar uma landing page completa na rota `/` com todo o conteúdo fornecido, usando o visual dark mode consistente com a identidade da marca (verde neon + fundo escuro, como a tela de login).

### Arquitetura

- **Novo arquivo:** `src/pages/LandingPage.tsx` — componente principal com todas as seções
- **Alteração:** `src/App.tsx` — trocar a rota `/` de redirect para `/dashboard` para renderizar a `LandingPage`
- **Novo arquivo:** `src/components/landing/LandingNavbar.tsx` — navbar fixa com logo + botão "Entrar"
- **Novo arquivo:** `src/components/landing/LandingFooter.tsx` — footer simples

### Seções da Landing (todas dentro de LandingPage.tsx)

1. **Navbar** — Logo Seialz + botão "Entrar" (link para `/auth/signin`) + "Agendar Diagnóstico" (scroll para formulário)
2. **Hero** — Tag `// SALES AS A SERVICE`, headline, sub, CTA verde, nota
3. **O Problema** — Fundo levemente diferente, texto impactante
4. **A Solução / Conceito** — Loop marketing <> vendas com diagrama visual (steps animados), 3 pilares em cards
5. **Pra Quem** — Grid de segmentos como badges, stats em 4 colunas
6. **O Que Está Incluso** — Grid 3x3 de feature cards com ícones
7. **Como Funciona** — 4 steps verticais com linha conectora (timeline)
8. **Resultados** — 4 stats grandes animados com contadores
9. **CTA Final + Formulário** — Formulário de contato (nome, empresa, email, telefone, dropdown investimento), botão verde

### Estilo

- Fundo principal: `hsl(240, 10%, 4%)` (auth-banner-bg)
- Grid pattern sutil como overlay (auth-grid-pattern)
- Cor de destaque: verde neon `hsl(150, 100%, 50%)`
- Fonte headings: Michroma, body: Outfit
- Animações com Framer Motion (fade-in-up nos scroll, glow pulsante no CTA)
- Seções alternando entre fundo puro escuro e fundo com leve variação para separação visual
- Cards com borda sutil verde e glassmorphism escuro
- Responsivo: mobile-first, grid collapsa para 1 coluna

### Rota

```
/ → LandingPage (pública)
```

Usuários autenticados que acessam `/` verão a landing (podem navegar para `/dashboard` pelo navbar ou pelo app). O redirect antigo `/ → /dashboard` será removido.

### Formulário CTA

O formulário será visual apenas (sem backend). Campos: Nome, Empresa, Email, Telefone, Investimento mensal (dropdown). Ao submeter, exibe toast de confirmação. Pode ser conectado a webhook futuramente.

### Detalhes Técnicos

- Framer Motion `whileInView` para animações de scroll
- `IntersectionObserver` via Framer Motion para lazy reveal
- Seções com `id` para smooth scroll do navbar
- Counters animados nos stats de resultados (reutilizando AnimatedCounter existente)
- Sem dependências novas — tudo com Tailwind + Framer Motion + componentes existentes

