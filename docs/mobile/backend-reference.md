# Seialz — Backend reference para o app mobile (React Native / Expo)

Documento único que reúne tudo que o app Expo precisa para consumir o **mesmo** Supabase do CRM web. Nenhuma alteração aqui altera o backend — é referência para replicar comportamento.

**Fonte da verdade:** este repo web. Se algo aqui divergir de `src/`, o repo web ganha.

---

## 1. Credenciais públicas do Supabase

Só usar chaves públicas no app. **Nunca** embarcar `service_role`.

```
EXPO_PUBLIC_SUPABASE_URL=https://qvmtzfvkhkhkhdpclzua.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InF2bXR6ZnZraGtoa2hkcGNsenVhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQzODM3MzIsImV4cCI6MjA3OTk1OTczMn0.7uhE97klvxSwYrJMu_NYIaNCLBaIUhFNtcF2oRLYRUE
EXPO_PUBLIC_SUPABASE_PROJECT_ID=qvmtzfvkhkhkhdpclzua
```

### Cliente Supabase no Expo

O client web usa `localStorage`. No Expo troque por `AsyncStorage`:

```ts
import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import type { Database } from './types';

export const supabase = createClient<Database>(
  process.env.EXPO_PUBLIC_SUPABASE_URL!,
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!,
  {
    auth: {
      storage: AsyncStorage,
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false, // RN não tem URL
    },
  }
);
```

---

## 2. Schema — fonte da verdade

### 2.1 Types TypeScript

Copie **tal-e-qual** do repo web: `src/integrations/supabase/types.ts` (arquivo autogerado pelo Supabase, ~8800 linhas). **Nunca edite manualmente.** Sempre que o schema mudar, regere pelo CLI do Supabase e substitua o arquivo nos dois projetos (web e mobile).

### 2.2 Helpers SECURITY DEFINER usados nas RLS

Toda RLS do projeto depende destas funções. Elas rodam com privilégios elevados (bypass de RLS) e resolvem o `users.id` interno a partir do `auth.uid()` do Supabase Auth.

**Regra central do projeto:** relações usam `users.id` (interno), **nunca** `auth.uid()`.

```sql
CREATE OR REPLACE FUNCTION public.current_user_id()
 RETURNS uuid
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  user_uuid uuid;
BEGIN
  SELECT id INTO user_uuid
  FROM public.users
  WHERE auth_user_id = auth.uid()
  LIMIT 1;
  RETURN user_uuid;
END;
$function$;

CREATE OR REPLACE FUNCTION public.current_user_org_ids()
 RETURNS uuid[]
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
 SET row_security TO 'off'
AS $function$
  SELECT COALESCE(array_agg(uo.organization_id), '{}'::uuid[])
  FROM public.user_organizations uo
  WHERE uo.user_id = public.current_user_id()
    AND uo.is_active = true
$function$;

CREATE OR REPLACE FUNCTION public.user_has_org_access(org_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM user_organizations uo
    WHERE uo.organization_id = org_id
      AND uo.user_id = public.current_user_id()
      AND uo.is_active = true
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.is_org_admin(_org_id uuid)
 RETURNS boolean
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM user_organizations uo
    JOIN permission_profiles pp ON pp.id = uo.permission_profile_id
    WHERE uo.user_id = current_user_id()
      AND uo.organization_id = _org_id
      AND uo.is_active = true
      AND (pp.permissions->>'can_manage_users')::boolean = true
  );
$function$;

CREATE OR REPLACE FUNCTION public.is_admin_user()
 RETURNS boolean
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public','pg_temp'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.admin_users
    WHERE auth_user_id = auth.uid() AND mfa_enabled = true
  );
$function$;

CREATE OR REPLACE FUNCTION public.user_can_view_all(_org_id uuid, _entity text)
 RETURNS boolean
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_private_enabled boolean;
  v_user_id uuid;
  v_has_perm boolean;
BEGIN
  SELECT private_records_enabled INTO v_private_enabled FROM organizations WHERE id = _org_id;
  IF v_private_enabled IS NOT TRUE THEN RETURN true; END IF;
  v_user_id := current_user_id();
  IF v_user_id IS NULL THEN RETURN false; END IF;
  SELECT COALESCE((pp.permissions ->> ('view_all_' || _entity))::boolean, false)
    INTO v_has_perm
  FROM user_organizations uo
  JOIN permission_profiles pp ON pp.id = uo.permission_profile_id
  WHERE uo.user_id = v_user_id AND uo.organization_id = _org_id AND uo.is_active = true
  LIMIT 1;
  RETURN COALESCE(v_has_perm, false);
END;
$function$;

CREATE OR REPLACE FUNCTION public.has_org_role(_user_id uuid, _org_id uuid, _role text)
 RETURNS boolean
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.user_organizations uo
    JOIN public.permission_profiles pp ON pp.id = uo.permission_profile_id
    WHERE uo.user_id = _user_id
      AND uo.organization_id = _org_id
      AND uo.is_active = true
      AND lower(pp.name) = lower(_role)
  );
$function$;

CREATE OR REPLACE FUNCTION public.fn_feature_flag_enabled(_flag_key text, _organization_id uuid DEFAULT NULL)
 RETURNS boolean
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT COALESCE(
    (SELECT enabled FROM public.integration_feature_flags
       WHERE flag_key = _flag_key AND organization_id = _organization_id LIMIT 1),
    (SELECT enabled FROM public.integration_feature_flags
       WHERE flag_key = _flag_key AND organization_id IS NULL LIMIT 1),
    false
  );
$function$;
```

> **Nota:** `has_role(_user_id uuid, _role app_role)` **não existe** neste projeto. Papéis são resolvidos por `has_org_role(user_id, org_id, role_name)` acima ou pelo JSON `permission_profiles.permissions`.

---

## 3. RLS por tabela

Para cada tabela: **resumo em PT-BR** + **dump SQL bruto** (`pg_policies`).

### 3.1 `users`

**Quem lê:** o próprio usuário (`auth.uid()`) e outros membros das mesmas organizações. **Quem escreve:** o próprio usuário cria/atualiza o próprio registro.

```
Users can create their own record | INSERT | roles={public}
  WITH CHECK: (auth_user_id = auth.uid())

Users can update their own record | UPDATE | roles={public}
  USING: (auth_user_id = auth.uid())

Users can view their own record | SELECT | roles={public}
  USING: (auth_user_id = auth.uid())

Users can view members of same organization | SELECT | roles={public}
  USING: ((auth_user_id = auth.uid()) OR (id IN (
    SELECT uo2.user_id FROM user_organizations uo1
    JOIN user_organizations uo2 ON uo1.organization_id = uo2.organization_id
    WHERE uo1.user_id = current_user_id() AND uo1.is_active AND uo2.is_active
  )))
```

### 3.2 `organizations`

**Quem lê:** membros ativos + super admins. **Quem escreve:** membros da org (UPDATE).

```
Admins can view all organizations | SELECT | {public}
  USING: (is_admin_user() OR user_has_org_access(id))

Users can update their organizations | UPDATE | {public}
  USING: user_has_org_access(id)

Users can view their organizations | SELECT | {public}
  USING: EXISTS (SELECT 1 FROM user_organizations uo JOIN users u ON u.id = uo.user_id
                 WHERE uo.organization_id = organizations.id AND u.auth_user_id = auth.uid() AND uo.is_active)
```

### 3.3 `user_organizations`

**Quem lê:** membros da própria org; admins da org veem todas as memberships. **Quem escreve:** admins da org (`can_manage_users`).

```
Users can view org memberships | SELECT | {public}
  USING: (organization_id = ANY (current_user_org_ids()))

Admins can view all org memberships | SELECT | {authenticated}
  USING: (organization_id = ANY (current_user_managed_org_ids()))

Admins can update org memberships | UPDATE | {authenticated}
  USING / WITH CHECK: (organization_id IN (
    SELECT uo.organization_id FROM user_organizations uo
    JOIN permission_profiles pp ON pp.id = uo.permission_profile_id
    WHERE uo.user_id = current_user_id() AND uo.is_active
      AND ((pp.permissions ->> 'can_manage_users')::boolean = true)
  ))
```

### 3.4 `permission_profiles`

**Quem lê:** qualquer membro da org. Sem writes de app.

```
Users can view permission profiles in their org | SELECT | {public}
  USING: user_has_org_access(organization_id)
```

### 3.5 `contacts`

**Quem lê:** admins ou membros da org (respeitando `view_all_contacts` / ownership quando privacidade estiver ativa). **Quem escreve:** qualquer membro da org.

```
Users can view contacts in their org | SELECT | {public}
  USING: (is_admin_user() OR (
    (organization_id = ANY (current_user_org_ids()))
    AND deleted_at IS NULL
    AND (user_can_view_all(organization_id,'contacts') OR owner_user_id = current_user_id())
  ))

Users can view deleted contacts in trash | SELECT | {public}
  USING: (user_has_org_access(organization_id) AND deleted_at IS NOT NULL)

Users can insert contacts in their org | INSERT | {public}
  WITH CHECK: user_has_org_access(organization_id)

Users can update contacts in their org | UPDATE | {public}
  USING: user_has_org_access(organization_id)

Users can delete contacts in their org | DELETE | {public}
  USING: user_has_org_access(organization_id)
```

### 3.6 `companies`

**Quem lê/escreve:** qualquer membro da org.

```
Users can view companies in their org | SELECT | {public}
  USING: (user_has_org_access(organization_id) AND deleted_at IS NULL)

Users can view deleted companies in trash | SELECT | {public}
  USING: (user_has_org_access(organization_id) AND deleted_at IS NOT NULL)

Users can insert / update / delete companies in their org  → user_has_org_access(organization_id)
```

### 3.7 `communication_endpoints`

**Quem lê:** membros da org (`authenticated`). **Quem escreve:** apenas admins da org (`is_org_admin`). `service_role` = ALL.

```
comm_endpoints_select_org_members | SELECT | {authenticated}
  USING: (organization_id = ANY (current_user_org_ids()))

comm_endpoints_org_admin_insert | INSERT | {authenticated}
  WITH CHECK: ((organization_id = ANY (current_user_org_ids())) AND is_org_admin(organization_id))

comm_endpoints_org_admin_update | UPDATE | {authenticated}
  USING / WITH CHECK: ((organization_id = ANY (current_user_org_ids())) AND is_org_admin(organization_id))

comm_endpoints_org_admin_delete | DELETE | {authenticated}
  USING: ((organization_id = ANY (current_user_org_ids())) AND is_org_admin(organization_id))

comm_endpoints_service_role_all | ALL | {service_role}  USING/WITH CHECK: true
```

### 3.8 `tags` / `tag_assignments`

Membros da org podem tudo (ALL) dentro da org.

```
Users can manage tags in their org | ALL | {authenticated}
  USING: user_has_org_access(organization_id)

Users can manage tag assignments in their org | ALL | {authenticated}
  USING: user_has_org_access(organization_id)
```

### 3.9 `message_threads`

**Quem lê:** admins ou membros da org — porém, com privacidade ativa, o usuário só vê threads atribuídas a ele (a menos que tenha `view_all_threads` ou `can_manage_cs_queue` para threads não atribuídas). **Quem escreve:** membros da org.

```
Users can view threads in their org | SELECT | {authenticated}
  USING: (is_admin_user() OR (
    (organization_id = ANY (current_user_org_ids()))
    AND (user_can_view_all(organization_id,'threads')
         OR assigned_user_id = current_user_id()
         OR (assigned_user_id IS NULL
             AND user_has_cs_permission(organization_id,'can_manage_cs_queue')))
  ))

message_threads_insert | INSERT | {authenticated}
  WITH CHECK: (organization_id = ANY (current_user_org_ids()))

message_threads_update | UPDATE | {authenticated}
  USING / WITH CHECK: (organization_id = ANY (current_user_org_ids()))

message_threads_delete | DELETE | {authenticated}
  USING: (organization_id = ANY (current_user_org_ids()))
```

### 3.10 `messages`

Membros da org podem SELECT/INSERT/UPDATE/DELETE dentro da própria org. Sem regra de ownership.

```
messages_select | SELECT | {authenticated}   USING: (organization_id = ANY (current_user_org_ids()))
messages_insert | INSERT | {authenticated}   WITH CHECK: (organization_id = ANY (current_user_org_ids()))
messages_update | UPDATE | {authenticated}   USING / WITH CHECK: idem
messages_delete | DELETE | {authenticated}   USING: idem
```

### 3.11 `message_thread_reads`

Cada usuário só enxerga/edita as próprias marcações de leitura.

```
Users can read own thread reads | SELECT | {public}
  USING: (user_id IN (SELECT users.id FROM users WHERE users.auth_user_id = auth.uid()))

Users can insert own thread reads | INSERT | {public}
  WITH CHECK: (user_id IN (SELECT users.id FROM users WHERE users.auth_user_id = auth.uid()))

Users can update own thread reads | UPDATE | {public}
  USING: (user_id IN (SELECT users.id FROM users WHERE users.auth_user_id = auth.uid()))
```

### 3.12 `whatsapp_templates`

Membros ativos da org veem/editam templates da org. Nada além disso.

```
Users can view / insert / update / delete templates in their organization
  organization_id IN (SELECT uo.organization_id FROM user_organizations uo
                      JOIN users u ON u.id = uo.user_id
                      WHERE u.auth_user_id = auth.uid() AND uo.is_active)
```

### 3.13 `opportunities`

Igual `contacts`: admins ou membros com `view_all_opportunities` OU ownership. INSERT/UPDATE/DELETE liberado para qualquer membro da org.

```
Users can view opportunities in their org | SELECT | {public}
  USING: (is_admin_user() OR (
    (organization_id = ANY (current_user_org_ids()))
    AND deleted_at IS NULL
    AND (user_can_view_all(organization_id,'opportunities') OR owner_user_id = current_user_id())
  ))

Users can insert / update / delete opportunities in their org  → user_has_org_access(organization_id)
```

### 3.14 `pipeline_stages`

Membros da org podem ALL (e há uma SELECT policy adicional redundante).

```
Users can manage pipeline stages in their org | ALL | {public}
  USING: user_has_org_access(organization_id)

Users can view pipeline stages in their org | SELECT | {public}
  USING: user_has_org_access(organization_id)
```

### 3.15 `tasks`

Membros da org podem ALL. Deletadas ficam na lixeira.

```
Users can manage tasks in their org | ALL | {public}   USING: user_has_org_access(organization_id)

Users can view tasks in their org | SELECT | {public}
  USING: (user_has_org_access(organization_id) AND deleted_at IS NULL)

Users can view deleted tasks in trash | SELECT | {public}
  USING: (user_has_org_access(organization_id) AND deleted_at IS NOT NULL)
```

### 3.16 `activities`

Timeline. Membros da org veem e inserem (sem UPDATE/DELETE de app).

```
Users can view activities in their org | SELECT | {public}
  USING: (user_has_org_access(organization_id) AND deleted_at IS NULL)

Users can insert activities in their org | INSERT | {public}
  WITH CHECK: user_has_org_access(organization_id)
```

---

## 4. Código de referência (repo web)

Copie tal-e-qual e adapte imports para RN onde indicado. Todos os arquivos abaixo estão em `src/` do repo web e devem ser tratados como fonte da verdade.

### 4.1 `src/lib/authSession.ts`

Verifica se a sessão persistida ainda é válida contra o Auth server antes de considerar o usuário logado. Em erros conhecidos de token inválido, faz `signOut({scope:'local'})` para limpar o storage.

```ts
import type { Session } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';

const INVALID_SESSION_MESSAGES = [
  'session not found','invalid token','invalid jwt','jwt expired',
  'refresh token not found','user from sub claim in jwt does not exist',
];

function isInvalidSessionError(error: unknown) {
  const message = error instanceof Error ? error.message.toLowerCase() : '';
  return INVALID_SESSION_MESSAGES.some((item) => message.includes(item));
}

export async function getVerifiedSession(): Promise<Session | null> {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  const session = data.session;
  if (!session?.access_token) return null;

  const { data: userData, error: userError } = await supabase.auth.getUser(session.access_token);
  if (userError || !userData.user) {
    if (isInvalidSessionError(userError)) {
      await supabase.auth.signOut({ scope: 'local' });
      return null;
    }
    throw userError ?? new Error('Não foi possível validar a sessão atual.');
  }
  return session;
}

export async function getTwilioAccessToken(body?: Record<string, unknown>): Promise<string | null> {
  const session = await getVerifiedSession();
  if (!session) return null;
  const { data, error } = await supabase.functions.invoke('twilio-token', body ? { body } : undefined);
  if (error || !data?.token) {
    const message = error instanceof Error ? error.message : '';
    if (isInvalidSessionError(error) || message.includes('Edge Function returned 401')) {
      await supabase.auth.signOut({ scope: 'local' });
      return null;
    }
    throw new Error('Erro ao obter token de acesso');
  }
  return data.token as string;
}
```

**Mudança no Expo:** nada — funciona tal-e-qual.

### 4.2 `src/contexts/AuthContext.tsx`

Setup padrão do listener de auth do Supabase. Ordem crítica: **primeiro** `onAuthStateChange`, **depois** `getVerifiedSession()`. Não inverter (senão perde eventos).

```tsx
import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import { getVerifiedSession } from '@/lib/authSession';

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  isAuthenticated: boolean;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      setUser(session?.user || null);
      setLoading(false);
    });

    getVerifiedSession()
      .then((session) => { setSession(session); setUser(session?.user || null); setLoading(false); })
      .catch(() => { setSession(null); setUser(null); setLoading(false); });

    return () => subscription.unsubscribe();
  }, []);

  const signOut = async () => { await supabase.auth.signOut(); };

  return (
    <AuthContext.Provider value={{ user, session, loading, isAuthenticated: !!user, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuthContext() {
  const context = useContext(AuthContext);
  if (context === undefined) throw new Error('useAuthContext must be used within an AuthProvider');
  return context;
}
```

### 4.3 `src/contexts/OrganizationContext.tsx`

Depois do login, carrega em 2 passos: (1) `users` por `auth_user_id`, (2) `user_organizations` ativa por `user_id` interno. Sem essa cadeia todas as RLS falham porque dependem de `current_user_id()`.

Copiar do arquivo real (arquivo completo já está no repo em `src/contexts/OrganizationContext.tsx`, mesmo shape do web). Campos-chave:

- `organization`: id, name, slug, logo_url, default_currency, timezone, `duplicate_check_mode`, `theme_*`, `cs_inbox_includes_service_endpoints`.
- `userProfile`: id (interno), auth_user_id, full_name, email, avatar_url, locale, timezone, `is_platform_admin`.
- `locale`: prioridade `userProfile.locale` → `organization.default_locale` → `'pt-BR'`.
- Cache por `user.id` para não refetch em re-renders.

### 4.4 `src/hooks/usePermissions.ts`

Lê `user_organizations.permission_profile_id` e desnormaliza o JSON `permission_profiles.permissions` num objeto tipado. Cache de 10min via React Query.

Flags disponíveis (todas boolean):

```
canViewContacts, canEditContacts, canDeleteContacts,
canViewOpportunities, canEditOpportunities, canDeleteOpportunities,
canManageSettings, canManageUsers, canManageBilling, canManageIntegrations,
viewAllContacts, viewAllOpportunities, viewAllThreads,
manageAssignments, roundRobinRecipient
```

Ver arquivo completo em `src/hooks/usePermissions.ts` — copia direta para o mobile.

### 4.5 `src/lib/dispatchWhatsAppSend.ts`

**Único ponto autorizado** a chamar `twilio-whatsapp-send` ou `meta-whatsapp-send`. Regras:

1. Se `endpointId` foi passado → carrega o endpoint; se falhar, aborta (fail-closed).
2. Senão, resolve provider pela thread: `message_threads.primary_endpoint_id` → última `messages.endpoint_id`.
3. Se não conseguir resolver, cai em Twilio (default legado).
4. Re-rota "Comercial → Meta 7020" (Central Trabalhista, org `40ae935c-a7f7-4ad7-8ea4-91be6404a95f`) só em `senderContext='messages'`.
5. Payload TypeScript:

```ts
export interface WhatsAppSendPayload {
  organizationId: string;
  contactId?: string;
  threadId?: string;
  message?: string;
  templateId?: string;
  templateVariables?: Record<string, string | number>;
  mediaUrl?: string;
  mediaUrls?: string[];
  mediaType?: 'image' | 'audio' | 'video' | 'document';
  userId?: string;
  replyToMessageId?: string;
  isAgentMessage?: boolean;
  agentId?: string;
  senderName?: string;
  senderContext?: 'inbox' | 'messages' | string;
  businessContext?: 'sales' | 'customer_service' | 'other' | null;
  dryRun?: boolean;
  endpointId?: string;
  migrationContext?: MigrationContext;
}
```

Copie o arquivo inteiro tal-e-qual do repo web — a lógica de re-rota e fail-closed já está toda lá.

### 4.6 `src/lib/phoneUtils.ts`

Utilitário puro (sem DOM, sem Node APIs) → **copia direta** para o Expo. Exporta:

- `COUNTRIES` (BR, US, PT, AR, CL, MX, AU) com `dialCode`, `flag`, `placeholder`.
- `detectCountryFromE164(phone)` — com tratamento especial do "55" brasileiro (só é país-code se 12/13 dígitos).
- `formatPhoneForCountry(phone, countryCode)` — formatação por país.
- `buildE164(localNumber, countryCode)` — monta `+CCXXXXX`.
- `formatPhoneDisplay(phone)` — atalho: detecta país e formata.
- `formatPhoneE164(phone)` — normaliza para E.164 (aceita `+`).

---

## 5. Edge functions e RPCs relevantes para o mobile v1

Base URL: `https://qvmtzfvkhkhkhdpclzua.supabase.co/functions/v1/<fn>`.
Autenticação: **JWT do usuário** no header `Authorization: Bearer <access_token>` + header `apikey: <ANON_KEY>`. Chame sempre via `supabase.functions.invoke(...)` — o SDK preenche os headers automaticamente.

### 5.1 `twilio-token`

Emite Twilio Access Token para chamadas WebRTC. Valida o JWT do caller e resolve a org ativa (ou `organizationId` do body).

**Request:**
```ts
supabase.functions.invoke('twilio-token', { body: { organizationId?: string } });
```

**Response 200:** `{ token: string, identity: string, ttl: number }` (o web só usa `token`).
**Erros:** 401 sem/invalid token, 404 se `users` profile não encontrado.

### 5.2 `twilio-whatsapp-send`

Envio via Twilio. **Não chamar direto do mobile** — sempre via `dispatchWhatsAppSend`. Aceita todo o `WhatsAppSendPayload` da §4.5. Também suporta `dryRun=true` (só quando `senderContext='inbox'`) para diagnóstico.

**Response (sucesso):** `{ success: true, messageId, twilioSid, threadId, ... }`.

### 5.3 `meta-whatsapp-send`

Envio via Meta Cloud API. Interface espelha `twilio-whatsapp-send`. Suporta template, texto e mídia (image/audio/video/document). Faz upload de mídia para Graph API quando necessário.

**Response:** `{ success: true, messageId, waMessageId, threadId, ... }`.
Erros comuns: `missing_organization`, `missing_contact`, `unsupported_media_type`, `missing_template_payload`, `outside_24h_window`.

### 5.4 `dispatchWhatsAppSend` (cliente, não é edge function)

Wrapper obrigatório. Ver §4.5. **Regra ESLint** no web bloqueia invokes diretos fora deste arquivo — replique a mesma regra no mobile (ou pelo menos convencione).

### 5.5 RPCs (chamadas via `supabase.rpc(...)`)

#### `fn_feature_flag_enabled(_flag_key text, _organization_id uuid?) → boolean`

```ts
const { data: enabled } = await supabase.rpc('fn_feature_flag_enabled', {
  _flag_key: 'inbox_v2',
  _organization_id: organization.id,
});
```

Retorna a flag específica da org; se ausente, cai no default global; se ausente, `false`.

#### `has_org_role(_user_id uuid, _org_id uuid, _role text) → boolean`

```ts
const { data: isAdmin } = await supabase.rpc('has_org_role', {
  _user_id: userProfile.id,
  _org_id: organization.id,
  _role: 'admin',
});
```

Compara `permission_profiles.name` (case-insensitive).

#### `has_role`

**Não existe neste projeto.** Se precisar de checagem de papel, use `has_org_role` acima ou o hook `usePermissions` (que lê o JSON `permission_profiles.permissions`).

---

## 6. Referências rápidas

- **Regra de ouro:** `users.id` (interno) em relações; `auth.uid()` só para join com `users` via `auth_user_id`. `current_user_id()` faz a ponte.
- **Realtime:** sempre dentro de `useEffect` com cleanup `supabase.removeChannel(channel)`. Vale para RN também.
- **Query limit:** Supabase retorna no máximo 1000 rows por query — use paginação/cursor para threads, messages, contacts.
- **Nunca** ler `auth.users`, `service_role_key` ou schemas reservados (`auth`, `storage`, `realtime`, `vault`).
- **service_role_key:** só existe dentro de edge functions. Nunca embarcar no app.

---

Última atualização: 2026-07-04.
