# Multi-Tenancy — Modelo e RLS

## Modelo

- Cada usuário vive em `users` (com `auth_user_id` → `auth.users`). **Nunca usar `auth.uid()` diretamente em relacionamentos** — usar `users.id` (memory Core).
- Vínculo usuário↔organização em `user_organizations` (colunas: `user_id`, `organization_id`, `role`, ...).
- Perfis de permissão em `permission_profiles`, atribuídos via `user_organizations`.
- Organizações em `organizations` (theme, feature flags de módulo).

## Funções SECURITY DEFINER (base do RLS)

- `current_user_id()` — retorna `users.id` a partir de `auth.uid()`.
- `current_user_org_ids()` — array de UUIDs de organizações do usuário atual. Uso via `organization_id = ANY(current_user_org_ids())` para força InitPlan e evitar per-row (memory Core).
- `has_role(_user_id, _role)` — checagem de role sem recursão.
- `get_internal_function_auth_token()` — token para chamadas edge→edge autenticadas.

## Convenção de RLS

Todas as tabelas de negócio (`contacts`, `opportunities`, `messages`, `message_threads`, `activities`, `tasks`, `custom_field_values`, `attachments`, etc.) têm política do formato:

```sql
using (organization_id = ANY(current_user_org_ids()))
with check (organization_id = ANY(current_user_org_ids()))
```

Grants padrão: `SELECT/INSERT/UPDATE/DELETE` para `authenticated`; `ALL` para `service_role`; **sem `anon`** (memória de segurança).

## Superadmin (`is_platform_admin`)

- Coluna `users.is_platform_admin` marca admin de plataforma.
- Admin sessions em `admin_users` (auth separada) + MFA obrigatório.
- Impersonação: `impersonation_sessions` grava sessão ativa; policies em várias tabelas incluem `OR EXISTS (SELECT 1 FROM impersonation_sessions WHERE ...)` para permitir leitura cross-org durante impersonação.
- Audit: toda ação admin/impersonação vai para `admin_audit_logs`.

## Isolamento por canal

- `communication_endpoints` scopeda por org — webhooks Meta/Twilio precisam olhar `waba_id`/`messaging_service_sid` para descobrir org destino (memory `integrations/twilio-whatsapp-cross-org-routing`).
- Voice: OutboundCallProvider desativa em `/admin/*` para não vazar device entre orgs (memory `integrations/twilio-voice-security-isolation`).
- WhatsApp templates: admin only por design (memory `whatsapp/template-management-system-v3`).

## Storage

- Buckets com policies replicando o padrão `organization_id = ANY(current_user_org_ids())` no path (`org_id/...`).
- [INCERTO] verificar buckets `attachments`, `logos`, `call-recordings`, `voice-audio` na próxima seção de storage (não coberta neste bloco).

## Pontos frágeis conhecidos

- **`kommo-fetch-pipelines`/`kommo-preview`** aceitam `subdomain` do body sem sanitização — memory alerta sobre isso; risco de SSRF no lado servidor da org própria.
- **`kommo-media-download`/`nammux-download-attachment`** fazem `fetch(URL)` de origem externa sem allowlist de host — risco SSRF entre orgs.
- **`import-from-url`** — mesmo padrão SSRF; usuário pode fornecer URL arbitrária.
- **`viagi-staging-loader`** — table name versionada (`viagi_csv_staging_2026_05_28`) foge do padrão multi-tenant; verificar RLS.

## Backfills sensíveis

Tabelas `backup_*` e `*_backfill_*` (visíveis na lista `<supabase-tables>`) — várias com apenas 1 política. Verificar se são read-only ou se ainda estão em uso. Podem ser candidatas a arquivamento.

## Convenções para o frontend

- Toda leitura via `@/integrations/supabase/client` (JWT do usuário) — RLS aplica.
- Componentes admin usam mesma client, mas as tabelas admin_* têm política própria baseada em `admin_users`.
- Impersonação: cliente continua o mesmo (JWT admin), mas `impersonation_sessions` amplia leitura via policies.

## Recomendações

1. Sanitizar subdomínios/URLs em todos os `fetch` externos de edge functions (Kommo, Nammux, `import-from-url`).
2. Auditoria de `backup_*` e `*_backfill_*` — remover as concluídas.
3. Confirmar que toda tabela nova incluída no schema tem `GRANT` explícito para `authenticated` + `service_role` (memory Core).
4. Formalizar convenção "sem `anon` para tabelas de negócio" via checklist de migration.
