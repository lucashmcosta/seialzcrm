# Mapa de navegação

Baseado em `src/App.tsx`. Guards por prefixo:

```
/                       público  → LandingOrImpersonationFallback
/auth/*                 público  → SignIn / SignUp / ConfirmEmail
/invite/:token          público  → AcceptInvitation
/impersonate/callback   público  → ImpersonateCallback
/health, /dev/health    público
/docs*                  público

/admin/login            público  → login separado
/admin/mfa-setup        público  (mas exige sessão admin)
/admin/*                AdminProtectedRoute + MFA obrigatório

(demais)                ProtectedRoute (AuthContext)
```

## CRM (autenticado)

```
Layout / MobileLayout
├── /dashboards
├── /contacts[/new|/:id|/:id/edit]
├── /companies[/new|/:id|/:id/edit]
├── /opportunities   (Kanban)
├── /opportunities/:id
├── /tasks
├── /messages        (legacy)
├── /inbox           (Inbox v2 — feature-flag)
├── /marketing[/ads|/ads/:id|/funnel|/timeline]
├── /whatsapp/templates[/new|/:id|/:id/edit]
├── /profile
└── /settings/*      (SettingsLayout com breadcrumbs)
```

## Admin

```
AdminLayout
├── /admin                       (Dashboard)
├── /admin/organizations[/:id]
├── /admin/logs
├── /admin/users
├── /admin/feature-flags
├── /admin/security
├── /admin/impersonations
├── /admin/plans
├── /admin/coupons
├── /admin/integrations[/:id]
├── /admin/integration-health
├── /admin/documentation[/:module]
└── /obs, /admin/obs
```

## Providers globais (ordem em `App.tsx`)

```
QueryClientProvider
└── TooltipProvider
    └── BrowserRouter
        └── AuthProvider
            └── OrganizationProvider
                └── OutboundCallProvider   (desativa Twilio Voice em /admin/*)
                    └── ThemeProvider
                        └── <Routes>
```
