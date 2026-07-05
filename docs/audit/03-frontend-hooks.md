# Frontend — Hooks

Localização: `src/hooks/` (32 hooks + 3 subdiretórios: `contacts/`, `documents/`, `inbox/`).

## Convenções

- Todos leem dados via `@/integrations/supabase/client` (JWT do usuário, RLS aplica).
- Data fetching quase todo por chamadas diretas `supabase.from(...)`; **`@tanstack/react-query` está instalado e configurado no `App.tsx` mas os hooks usam `useState`/`useEffect` puros na maioria dos casos**. Uso real do react-query restrito a algumas páginas Marketing (`src/pages/marketing/_hooks/*`). Divergência arquitetural notável.
- Realtime: hooks assinam `supabase.channel(...)` dentro de `useEffect` com `removeChannel` no cleanup (padrão respeitado; ver `useMessageThreads`, `useInboundCalls`).

## Autenticação / Organização / Permissões

| Hook | Função | Dependências |
|---|---|---|
| `useAuth.ts` | Re-export de `useAuthContext` | `AuthContext` |
| `useAdminAuth.ts` | Sessão admin + MFA | `supabase.auth`, tabela `admin_users` |
| `useOrganization.ts` | Re-export de `useOrganizationContext` | `OrganizationContext` |
| `usePermissions.ts` | Carrega `permission_profiles` do usuário; expõe helpers `can(action, resource)` | `user_organizations`, `permission_profiles` |
| `useSingleSession.ts` | Impõe device-based single-session (memory `integrations/single-session-device-based`) | `user_sessions` |

## Integrações / provedores (visibilidade condicional)

Memory `integrations/conditional-feature-visibility` — cada hook determina se um recurso deve aparecer.

- `useAIIntegration.ts` — verifica provider AI ativo em `organization_integrations`.
- `useAIProviders.ts` — lista providers habilitados (Claude/OpenAI/Gemini).
- `useAI.ts` — helper para chamar edge functions `ai-generate` / `ai-agent-respond`.
- `useVoiceIntegration.ts` — Twilio Voice ativo?
- `useWhatsAppIntegration.ts` — WhatsApp ativo (Meta ou Twilio).
- `useWhatsAppProvider.ts` — provider preferido, memory `integrations/whatsapp-outbound-number-prioritization`.
- `useActiveWhatsAppProviders.ts` — lista providers ativos por org.
- `useOrgWhatsAppEndpoints.ts` — endpoints (`communication_endpoints`) da org.
- `useWhatsAppTemplates.ts` — templates aprovados (`whatsapp_templates`).

## Mensageria / Inbox

Diretório `src/hooks/inbox/`:

- `inboxScope.ts` — helpers puros de escopo (queue/team/user).
- `useInboxQueueCounts.ts` — contagens agregadas por queue.
- `useInboxThreads.ts` — lista threads com cursor (memory `messages/rpc-list-threads-pagination`).
- `useInboxThread.ts` — thread individual + realtime.
- `useInboxThreadMessages.ts` — mensagens da thread + realtime + polling fallback (memory `features/mobile/messages-view-logic`).

Raiz:

- `useMessageThreads.ts` — legacy list para `/messages`.
- `useThreadBusinessContext.ts` — contexto de negócio (memory backfills).
- `useThreadEndpointMap.ts` — endpoint por thread.
- `useHiddenThreads.ts` — threads ocultadas pelo usuário.
- `useSnippets.ts` — snippets WhatsApp.

## Contatos / documentos

- `src/hooks/contacts/useContactConversationsByContext.ts` — conversas agrupadas por contexto.
- `src/hooks/documents/useContactDocuments.ts`, `useDocumentTypes.ts` — documentos e tipos.

## Serviço / SLA / Chamadas

- `useServiceStats.ts`, `useServiceWindow.ts`, `useServiceWorstResponses.ts` — métricas de atendimento (janela configurável).
- `useInboundCalls.ts` — feed realtime de chamadas Twilio inbound.

## Migração / integrações admin

- `useKommoMigration.ts` — orquestra `kommo-preview` → `kommo-migrate` → `kommo-rollback`.

## UI / infra

- `use-mobile.tsx` — `useIsMobile` com inicialização síncrona por `window.innerWidth` (memory `development/use-is-mobile-sync-initialization`).
- `use-toast.ts` — shadcn toast.
- `useSpeechToText.ts` — cliente do edge function `transcribe-audio`.
- `useVersionCheck.ts` — polling de nova versão + prompt (memory `architecture/pwa-update-notification-system`).
- `usePersistedFilters.ts` — persistência de filtros por página em `localStorage`.

## Observações / dívida

- **Ausência de react-query na maior parte dos fetches.** Muitos hooks reimplementam loading/error/refetch manualmente. Migração incremental para react-query traria cache, dedupe, invalidação e reduziria bugs de "stale data".
- Alguns hooks (`useOrganization`, `useAuth`) são só wrappers do contexto — poderiam ser removidos e usar contexto direto, mas o wrapper preserva compatibilidade histórica.
- `useAdminAuth` roda `checkAuth` + `onAuthStateChange` — cuidado com race conditions durante MFA setup (`mfaRequired` é state local).
- Nenhum hook expõe `service_role_key` — todos JWT do usuário.
- Realtime bem contido em `useEffect`+cleanup; sem vazamento aparente.
- Diretórios `src/hooks/inbox/*` são o padrão mais moderno; considerar mover outros hooks para subpastas por domínio.
