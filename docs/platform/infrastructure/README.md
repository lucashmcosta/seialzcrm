# Platform — Infrastructure

**Fonte:** `docs/audit/01-overview.md`, `06-cron-automacoes.md`.

## Componentes
| Componente | Onde |
|---|---|
| Frontend SPA | Vercel (`vercel.json`) |
| Backend BaaS | Supabase (Postgres + Auth + Storage + Edge Functions Deno) |
| Cron | `pg_cron` + `pg_net` no próprio Postgres |
| Mensageria externa | Railway (memory `whatsapp-railway-migration-v2`) |
| Erro tracking | Sentry (frontend) |
| CDN de mídia WhatsApp | Twilio + `twilio-media-proxy` |

## Cron jobs (14)
Ver `docs/audit/06-cron-automacoes.md`.

## Configurações
- `supabase/config.toml` — Supabase config.
- `vite.config.ts` — build frontend.
- `tailwind.config.ts` — design system.
- `vercel.json` — deploy Vercel.
- `.env` — auto-populado com `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_SUPABASE_PROJECT_ID`.

## Storage
- Buckets por org, path prefixado com `organization_id/`.
- RLS aplicada.
- Buckets prováveis: `attachments`, `logos`, `call-recordings`, `voice-audio` (verificação pendente).
