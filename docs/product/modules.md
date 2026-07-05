# Módulos do produto

Extraído das rotas registradas em `src/App.tsx` e das páginas em `src/pages/`.

## CRM (usuário final — layout `Layout` / `MobileLayout`)

| Módulo | Rotas principais | Página raiz |
|---|---|---|
| Dashboard | `/dashboards` | `src/pages/Dashboard.tsx` |
| Contatos | `/contacts`, `/contacts/new`, `/contacts/:id`, `/contacts/:id/edit` | `src/pages/contacts/` |
| Empresas | `/companies`, `/companies/new`, `/companies/:id`, `/companies/:id/edit` | `src/pages/companies/` |
| Oportunidades | `/opportunities` (Kanban), `/opportunities/:id` | `src/pages/opportunities/` |
| Tarefas | `/tasks` | `src/pages/tasks/TasksList.tsx` |
| Mensagens (legacy) | `/messages` | `src/pages/` (MessagesList) |
| Inbox v2 | `/inbox` — flag off até cutover (memory `features/inbox-v2/status-2026-06-11`) | `src/pages/inbox/InboxPage.tsx` |
| Marketing | `/marketing`, `/marketing/ads`, `/marketing/ads/:id`, `/marketing/funnel`, `/marketing/timeline` | `src/pages/marketing/` |
| WhatsApp Templates | `/whatsapp/templates[/new|/:id|/:id/edit]` | `src/pages/whatsapp/` |
| Perfil | `/profile` | `src/pages/Profile.tsx` |

## Settings (aninhado em `/settings/*`)

Layout `SettingsLayout` (breadcrumbs, sem headers próprios). Sub-rotas:

`general`, `theme`, `users`, `permissions`, `billing`, `pipeline`, `duplicates`, `custom-fields`, `tags`, `documents`, `integrations`, `customer-service`, `whatsapp-templates`, `whatsapp-snippets`, `ai-agent`, `ai-providers`, `intelligence`, `api-webhooks`, `products`, `knowledge-base`, `edit-kb`, `audit-logs`, `round-robin`, `trash`.

## Admin (`AdminProtectedRoute` — layout `AdminLayout`, MFA obrigatório)

Rotas: `/admin`, `/admin/organizations[/:id]`, `/admin/logs`, `/admin/users`, `/admin/feature-flags`, `/admin/security`, `/admin/impersonations`, `/admin/plans`, `/admin/coupons`, `/admin/integrations[/:id]`, `/admin/integration-health`, `/admin/documentation[/:module]`, `/obs`, `/admin/obs`.

## Público

`/`, `/health`, `/dev/health`, `/docs*`, `/auth/*`, `/invite/:token`, `/impersonate/callback`.
