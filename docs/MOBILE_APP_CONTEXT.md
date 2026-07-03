# Seialz — Contexto de Arquitetura para o App Mobile

> **Documento oficial de contexto para o GitHub Copilot.**
> Este é o guia arquitetural que o Copilot deve usar como referência permanente ao desenvolver o aplicativo mobile do Seialz em **React Native + Expo**.
> Não é uma documentação completa do CRM: cobre apenas o necessário para o escopo do app mobile v1.
> Sempre que houver mudanças relevantes na arquitetura do Seialz (schema, RLS, edge functions, integrações, padrões) ou expansão de escopo do app, **este documento deve ser atualizado antes de novas implementações**.

---

## 1. Visão Geral

**Seialz** é um CRM omnichannel B2B focado em times comerciais e de atendimento que operam via WhatsApp, ligações e outros canais digitais. O sistema centraliza:

- Contatos e empresas
- Conversas (WhatsApp Twilio + Meta Cloud API, futuros canais)
- Oportunidades comerciais (Kanban por pipeline)
- Tarefas e atividades
- Chamadas telefônicas (Twilio Voice)
- Integrações (Meta Ads, Kommo, SuvSign, etc.)
- Agentes de IA e base de conhecimento
- Relatórios operacionais e comerciais

O produto é **multi-tenant**: cada cliente é uma **organização** (`organizations`) e todos os dados são isolados por `organization_id`.

### Escopo do App Mobile v1

Módulos que o app mobile deve implementar:

1. Login / Autenticação
2. Multi-tenancy e seleção de organização (quando aplicável)
3. Dashboard
4. Contatos
5. Inbox / Conversas (WhatsApp)
6. Oportunidades
7. Tarefas
8. Perfil do usuário
9. Configurações básicas

### Fora do Escopo v1

Estes módulos existem no web mas **não** devem ser implementados no mobile v1 sem atualização deste documento:

- Marketing (Meta Ads, atribuição, funil)
- Relatórios avançados
- Administração da plataforma (`/admin/*`)
- Agentes de IA, base de conhecimento, automações
- Configurações avançadas (integrações, templates WhatsApp, permissões, feature flags)
- Chamadas telefônicas (Twilio Voice / WebRTC)
- Documentos e assinatura eletrônica (SuvSign)
- Integrações administrativas (Kommo, Meta CAPI, etc.)

Quando algum desses módulos entrar no escopo, o Copilot deve **parar e pedir atualização deste documento** antes de codificar.

---

## 2. Arquitetura do Sistema

Diagrama resumido do stack, focado no que o app mobile consome:

```text
                    ┌──────────────────────────┐
                    │  App Mobile (RN + Expo)  │
                    │   — cliente do Seialz —  │
                    └────────────┬─────────────┘
                                 │  supabase-js
                                 │  (anon key + user JWT)
                                 ▼
┌───────────────────────────────────────────────────────────┐
│                        Supabase                            │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌───────────┐  │
│  │ Postgres │  │   Auth   │  │ Storage  │  │ Realtime  │  │
│  │  + RLS   │  │  (JWT)   │  │ (bucket) │  │ (channels)│  │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘  └─────┬─────┘  │
│       │             │             │              │        │
│  ┌────┴─────────────┴─────────────┴──────────────┴─────┐  │
│  │              Edge Functions (Deno)                  │  │
│  │  dispatchWhatsAppSend → twilio-whatsapp-send        │  │
│  │                       → meta-whatsapp-send          │  │
│  │  outras (auth flows, integrações, etc.)             │  │
│  └────┬────────────────────────────────────────────────┘  │
└───────┼───────────────────────────────────────────────────┘
        │
        ▼
┌───────────────────┐        ┌─────────────────────────────┐
│  Railway (worker) │        │ Integrações externas         │
│  Sync WhatsApp    │◀──────▶│ Twilio, Meta Cloud, etc.     │
│  (inbound/status) │        │                              │
└───────────────────┘        └─────────────────────────────┘
```

Componentes:

- **Frontend Web**: Vite + React 18 + TypeScript + Tailwind + shadcn. Serve como **referência de paridade funcional** para o mobile (especialmente `src/components/mobile/*`, que já são componentes mobile-first do web).
- **Supabase**: fonte primária de dados. Postgres com RLS ativo em todas as tabelas de negócio. Auth com JWT. Storage para mídia. Realtime para mensagens e mudanças de threads.
- **Edge Functions (Deno)**: encapsulam qualquer lógica que precise de segredos (Twilio, Meta, provedores de IA) ou de privilégios elevados. Ponto de contato obrigatório para envio WhatsApp.
- **Railway**: worker externo que sincroniza mensagens WhatsApp com Twilio/Meta (inbound, status, sanitização). O app **não** fala com Railway diretamente.
- **Integrações externas**: acessadas apenas via edge functions no lado servidor. O app **nunca** deve ter credenciais dessas integrações.

---

## 3. Arquitetura do Aplicativo Mobile

Regras fundacionais que definem o papel do app dentro do ecossistema:

1. **O app é um cliente do Seialz, não um sistema independente.** Ele não hospeda regras de negócio próprias; renderiza e opera sobre dados e ações já expostas pelo backend.
2. **Toda lógica de negócio permanece no backend** (Postgres + triggers + edge functions + Railway). O app apenas orquestra chamadas.
3. **Reutilização primeiro, criação depois.** Antes de propor uma nova RPC/edge function/tabela, o Copilot deve verificar se já existe algo equivalente sendo usado pelo web. Se existir, reutilizar. Se não, parar e pedir revisão.
4. **Paridade funcional com o web.** Estados de thread, regras de janela de 24h WhatsApp, gates de permissão, ranking de winner em conversas, cálculo de contadores — tudo deve refletir o comportamento do web. Referência viva: `src/components/mobile/*` e hooks correspondentes.
5. **Performance e UX mobile nativa.** Listas virtualizadas, transições nativas, gestos, feedback tátil quando adequado, imagens otimizadas, splash e ícones adaptativos.
6. **Offline quando fizer sentido.** Cache do React Query persistido (AsyncStorage), fila local para envios pendentes, sincronização por Realtime ao voltar online. Nunca fingir sucesso: envios pendentes devem ser visualmente identificáveis.

---

## 4. Multi-tenancy (seção central)

Multi-tenancy é o conceito **mais importante** do Seialz. Qualquer bug aqui vaza dados entre clientes.

### Modelo

- Toda entidade de negócio (contacts, message_threads, opportunities, tasks, etc.) tem `organization_id UUID NOT NULL`.
- Usuários (`users`) existem globalmente e são associados a **uma ou mais** organizações via `user_organizations`.
- Cada `user_organizations` tem `is_active BOOLEAN` e um `permission_profile_id` — que define o que o usuário pode fazer **naquela** organização.

### Organização ativa

- Para o app v1, a organização ativa é a linha em `user_organizations` com `is_active = true` para o `users.id` mapeado do JWT.
- Se o usuário tiver mais de uma organização, o app deve exibir um **seletor de organização** no login e ao trocar. Trocar significa marcar outra `user_organizations.is_active = true` (o web tem esse fluxo — reutilizar a mesma regra).
- **Toda query e toda mutação assume implicitamente** a organização ativa via RLS.

### RLS (Row Level Security)

RLS está ativo em todas as tabelas relevantes. Duas funções SECURITY DEFINER são a base:

- `current_user_id()` → mapeia `auth.uid()` para `users.id` interno.
- `current_user_org_ids()` → retorna o array de `organization_id` das `user_organizations` ativas do usuário atual.

Padrão de política em tabelas de alto volume (obrigatório para performance):

```sql
USING (organization_id = ANY(current_user_org_ids()))
```

### Regras absolutas (o que NUNCA fazer no app)

- **Nunca** hardcode `organization_id` no cliente.
- **Nunca** use `auth.uid()` como chave estrangeira em joins relacionais. Sempre `users.id` (obtido via `current_user_id()` no server ou via `users.auth_user_id = auth.uid()` na leitura).
- **Nunca** embarque `service_role_key` no app.
- **Nunca** desabilite RLS "para facilitar".
- **Nunca** cacheie dados de uma organização e reutilize após troca de organização — o cache do React Query deve ser **invalidado por completo** ao trocar de org.
- **Nunca** confie no cliente para filtrar por org: mesmo com RLS, sempre inclua `organization_id` explicitamente em inserts (é `NOT NULL`) e em `.eq('organization_id', ...)` em selects onde faça sentido reduzir payload.

### Resolução da organização no boot do app

Fluxo esperado (espelha `src/contexts/OrganizationContext.tsx`):

1. Obter sessão Supabase e `auth.user.id`.
2. `select * from users where auth_user_id = <auth.uid>` → obtém `users.id` interno.
3. `select ..., organization:organizations(*) from user_organizations where user_id = <users.id> and is_active = true`.
4. Se retornar 1 → é a org ativa.
5. Se retornar 0 → estado de erro (`NO_ORGANIZATION`), levar a tela de suporte.
6. Se retornar mais de uma → seletor.

---

## 5. Autenticação

### Provedor

Supabase Auth (email + senha por padrão). No RN, o cliente Supabase deve ser configurado com `AsyncStorage`:

- `persistSession: true`
- `autoRefreshToken: true`
- `storage: AsyncStorage`
- `detectSessionInUrl: false` (mobile não usa URL)

### Fluxo de login

1. Tela de login → `supabase.auth.signInWithPassword({ email, password })`.
2. Registrar `supabase.auth.onAuthStateChange` **antes** de qualquer leitura de sessão (mesmo padrão do web em `AuthContext`).
3. Para checagens que devem confiar no usuário, chamar `supabase.auth.getUser()` (revalida contra o servidor). `getSession()` só para anexar bearer quando o servidor irá validar novamente.
4. Resolver `users.id` e organização ativa (seção 4).
5. Consultar `permission_profiles` da associação para carregar permissões (ver `src/hooks/usePermissions.ts`).

### Sessão

- Uma sessão por dispositivo. O Seialz tem lógica de "single session device-based" (memória `mem://integrations/single-session-device-based`). O app deve respeitar: se a sessão for invalidada remotamente, deslogar imediatamente.
- Ao detectar erro de sessão inválida (`session not found`, `invalid jwt`, `jwt expired`, etc.), fazer `signOut({ scope: 'local' })` e mandar para login. Ver padrão em `src/lib/authSession.ts`.

### Logout

- `supabase.auth.signOut()`.
- Limpar cache do React Query.
- Limpar qualquer estado persistido (org ativa, filtros, etc.).

### Recuperação de senha

- `supabase.auth.resetPasswordForEmail(email, { redirectTo: <deep link do app> })`.
- Deep link deve abrir uma tela dedicada no app para `updateUser({ password })`. Sem essa tela, o usuário entra sem trocar a senha.

### Permissões

Reimplementar em RN a lógica equivalente a `usePermissions`:

- Ler `user_organizations.permission_profile_id` do usuário atual na org ativa.
- Ler `permission_profiles.permissions` (JSONB).
- Expor flags como `canViewContacts`, `canEditOpportunities`, `viewAllThreads`, etc.
- Cachear no React Query com `staleTime` alto (10 min) — permissões raramente mudam em sessão.

---

## 6. Modelo de Dados (apenas o escopo v1)

Papel de cada entidade que o app v1 consome. Colunas específicas devem ser consultadas em `src/integrations/supabase/types.ts` (fonte da verdade).

### Núcleo de tenancy

- **`organizations`** — a organização (tenant). Contém defaults (currency, locale, timezone, tema).
- **`users`** — usuário global. `auth_user_id` faz o link com `auth.users`. O app deve sempre trabalhar com `users.id`, não com `auth.uid()`.
- **`user_organizations`** — associação N:N com `is_active` e `permission_profile_id`. Define a org ativa e as permissões dentro dela.
- **`permission_profiles`** — perfis de permissão (JSONB `permissions`) por organização.

### Contatos

- **`contacts`** — contato do CRM (pessoa). Muitos campos, incluindo dados legais (CPF/RG/endereço) e responsável (`owner_id`).
- **`companies`** — empresas. No v1 o app pode apenas ler para exibir vínculo com contatos.
- **`tags`** e **`tag_assignments`** — tags aplicáveis a contatos/oportunidades/threads.
- **`communication_endpoints`** — canais de comunicação de um contato (telefone, whatsapp, email, com `purpose` = sales/customer_service/other).

### Mensageria (Inbox / WhatsApp)

- **`message_threads`** — conversa. Contém `primary_endpoint_id`, `business_context` (`sales` | `customer_service` | `other`), `status` (`open`, `pending`, `resolved`, `closed`), campos denormalizados `last_message_*`, `last_inbound_at` (base da janela 24h). Um contato pode ter mais de uma thread (por endpoint/contexto).
- **`messages`** — mensagem individual. `direction` (`inbound`/`outbound`), `sender_type`, `content`, `metadata`, `template_id`, `reply_to_message_id`, etc.
- **`message_thread_reads`** — estado de leitura **por usuário** (unread individual). O app deve gravar aqui ao abrir uma thread.
- **`whatsapp_templates`** — templates aprovados (Twilio/Meta). O app consome para enviar template quando a janela 24h está fechada.

Regras importantes que o app deve respeitar:

- **Envio WhatsApp**: sempre via `dispatchWhatsAppSend` (ver seção 8). Nunca invocar `twilio-whatsapp-send` ou `meta-whatsapp-send` diretamente — o ESLint do web bloqueia isso e a mesma regra vale conceitualmente no mobile.
- **Janela 24h**: calculada em `last_inbound_at`. Fora da janela, apenas templates aprovados podem ser enviados.
- **Formatação**: no máximo 2 quebras de linha consecutivas; sem espaços em excesso. Renderização segue as regras já descritas nas memórias de WhatsApp.

### Comercial

- **`opportunities`** — oportunidade em um `pipeline_stages`. Tem `status` (won/lost/open), `owner_id`, `value`, `close_date`.
- **`pipeline_stages`** — etapas do funil.

### Tarefas e Atividades

- **`tasks`** — tarefa com `due_at`, `assigned_to`, `status`, `type` (ligação, whatsapp, reunião, etc.), relacionamento com contato/oportunidade.
- **`activities`** — timeline de eventos no contato/oportunidade.

### Entidades fora do escopo v1 (apenas para reconhecer)

`ai_agents`, `ai_agent_logs`, `knowledge_*`, `marketing_*`, `admin_*`, `integrations`, `whatsapp_template_actions`, `calls`, `document_*`, `subscriptions`, `plans`, etc. O app **não deve** ler ou escrever nessas tabelas na v1.

---

## 7. APIs — Como Consumir o Backend

Três formas de conversar com o Supabase. Escolha na seguinte ordem:

### 7.1. Tabela direta (CRUD simples com RLS)

Use quando a operação é uma leitura/escrita simples numa entidade e a RLS já garante o filtro por organização.

```text
Contatos, tasks, opportunities (CRUD), leitura de threads/messages,
message_thread_reads (upsert), tags.
```

Sempre:

- Selecione apenas as colunas necessárias.
- Passe `organization_id` explicitamente em `insert`.
- Nunca peça mais de 1000 linhas de uma vez (limite padrão do PostgREST). Pagine com `.range()` ou use um RPC dedicado.

### 7.2. RPC (`supabase.rpc(...)`)

Use quando:

- Precisa agregação, cursor pagination, ou consulta com joins complexos.
- Precisa checagem de segurança que já existe como SECURITY DEFINER (`has_role`, `has_org_role`, `current_user_org_ids`, `fn_feature_flag_enabled`).
- Existe um RPC pronto sendo usado pelo web (ex.: listagens paginadas de threads). Nesse caso, **sempre reutilizar**.

### 7.3. Edge Function (`supabase.functions.invoke(...)`)

Use quando:

- Há segredo envolvido (Twilio, Meta, provedores externos).
- Há orquestração multi-passo com side effects (envio de mensagem, tokens, integrações).
- Existe função pronta usada pelo web. Reutilizar.

Exemplos relevantes para o app v1:

- **Envio WhatsApp**: `dispatchWhatsAppSend` (helper cliente que invoca `twilio-whatsapp-send` ou `meta-whatsapp-send` com resolução de provedor).
- **Token Twilio** (se algum recurso do v1 precisar): `twilio-token` via `getTwilioAccessToken` (ver `src/lib/authSession.ts`).

### Convenções de erro

- Toda chamada Supabase retorna `{ data, error }`. Sempre tratar `error` — nunca ignorar.
- Erros de sessão inválida devem disparar signOut local (ver `INVALID_SESSION_MESSAGES` em `src/lib/authSession.ts`).
- Feedback ao usuário via toast/haptic. Nunca engolir erro silenciosamente.

### Realtime

- Sempre dentro de `useEffect` com cleanup:
  ```
  const channel = supabase.channel(...).on(...).subscribe();
  return () => supabase.removeChannel(channel);
  ```
- Nunca subscrever no escopo de componente sem cleanup — vaza subscrições e gera custo.
- Ao entrar em background, considerar remover o channel; ao voltar em foreground, reassinar e forçar refetch para reconciliar.

---

## 8. Reutilização Obrigatória

Antes de escrever qualquer coisa nova, o Copilot deve verificar se já existe:

- **Envio WhatsApp** → `src/lib/dispatchWhatsAppSend.ts`. Regras de re-rota, resolução de provedor, fail-closed em endpoint inválido — tudo já está lá. Reimplementar em RN mantendo a **mesma superfície de contrato** (`WhatsAppSendPayload`) e o **mesmo comportamento**.
- **Sessão validada** → `src/lib/authSession.ts` (`getVerifiedSession`, `getTwilioAccessToken`). Reimplementar equivalente em RN.
- **Contexto de autenticação** → `src/contexts/AuthContext.tsx`. Padrão de listener + `getUser()`.
- **Contexto de organização** → `src/contexts/OrganizationContext.tsx`. Padrão de resolução de `users.id`, org ativa e locale.
- **Permissões** → `src/hooks/usePermissions.ts`. Reimplementar com mesma shape (`Permissions`).
- **Tipos gerados** → `src/integrations/supabase/types.ts` é a **fonte da verdade** do schema. Nunca inventar tipos ao lado; importar ou reexportar. Este arquivo é gerado pela Supabase e não pode ser editado.
- **RPCs e edge functions** existentes: se o web usa, o mobile usa igual. Não duplicar.

Se algo necessário **não existe**, o Copilot deve parar e pedir para criar no backend antes de mockar no cliente.

---

## 9. Padrões Arquiteturais do App

### Estrutura de pastas sugerida

Espelhar o web quando fizer sentido. Sugestão inicial:

```text
app/                 # Expo Router (rotas)
  (auth)/            # login, recuperar senha
  (tabs)/            # dashboard, contacts, inbox, opportunities, tasks
  contacts/[id]      # detalhe
  opportunities/[id]
  threads/[id]       # conversa
  settings/
src/
  lib/               # helpers (supabase client, authSession, dispatchWhatsAppSend, etc.)
  contexts/          # AuthContext, OrganizationContext
  hooks/             # useAuth, useOrganization, usePermissions, hooks por domínio
  components/        # UI reutilizável (design system adaptado)
  features/          # opcional: agrupamento por domínio (contacts/, inbox/, ...)
  types/             # reexports de Database e tipos derivados
```

### React Query

- Provider raiz com `QueryClient` compartilhado.
- `staleTime` alto para dados estáveis (permissões, org, listas de referência).
- Persistência com `@tanstack/react-query-persist-client` + `AsyncStorage` (para offline).
- **Invalidar tudo** ao trocar de organização ou fazer logout.
- Chaves de query devem incluir `organizationId` sempre que a query for scopeada.

### Hooks por domínio

Cada domínio (contacts, inbox, opportunities, tasks) tem seus hooks (`useContacts`, `useThread`, etc.), encapsulando queries/mutations/realtime. Componentes não chamam `supabase` diretamente.

### Tipagem

- `import type { Database } from '@/integrations/supabase/types'` (ou equivalente no mobile).
- Derivar tipos de linha: `type Contact = Database['public']['Tables']['contacts']['Row']`.
- Sem `any` implícito.

### Tratamento de erros

- Toast/snackbar nativo com mensagem amigável em pt-BR.
- Log detalhado no console apenas em dev.
- Sentry (ou equivalente) recomendado; nunca vazar dados sensíveis.

### Realtime

Padrão obrigatório (ver seção 7). Considerar reassinar ao voltar do background.

### Feature flags

Reutilizar `fn_feature_flag_enabled(_flag_key, _organization_id)` via RPC quando precisar gate de funcionalidade. Não inventar flags locais.

### Design system

- Fontes: **Outfit** (UI) e **Share Tech Mono** (dados). Adaptar para RN via `expo-font`.
- Peso máximo 600.
- Bordas: 6px para elementos, 9999px para círculos.
- Cores: replicar tokens semânticos do web (`background`, `foreground`, `muted`, `primary`, `accent`, etc.) em um tema RN. **Nunca** hardcode cores.
- Referência de UX mobile: `src/components/mobile/*` — já são componentes mobile-first do web e devem servir de base para a experiência do app.

---

## 10. Compatibilidade com o Sistema Web

O app não pode divergir do web em regra de negócio. Pontos críticos:

- Mesmos IDs internos (`users.id`, `organization_id`, `contact.id`, `thread.id`).
- Mesmo modelo de estado das threads (`open`, `pending`, `resolved`, `closed`) e mesma semântica.
- Mesma **janela de 24h WhatsApp** (calculada em `last_inbound_at`).
- Mesmos gates de permissão (`permission_profiles`).
- Mesma resolução de provedor no envio (regra `dispatchWhatsAppSend`).
- Mesma normalização de telefone BR (9º dígito) — ver `src/lib/phoneUtils.ts`.
- Mesma denormalização de `last_message_*` em `message_threads` — o app apenas lê, não recalcula.

Ao criar tela nova, o Copilot deve olhar primeiro o equivalente em `src/pages/*` e `src/components/mobile/*` do web e replicar o comportamento.

---

## 11. O Que o App Mobile NÃO Deve Fazer

- **Não** hospedar lógica de negócio pesada. Deixar para triggers/edge functions.
- **Não** fazer cálculos financeiros ou fiscais no cliente.
- **Não** enviar mensagem direto para Twilio ou Meta. Sempre via `dispatchWhatsAppSend`.
- **Não** gerar PIX, cobranças ou links de pagamento no cliente.
- **Não** rotear threads (assignment/round-robin). Isso é backend.
- **Não** criar/editar organizações, planos ou assinaturas.
- **Não** embarcar `service_role_key` nem qualquer segredo de integração.
- **Não** bypassar RLS.
- **Não** duplicar regras já existentes em edge functions, triggers ou hooks do web.
- **Não** implementar administração da plataforma, IA, marketing ou automações na v1.

---

## 12. O Que o App Mobile Deve Consumir

Do backend existente:

- Leitura de `message_threads` + `messages` + `message_thread_reads` (incluindo realtime).
- Envio de mensagem via `dispatchWhatsAppSend` (texto, mídia, template, reply).
- CRUD de `contacts`, `opportunities`, `tasks` respeitando RLS.
- Leitura de `pipeline_stages`, `tags`, `communication_endpoints`, `whatsapp_templates`.
- Perfil do usuário (`users`) e troca de organização (`user_organizations.is_active`).
- Permissões (`permission_profiles`).
- Upload de mídia via Supabase Storage (para anexos de mensagem/contato).
- Notificações push via Expo Notifications (o backend deve gravar o token do dispositivo — se ainda não existir esse fluxo, pedir revisão antes de implementar).

---

## 13. Boas Práticas React Native + Expo

- **Expo SDK recente** com Expo Router para navegação baseada em arquivos.
- **@supabase/supabase-js** com `AsyncStorage` como storage e `detectSessionInUrl: false`.
- **React Query** com persistência (`@tanstack/react-query-persist-client` + `AsyncStorage`).
- **Deep links** configurados (`scheme` no `app.json`) para reset de senha e navegação por push.
- **Push notifications** via Expo Notifications; registrar token do dispositivo no backend e desregistrar no logout.
- **Refresh de token** automático (Supabase faz sozinho quando configurado); tratar 401 chamando signOut local.
- **Imagens** com `expo-image` (cache nativo). Miniaturas para listas.
- **Listas grandes** com `FlashList` (Shopify) ou `FlatList` com `getItemLayout`. Nunca renderizar milhares de itens sem virtualização.
- **Bundle enxuto**: evitar dependências grandes duplicadas com o web (ex.: não trazer bibliotecas de UI web).
- **Background/foreground**: pausar realtime e polling em background; ao voltar, forçar refetch e reassinar canais.
- **i18n**: pt-BR como padrão (mesmo do web); estrutura preparada para outros locales.
- **Segurança**: nada de dados sensíveis em logs; usar `expo-secure-store` para qualquer dado sensível fora do escopo do Supabase (raro na v1).

---

## 14. Instruções para o GitHub Copilot

Regras diretas que o Copilot **deve seguir sempre** ao gerar código para este app:

1. **Nunca quebrar o conceito multi-tenant.** Toda leitura e escrita passa pela organização ativa. Cache é sempre keyed por `organizationId`.
2. **Nunca assumir `organization_id` fixo.** Ele vem do estado da sessão, nunca hardcode.
3. **Sempre respeitar RLS.** Não tentar contornar. Não sugerir `service_role`. Se uma consulta "não retorna nada", investigar RLS, não desabilitar.
4. **Reutilizar contratos, RPCs e Edge Functions existentes** antes de propor novos. Se algo já é feito no web, replicar o mesmo caminho.
5. **Nunca inventar endpoints, tabelas ou colunas.** Fonte da verdade: `src/integrations/supabase/types.ts` e a lista de edge functions em `supabase/functions/`. Se algo não existe, parar e pedir criação.
6. **Manter compatibilidade com o web.** Mesmas regras de negócio, mesmos estados, mesmos IDs. Divergências devem ser explicitamente aprovadas.
7. **Implementar uma funcionalidade por vez.** Não misturar múltiplos módulos numa mesma PR. Escopo pequeno, testável.
8. **Perguntar quando houver dúvida sobre regra de negócio.** Nunca inferir regras não documentadas — pedir esclarecimento.
9. **Consultar `src/integrations/supabase/types.ts`** para nomes exatos de tabelas, colunas e enums. Este arquivo é gerado; não editar.
10. **Não implementar módulos fora do escopo v1** (marketing, admin, IA, automações, chamadas, documentos, integrações administrativas, configurações avançadas) sem antes atualizar este documento.
11. **Nunca embarcar segredos** (service_role, API keys de integrações). Se precisar acionar algo com segredo, criar/usar edge function.
12. **Envio WhatsApp** é **sempre** via `dispatchWhatsAppSend`. Nunca invocar `twilio-whatsapp-send` ou `meta-whatsapp-send` diretamente.
13. **Realtime** sempre dentro de `useEffect` com cleanup via `supabase.removeChannel`.
14. **Design system**: usar tokens semânticos, fontes Outfit/Share Tech Mono, peso máximo 600, bordas 6px/9999px. Sem cores hardcoded.
15. **Feedback ao usuário** em pt-BR, sempre. Nunca deixar erro engolido.

---

## 15. Manutenção do Documento

Este é o **documento oficial de contexto do GitHub Copilot** para o app mobile do Seialz.

Ele **deve ser mantido atualizado** sempre que:

- houver mudança de schema (tabelas, colunas, enums, RLS);
- edge functions ou RPCs consumidas pelo app forem alteradas ou renomeadas;
- integrações relevantes (Twilio, Meta, Supabase) mudarem de contrato;
- padrões arquiteturais (React Query, hooks, design system) forem revistos;
- o escopo do app mobile for expandido (novos módulos além da v1).

Antes de qualquer implementação em módulo fora da v1, este documento deve ser atualizado com o novo contexto necessário. O Copilot não deve prosseguir com módulos fora de escopo sem essa atualização.
