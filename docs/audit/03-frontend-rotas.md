# Frontend — Rotas

Fonte: `src/App.tsx` (arquivo único). Roteador: `react-router-dom` v6 (`BrowserRouter`). Todas as páginas CRM/admin (exceto SignIn/SignUp/Health/Landing/Docs) usam `React.lazy` com wrapper `retryImport` para recuperação de chunk após deploy (memory `architecture/dynamic-import-resilience`).

## Providers (ordem em `App.tsx`)

```
QueryClientProvider (react-query)
└── TooltipProvider
    └── BrowserRouter
        └── AuthProvider
            └── OrganizationProvider
                └── OutboundCallProvider
                    └── ThemeProvider
                        └── <Routes>
```

`OutboundCallProvider` desativa Twilio Voice em rotas `/admin/*` (verificação por `useLocation()` interna).

## Guards

- `ProtectedRoute` (definido em `App.tsx`, linhas ~154): exige `isAuthenticated` do `AuthContext`. Redireciona para `/auth/signin` se ausente.
- `AdminProtectedRoute` (`src/components/admin/AdminProtectedRoute.tsx`, lazy): valida via `useAdminAuth` — leitura de `admin_users` + sessão Supabase. Redireciona para `/admin/login`. MFA obrigatório: se `mfa_enabled=false` ou `mfa_setup_completed_at=null`, força `/admin/mfa-setup`.

## Rotas públicas

| Rota | Componente | Observação |
|---|---|---|
| `/` | `LandingOrImpersonationFallback` | Mostra `LandingPage` ou callback de impersonação |
| `/health` | `Health` | endpoint público |
| `/dev/health` | `DevHealth` | detalhado |
| `/docs` `/docs/api` `/docs/:module` | `DocsIndex`/`ApiDocs`/`DocsModule` | públicos |
| `/auth/signup` `/auth/signin` `/auth/confirm-email` | Auth pages | `ResponsiveSignIn` alterna mobile/desktop |
| `/invite/:token` | `AcceptInvitation` | fluxo de convite |
| `/impersonate/callback` | `ImpersonateCallback` | destino do `admin-impersonate` |

## Rotas admin (`AdminProtectedRoute`)

`/admin/login`, `/admin/mfa-setup` (sem guard), `/admin` (Dashboard), `/admin/organizations`, `/admin/organizations/:id`, `/admin/logs`, `/admin/users`, `/admin/feature-flags`, `/admin/security`, `/admin/impersonations`, `/admin/plans`, `/admin/coupons`, `/admin/integrations`, `/admin/integrations/:id`, `/admin/integration-health`, `/admin/documentation`, `/admin/documentation/:module`, `/obs`, `/admin/obs`.

Layout: `AdminLayout` (memory `design-system/layouts-mandatory`).

## Rotas CRM (`ProtectedRoute`)

Layout: `Layout` (desktop) ou `MobileLayout` (via `useIsMobile`).

| Grupo | Rotas |
|---|---|
| Contacts | `/contacts`, `/contacts/new`, `/contacts/:id`, `/contacts/:id/edit` |
| Companies | `/companies`, `/companies/new`, `/companies/:id`, `/companies/:id/edit` |
| Opportunities | `/opportunities` (Kanban), `/opportunities/:id` |
| Tasks | `/tasks` |
| Messages | `/messages` (MessagesList) — legacy CRM WhatsApp |
| Inbox | `/inbox` — [INCERTO] "Inbox v2" (memory `features/inbox-v2/status-2026-06-11`), flag off até cutover |
| Reports | `/dashboards`, `/reports` (redirect → `/dashboards`) |
| Marketing | `/marketing`, `/marketing/ads`, `/marketing/ads/:id`, `/marketing/funnel`, `/marketing/timeline` |
| WhatsApp Templates | `/whatsapp/templates[/new|/:id|/:id/edit]` |
| Profile | `/profile` |

## Settings (rotas aninhadas)

`/settings` monta `SettingsLayout` (outlet). Índice `SettingsGrid`. Sub-rotas:

`general`, `theme`, `users`, `permissions`, `billing`, `pipeline`, `duplicates`, `custom-fields`, `tags`, `documents`, `integrations`, `customer-service`, `whatsapp-templates`, `whatsapp-snippets`, `ai-agent`, `ai-providers`, `intelligence`, `api-webhooks`, `products`, `knowledge-base`, `edit-kb`, `audit-logs`, `round-robin`, `trash`. Fallback: `Navigate → /settings`.

Breadcrumbs somente — sem headers próprios (memory `architecture/settings-nested-routes-and-breadcrumbs`).

## 404

`<Route path="*" element={<NotFound />}` no fim.

## Observações / dívida

- Todas as rotas em um único arquivo (`App.tsx`, ~600+ LOC). Sem code-splitting por feature module (só por página). Refatoração natural: extrair `AdminRoutes`, `SettingsRoutes`, `MarketingRoutes` para arquivos próprios.
- `/reports` mantido apenas como redirect — pode ser removido após 1 ciclo.
- `retryImport` recarrega a página inteira (`window.location.reload`) no fallback — funciona mas perde estado; aceitável para chunk expirado.
- Mobile: componentes específicos em `src/components/mobile/` são acionados por `useIsMobile` dentro dos containers, não por rotas separadas. Não há bifurcação de router mobile/desktop.
