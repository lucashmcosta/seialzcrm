

## Mobile Dashboard — Tela Principal Mobile-First

### Contexto
Atualmente o Dashboard usa o `<Layout>` que renderiza a `SeialzSidebar` (60px/220px sidebar) — não funciona bem em mobile (390px). Precisa de um layout mobile dedicado com header + hamburger + navegação por abas/drawer.

### Arquitetura

```text
┌──────────────────────────┐
│ [s] seialz     🔔  ☰    │  ← Header fixo (56px)
├──────────────────────────┤
│                          │
│  Bem-vindo, João         │
│                          │
│  [Filtros: período/user] │
│                          │
│  ┌──────────────────┐    │
│  │ Oportunidades    │    │  ← KPI cards (scroll vertical)
│  │ 286         $    │    │
│  └──────────────────┘    │
│  ┌──────────────────┐    │
│  │ Valor Pipeline   │    │
│  │ R$ 100,00   📈   │    │
│  └──────────────────┘    │
│  ... mais cards ...      │
│  ... gráficos ...        │
│  ... tarefas ...         │
│                          │
├──────────────────────────┤
│ 🏠  👥  💼  ✅  💬     │  ← Bottom tab bar (fixo)
└──────────────────────────┘
```

### Mudanças

#### 1. Novo componente: `src/components/mobile/MobileLayout.tsx`
Layout mobile com:
- **Header fixo** (56px): Logo Seialz à esquerda, notificações + hamburger à direita
- **Drawer lateral** (slide da direita): menu completo com os mesmos itens do SeialzSidebar, avatar do user, sign out
- **Bottom tab bar** (56px): 5 tabs — Dashboard, Contatos, Oportunidades, Tarefas, Mensagens (se WhatsApp ativo, senão 4 tabs)
- **Área de conteúdo** scrollável entre header e bottom bar

#### 2. Novo componente: `src/components/mobile/MobileDashboard.tsx`
Dashboard otimizado para mobile:
- Saudação com nome do usuário
- Filtros horizontais (chips scrolláveis, não selects largos)
- KPI cards em stack vertical (full width, estilo dark com ícones verdes)
- Gráficos responsivos (largura 100%)
- Lista de tarefas compacta
- Atividades recentes

#### 3. Atualizar `src/pages/Dashboard.tsx`
- Detectar `useIsMobile()` e renderizar `<MobileDashboard>` dentro de `<MobileLayout>` quando mobile, mantendo o desktop inalterado

#### 4. Atualizar `src/App.tsx`
- Nenhuma mudança necessária nas rotas — o Dashboard já decide internamente qual layout usar

### Estilo visual
- Fundo `sz-bg` (preto profundo)
- Cards com `sz-bg2` e borda `sz-border`
- Texto em verde neon (`sz-green`) para valores positivos
- Vermelho para perdas
- Font `Share Tech Mono` para dados numéricos
- Border-radius 6px conforme design system
- Bottom bar com ícones Phosphor, tab ativa em verde neon

