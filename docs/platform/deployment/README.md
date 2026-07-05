# Platform — Deployment

## Frontend
- Vercel — deploy automático a partir do repositório.
- Build: `vite build`.
- Source maps enviados para Sentry via `@sentry/vite-plugin`.

## Edge functions
- Deploy automático pela plataforma Lovable ao editar arquivos em `supabase/functions/`.
- Não é necessário `supabase functions deploy` manual.

## Migrations
- Escrever via ferramenta de migration (nunca criar/editar `supabase/migrations/` diretamente).
- `supabase/migrations/` é gerido pela ferramenta.

## Env vars
- Frontend: `.env` (auto-populado com credenciais Supabase).
- Edge functions: gerenciar via `add_secret` (Lovable) — disponível em `Deno.env.get(...)`.

## URLs do projeto
- Preview: https://id-preview--3e7cbf89-7e65-4eb1-ae96-6b6359aa6e47.lovable.app
- Publicado: https://seialzcrm.lovable.app
- Custom domain: https://seialz.com

## PWA
- `public/manifest.webmanifest`, `public/service-worker.js`, `public/sw.js`.
- Update notification: memory `architecture/pwa-update-notification-system`.
