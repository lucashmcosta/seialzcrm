# Frontend — Estado

## Provedores globais (`src/contexts/`)

Ordem de aninhamento (do outer ao inner) definida em `src/App.tsx`:

```
QueryClientProvider   → cache do react-query (subutilizado)
TooltipProvider       → shadcn
BrowserRouter
  AuthProvider              → src/contexts/AuthContext.tsx
    OrganizationProvider    → src/contexts/OrganizationContext.tsx
      OutboundCallProvider  → src/contexts/OutboundCallContext.tsx
        ThemeProvider       → src/contexts/ThemeContext.tsx
```

### AuthContext (`AuthContext.tsx`)

- Estado: `user`, `session`, `loading`, `isAuthenticated`, `signOut`.
- Inicialização:
  1. Registra `supabase.auth.onAuthStateChange` FIRST.
  2. `getVerifiedSession()` (de `@/lib/authSession`) valida sessão contra servidor Supabase.
- `signOut` → `supabase.auth.signOut()` — não limpa outros contextos explicitamente; depende de refresh de página ou reset de state.
- **Nota:** admin usa `useAdminAuth` separado — coexistem duas superfícies de auth no mesmo Supabase project.

### OrganizationContext (`OrganizationContext.tsx`)

- Estado: `organization`, `userProfile`, `locale`, `loading`, `error`, `hasOrganization`, `refetch`.
- Depende de `useAuth()` — dispara `fetchData` quando `user.id` muda.
- `fetchData` lê `users`, `user_organizations`, `organizations` via cliente autenticado (RLS).
- Expõe flags de tema (`theme_primary_color`, `theme_sidebar_color`, `theme_dark_mode`) e módulos (`enable_companies_module`, `cs_inbox_includes_service_endpoints`) usadas pelo restante da UI para visibilidade condicional.
- `is_platform_admin` no `userProfile` sinaliza visibilidade cross-org (memory `users/admin-management-and-visibility`).

### OutboundCallContext (`OutboundCallContext.tsx` + subdir `outbound-call/`)

- Detecta rota `/admin/*` via `useLocation()` e **desativa** o device Twilio nessas rotas (memory `integrations/twilio-voice-security-isolation`).
- Estado da chamada: `status`, `callInfo`, `duration`, `isMuted`, `dtmfDigits`, `errorMessage`, `isMinimized`, `isDeviceReady`, `hasVoiceIntegration`, `voiceLoading`.
- Obtém token via `getTwilioAccessToken` (`@/lib/authSession`) → chama edge function `twilio-token`.
- Registrar SDK em `TwilioDevice` — inicialização assíncrona; refs para manter instâncias entre renders (padrão correto).
- `<InboundCallHandler>` / `<OutboundCallHandler>` são componentes lazy montados apenas quando `hasVoiceIntegration=true`.

### ThemeContext (`ThemeContext.tsx`)

- Depende de `useOrganization()`.
- Estado: `primaryColor`, `sidebarColor`, `darkMode`, `themePreset` (`'default' | 'seialz'`).
- Sincroniza com `organization.theme_*` sempre que `organization.id` muda (evita loop).
- `theme_preset` lido via cast `as any` — coluna pode ainda não estar no schema tipado (memory `design-system/seialz-theme-persistence`).
- Aplica CSS variables via mutação direta em `document.documentElement.style` (padrão do projeto para tokens HSL).

## Estado de servidor (react-query)

- `QueryClient` inicializado em `App.tsx`.
- Uso concentrado em Marketing (`src/pages/marketing/_hooks/*`) — resto da app usa `useState`/`useEffect` diretos. Dívida arquitetural relevante.

## Estado local por página

- `src/hooks/usePersistedFilters.ts` — persistência de filtros em `localStorage` por chave de página.
- Kanban de oportunidades tem estado próprio de scroll infinito (memory `features/opportunities/kanban-infinite-scroll-performance`).
- Inbox mantém estado de scroll/queue no `useInboxThreads`.

## Realtime / assinaturas

- Toda subscrição `supabase.channel(...)` ocorre em `useEffect` com cleanup `removeChannel` — sem vazamento aparente.
- `useMessageThreads`, `useInboundCalls`, `useInboxThread*`, `useMessageThreads` são os principais consumidores.
- Denormalização em `message_threads.last_message_*` (memory `messages/performance-denormalization-strategy`) reduz necessidade de refetch.

## Observações / dívida

- **Duas superfícies de auth** (`AuthContext` vs `useAdminAuth`) sobre o mesmo Supabase — funcional, mas obriga guardas em vários lugares para não vazar sessão user↔admin. `OutboundCallProvider` já trata desativação em `/admin/*`; verificar se outros contextos (Theme, Organization) ignoram rotas admin corretamente ou apenas ficam ociosos.
- `ThemeContext` cast `as any` para `theme_preset` — regenerar `src/integrations/supabase/types.ts` após migração pendente.
- react-query subutilizado — expandir uso é dívida de baixo risco e alto payoff.
- Sem `ErrorBoundary` global visível em `App.tsx` (verificar `src/components/common/`). Falhas em contextos podem quebrar a árvore inteira.
- `signOut` no `AuthContext` não reseta `OrganizationContext`/`ThemeContext` manualmente — depende de reload ou de reação a `user=null`. Verificar se causa flashes de tema/org antiga.
