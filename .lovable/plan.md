## Objetivo

Gerar um único documento Markdown (`docs/MOBILE_APP_CONTEXT.md`) para servir como **guia de arquitetura** do GitHub Copilot no desenvolvimento do app mobile Seialz em React Native + Expo.

Não é uma documentação completa do CRM. O foco é fornecer **apenas o contexto necessário** para o Copilot desenvolver corretamente o app mobile, respeitando arquitetura, multi-tenancy e padrões existentes.

## Escopo do app mobile (v1)

Módulos cobertos com profundidade no documento:

- Login / Autenticação
- Multi-tenancy e seleção de organização
- Dashboard
- Contatos
- Inbox / Conversas (WhatsApp)
- Oportunidades
- Tarefas
- Perfil do usuário
- Configurações básicas

Módulos apenas mencionados (não detalhados): Marketing, Relatórios avançados, Administração, IA, Automações, Configurações avançadas, Chamadas (Twilio Voice), Documentos/Assinatura, Integrações administrativas. O documento indica que qualquer expansão futura para esses módulos deve ser precedida de nova documentação.

## Entregável

Um arquivo: `docs/MOBILE_APP_CONTEXT.md` — sem limite de tamanho, priorizando utilidade e evitando repetição.

## Estrutura do documento

1. **Visão Geral (curta)** — o que é o Seialz, conceito de CRM omnichannel, escopo do app mobile v1 (lista acima), o que está fora do escopo.
2. **Arquitetura do Sistema (resumida, focada no que o app consome)** — diagrama textual: Frontend Web (referência de UX/paridade) + Supabase (Postgres + Auth + Storage + Realtime) + Edge Functions (Deno) + Railway (sync WhatsApp). Integrações externas citadas apenas quando o app depende (Twilio para tokens, Meta Cloud via edge functions de envio).
3. **Arquitetura do Aplicativo Mobile** — o app é **cliente** do Seialz, não um sistema independente; toda lógica de negócio permanece no backend; deve **reutilizar** APIs/RPCs/Edge Functions existentes antes de criar novas; **paridade funcional** com o web (referência: `src/components/mobile/`); performance, UX nativa e **offline** quando fizer sentido (cache React Query persistido, fila de envio, sync via realtime ao voltar online).
4. **Multi-tenancy** (seção central) — `organization_id`, `user_organizations`, organização ativa, troca, isolamento via RLS, uso obrigatório de `current_user_id()` e `current_user_org_ids()`, proibição de `auth.uid()` em joins relacionais. Como o app resolve a org ativa no login, como persistir seleção, o que NUNCA fazer (hardcode org_id, bypass RLS, service_role no cliente, cache cross-tenant).
5. **Autenticação** — Supabase Auth com `AsyncStorage` no RN, fluxo de login (email/senha), `onAuthStateChange`, `getUser()` para validação, mapeamento `auth.uid → users.id`, resolução da organização ativa via `user_organizations.is_active`, seleção de organização quando múltiplas, sessão única por dispositivo (memória `single-session`), refresh de token, logout, permissões via `permission_profiles` e `usePermissions`.
6. **Modelo de dados (apenas entidades usadas no app v1)** — papel de cada uma:
   - `organizations`, `users`, `user_organizations`, `permission_profiles`
   - `contacts`, `companies` (leitura), `tags`, `tag_assignments`
   - `message_threads`, `messages`, `communication_endpoints`, `message_thread_reads`
   - `opportunities`, `pipeline_stages`
   - `tasks`, `activities`
   - `whatsapp_templates` (consumo)
   
   Entidades fora do escopo v1 apenas listadas com uma linha de contexto.
7. **APIs — como consumir o backend** — regra prática: quando usar tabela direta (CRUD simples com RLS), quando usar RPC (agregações, listagens paginadas como `list_threads`, checagens `has_role`/`has_org_role`), quando usar Edge Function (envio WhatsApp via `dispatchWhatsAppSend`, tokens externos, ações com secrets). Convenções de erro, paginação e realtime.
8. **Reutilização obrigatória** — lista de artefatos que o app **deve reutilizar** ao invés de recriar: `dispatchWhatsAppSend`, RPCs de threads, hooks equivalentes (`useAuth`, `useOrganization`, `usePermissions` — como referência conceitual, reimplementados em RN), tipos gerados em `src/integrations/supabase/types.ts`, políticas de RLS existentes.
9. **Padrões arquiteturais que o app deve seguir** — estrutura de pastas espelhando o web quando fizer sentido, React Query com `staleTime`/`gcTime` e persistência, hooks por domínio, tipagem estrita via `Database`, tratamento de erros com toast/feedback nativo, realtime dentro de `useEffect` com cleanup obrigatório, feature flags via `fn_feature_flag_enabled`, design system Seialz como referência visual (Outfit/Share Tech Mono, tokens semânticos — adaptados ao RN).
10. **Compatibilidade com o sistema web** — o app não pode introduzir divergências de regra: mesmos IDs internos, mesmo modelo de leitura/escrita, mesmos estados de thread, mesmas restrições de janela de 24h WhatsApp, mesmos gates de permissão. Referência ao mobile-first já existente no web (`src/components/mobile/`).
11. **O que o app mobile NÃO deve fazer** — lógica de negócio pesada, cálculos financeiros, envio direto a Twilio/Meta sem passar pelas edge functions, geração de PIX, roteamento de threads, criação de organizações, gestão de assinaturas, uso de `service_role`, bypass de RLS, duplicação de regras já existentes em edge functions ou triggers.
12. **O que o app mobile deve consumir** — leitura de threads/mensagens, envio via `dispatchWhatsAppSend`, CRUD de contatos/oportunidades/tarefas respeitando RLS, notificações push (Expo Notifications), realtime de mensagens, uploads via Supabase Storage, perfil do usuário e troca de organização.
13. **Boas práticas React Native + Expo** — Expo SDK recente, `@supabase/supabase-js` com `AsyncStorage`, Expo Router, deep links, React Query com persistência, offline básico, refresh de token seguro, push notifications, imagens otimizadas, bundle enxuto, tratamento de background/foreground para realtime.
14. **Instruções para o GitHub Copilot** (seção final, imperativa) — regras diretas:
    - nunca quebrar o multi-tenant;
    - nunca assumir `organization_id` fixo;
    - sempre respeitar RLS;
    - reutilizar contratos, RPCs e edge functions existentes;
    - nunca inventar endpoints ou tabelas;
    - manter compatibilidade com o web;
    - implementar uma funcionalidade por vez;
    - perguntar quando houver dúvida sobre regra de negócio;
    - consultar `src/integrations/supabase/types.ts` como fonte da verdade do schema;
    - não implementar módulos fora do escopo v1 sem atualização deste documento.
15. **Manutenção do documento** — declaração explícita de que este é o **documento oficial de contexto do GitHub Copilot** para o app mobile e deve ser **mantido atualizado** sempre que houver mudanças relevantes na arquitetura do Seialz (schema, RLS, edge functions, integrações, padrões) ou expansão de escopo do app.

## Fontes usadas

- Memórias do projeto (`mem://index.md` e submemórias relevantes ao escopo v1).
- Arquivos-chave já em contexto: `AuthContext`, `OrganizationContext`, `usePermissions`, `dispatchWhatsAppSend`, edge functions `_shared/*`, `DESIGN_SYSTEM.md`.
- Lista de tabelas Supabase (filtrada para o escopo v1).

## Formato

- Markdown puro, sem emojis.
- Diagramas em blocos ```text``` quando necessário.
- Sem limite de tamanho, mas focado no escopo v1.
- Nenhuma alteração em código da aplicação.
