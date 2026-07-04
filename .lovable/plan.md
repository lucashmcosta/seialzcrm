# Plano: docs/MOBILE_APP_BACKEND.md

Consolidar em um único markdown versionado tudo que o app React Native/Expo precisa para consumir o mesmo Supabase do Seialz CRM. Sem alterações de código no repo web — apenas documentação.

## Estrutura do arquivo

### 1. Credenciais públicas
- `EXPO_PUBLIC_SUPABASE_URL` = `https://qvmtzfvkhkhkhdpclzua.supabase.co`
- `EXPO_PUBLIC_SUPABASE_ANON_KEY` = anon JWT (o mesmo do `.env` do web, safe para browser/mobile)
- `EXPO_PUBLIC_SUPABASE_PROJECT_ID` = `qvmtzfvkhkhkhdpclzua`
- Aviso explícito: nunca embarcar `service_role`.

### 2. Schema (fonte da verdade)
- Instrução para o app copiar `src/integrations/supabase/types.ts` do repo web tal-e-qual (regerado pelo Supabase, não editar).
- Colar SQL completo de `current_user_id()` e `current_user_org_ids()` obtidos via `pg_proc` (SECURITY DEFINER, search_path).
- Colar SQL de `has_role()` e `has_org_role()` (helpers referenciados nas RLS).

### 3. RLS das tabelas-alvo
Para cada uma das 17 tabelas (`users`, `organizations`, `user_organizations`, `permission_profiles`, `contacts`, `companies`, `communication_endpoints`, `tags`, `tag_assignments`, `message_threads`, `messages`, `message_thread_reads`, `whatsapp_templates`, `opportunities`, `pipeline_stages`, `tasks`, `activities`):
- Resumo de 1–2 frases em PT-BR: quem lê, quem escreve, sob que condição.
- Dump SQL bruto extraído de `pg_policies` (policyname, cmd, roles, USING, WITH CHECK).

Consulta a ser usada:
```sql
select tablename, policyname, cmd, roles, qual, with_check
from pg_policies
where schemaname = 'public' and tablename = any(array[...])
order by tablename, policyname;
```

### 4. Código de referência (colado na íntegra)
- `src/lib/authSession.ts`
- `src/contexts/AuthContext.tsx`
- `src/contexts/OrganizationContext.tsx`
- `src/hooks/usePermissions.ts`
- `src/lib/dispatchWhatsAppSend.ts`
- `src/lib/phoneUtils.ts`

Nota curta em cada bloco sobre o que precisa mudar no Expo (ex.: `localStorage` → `AsyncStorage` no client Supabase; `useQuery` do React Query igual; sem mudanças em `phoneUtils`).

### 5. Edge functions e RPCs (escopo v1 mobile)
Inventário apenas das relevantes para o mobile v1, com propósito + assinatura input/output:
- `twilio-token` — mint de Twilio Access Token para chamadas WebRTC.
- `twilio-whatsapp-send` — envio via Twilio (fallback legado).
- `meta-whatsapp-send` — envio via Meta Cloud (preferencial).
- `dispatchWhatsAppSend` — não é edge function; documentar como cliente-side router e mostrar payload aceito (`WhatsAppSendPayload` do arquivo).
- `fn_feature_flag_enabled` — RPC de feature flag por org.
- `has_role`, `has_org_role` — RPCs de checagem de papel.

Cada entrada: caminho, método (POST/RPC), request body TypeScript, response TypeScript, notas de auth (JWT do usuário obrigatório, RLS aplicada dentro da função via `SUPABASE_SERVICE_ROLE_KEY` interno).

## Como o conteúdo será coletado (read-only, em modo plano seria só planejar; execução acontece em build)
- `supabase--read_query` em `pg_proc` para as 4 funções SECURITY DEFINER.
- `supabase--read_query` em `pg_policies` para as 17 tabelas.
- `code--view` nos 6 arquivos de código de referência + `src/integrations/supabase/types.ts`.
- `code--list_dir supabase/functions/` para filtrar as 6 relevantes e `code--view` nas signatures (topo dos `index.ts`).

## Entregável
Um único arquivo novo: `docs/MOBILE_APP_BACKEND.md`. Nenhuma alteração em código, schema ou edge function.
