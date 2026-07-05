# Auditoria — Parte 1 / Visão Geral

Fonte: leitura direta de `package.json`, `src/`, `supabase/`. Nada aqui foi inferido.

## 1.1 Stack e versões (de `package.json`)

**Runtime / build**
- Node engine: `24.x`
- Vite 5 (`type: module`)
- TypeScript (`tsconfig.app.json` + `tsconfig.node.json`)
- Bun lockfile presente (`bun.lock`, `bunfig.toml`)

**Frontend core**
- `react` ^18.3.1 / `react-dom` ^18.3.1
- `react-router-dom` ^6.30.1
- `@tanstack/react-query` ^5.83.0
- `react-hook-form` ^7.61.1 + `@hookform/resolvers` ^3.10.0
- `framer-motion` ^12.24.10
- `next-themes` ^0.3.0

**UI**
- Radix UI (~30 pacotes `@radix-ui/*`)
- shadcn (config em `components.json`)
- `tailwind-merge`, `tailwindcss-animate`, `tailwindcss-react-aria-components@1.2.0`
- `react-aria-components` ^1.14.0, `@react-aria/focus`
- Ícones: `lucide-react`, `@phosphor-icons/react`, `@untitledui/icons`
- `cmdk`, `sonner`, `embla-carousel-react`, `emoji-picker-react`, `input-otp`, `react-day-picker`, `react-image-crop`, `react-resizable-panels`, `recharts`, `@hello-pangea/dnd`

**Backend / infra / instrumentação**
- `@supabase/supabase-js` ^2.108.2
- `@twilio/voice-sdk` ^2.17.0 (WebRTC no cliente)
- `@sentry/react` ^10.59.0 + `@sentry/vite-plugin` ^5.3.0 (`src/instrument.ts`)
- `dompurify` ^3.4.11
- `opus-media-recorder` ^0.8.0
- `date-fns` ^4.1.0

**Outros configs presentes**: `vercel.json`, `eslint.config.js`, `postcss.config.js`, `tailwind.config.ts`, `.env` + `.env.example`, `.lovable/`, `.workspace/`.

## 1.2 Árvore de pastas (2 níveis)

### Raiz
| Path | Propósito |
|---|---|
| `src/` | Frontend React |
| `supabase/` | Edge functions + migrations + config |
| `docs/` | Documentação markdown do projeto |
| `public/` | Assets estáticos servidos pelo Vite |
| `.lovable/`, `.workspace/` | Metadados da plataforma Lovable |
| `index.html`, `vite.config.ts`, `tailwind.config.ts`, `vercel.json`, `tsconfig*` | Configuração de build/deploy |

### `src/`
| Path | Propósito |
|---|---|
| `src/App.tsx` | Root com providers (Auth/Org/Theme/QueryClient) e definição de rotas |
| `src/App.stub.tsx` | [INCERTO] Stub — provavelmente ambiente sem backend/preview |
| `src/main.tsx` | Bootstrap React |
| `src/instrument.ts` | Init Sentry |
| `src/index.css` | Tokens/CSS globais (design system Seialz) |
| `src/assets/` | Logos e imagens de referência do produto |
| `src/components/` | 255 componentes React; subpastas por domínio |
| `src/contexts/` | `AuthContext`, `OrganizationContext`, `OutboundCallContext` (+ subpasta), `ThemeContext` |
| `src/hooks/` | 37 hooks + subpastas `contacts/`, `documents/`, `inbox/` |
| `src/integrations/supabase/` | Cliente Supabase + `types.ts` gerado |
| `src/lib/` | Utilitários (compliance, telefone, endpoints, janela 24h, media proxy, etc) |
| `src/pages/` | 63 páginas rotéaveis; subpastas por domínio |
| `src/services/` | `metaWhatsAppService.ts`, `whatsapp.ts` |

### `supabase/`
| Path | Propósito |
|---|---|
| `supabase/config.toml` | Config Supabase |
| `supabase/migrations/` | 261 migrations SQL |
| `supabase/functions/` | 90 edge functions Deno |
| `supabase/functions/_shared/` | Módulos compartilhados |

### `supabase/functions/_shared/`
| Arquivo/Pasta | Propósito |
|---|---|
| `auth.ts` | Helpers de auth/JWT nas functions |
| `cors.ts` | Headers CORS reutilizáveis |
| `crypto.ts` + `crypto.test.ts` | Cripto (BYOK / assinaturas) — com teste Deno |
| `dispatch-whatsapp-send.ts` | Dispatcher central de envio WhatsApp (multi-provider) |
| `endpoint-migration-note.ts` | [INCERTO] Nota/utilitário sobre migração de endpoints |
| `feature-flags.ts` | Leitura de feature flags |
| `integration-handlers/` | Handlers do pipeline `integration_inbound_events` |
| `intelligence/` | Módulos do subsistema de intelligence |
| `meta-graph.ts` | Cliente Meta Graph API |
| `meta-token.ts` | Gestão de tokens Meta |
| `meta-whatsapp/` | Helpers WhatsApp Cloud API |
| `notify.ts` | Notificações internas (`admin_notifications`) |

## 1.3 Contagens

| Item | Quantidade |
|---|---|
| Páginas (`.tsx` em `src/pages/`) | 63 |
| Componentes (`.tsx` em `src/components/`) | 255 |
| Hooks no nível raiz de `src/hooks/` | 37 + 3 subpastas |
| Edge functions | 90 (excluindo `_shared/`) |
| Arquivos em `_shared/` | 9 + 3 subpastas |
| Migrations SQL | 261 |
| Contexts globais | 4 (Auth, Organization, OutboundCall, Theme) |
| Serviços cliente | 2 |

## 1.4 Categorias de edge functions (por prefixo)

- **admin-** (4): impersonate x3, list-orgs-for-switch
- **ai-** (2): agent-respond, generate
- **byok-** (5): revoke/rotate/set/test/update-policy
- **intelligence-** (5): backfill-runner, ghosting-detector, retention-cron, rollup-cron, worker
- **knowledge / wizard** (12): apply-knowledge-edit, enhance-knowledge, generate-embedding, import-knowledge, knowledge-edit, knowledge-wizard, process-knowledge, process-knowledge-item, reprocess-knowledge, synthesize-knowledge, wizard-generate-content, wizard-next-question
- **kommo-** (7): fetch-pipelines, fix-owners, media-download, migrate, preview, rollback, validate
- **marketing / meta-ads / meta-capi / meta-lead-ads** (~15+)
- **meta-whatsapp / meta-wa** (8): connect, disconnect, send, templates-create, templates-sync, verify, webhook, wa-diagnose
- **twilio-** (9): call, media-proxy, setup, token, webhook, whatsapp-send, whatsapp-setup, whatsapp-templates, whatsapp-webhook
- **nammux-** (4): audit, download-attachment, replay-opportunity, test-connection
- **utilitários / outros**: analyze-message, backfill-attribution, classify-agent-feedback, create-user, ct-backfill-once, export-conversations, fix-orphan-opportunities, health, import-from-url, integration-inbound-dispatcher, integration-worker, lead-webhook, migrate-legacy-ai-key, outbox-health, scheduled-messages-cron, suvsign-webhook, transcribe-audio, viagi-staging-loader
