# Fase 2.5 — UI Comercial estilo Kommo (frontend only)

Backend congelado. Nada de SQL, migração, trigger, webhook, Edge Function, feature flag nova ou Atendimento. Somente leitura das APIs/tabelas já existentes via cliente Supabase.

## Bloqueadores/limitações reais do backend (antes de implementar)

1. **Switch do Resolver não pode ser escrito na tela da organização.** `feature_flags` tem `SELECT` liberado para qualquer autenticado, mas todo `UPDATE`/`ALL` exige `is_admin_user()` (admin de plataforma). Portanto em Configurações > Integrações > WhatsApp Comercial o switch será **read-only** (indicador ON = "Route Resolver V2" / OFF = "Modo legado") com link para `/admin/feature-flags`, onde o toggle real já existe. Habilitar escrita para org exigiria mudar RLS — fora do escopo aprovado.
2. **Histórico de números não pode vir da auditoria de merge.** `message_thread_merge_audit` só é legível por `is_admin_user()`. O histórico ("Recebeu mensagens por 2890 → 5098 → 8439") será derivado de `messages.endpoint_id` distintos da própria thread canônica (ordenados pela primeira ocorrência) — dado legível e suficiente.
3. **Threads legadas outbound-only (3.089)** não têm inbound roteável: a Route/número ativo aparecerá como "Sem Route" / "Envio bloqueado (REPLY_ROUTE_UNRESOLVED)" — reflete o contrato fail-closed já aprovado, sem fallback.

Se essas três interpretações estiverem OK, o resto da UI é implementável 100% com o backend atual.

## O que será construído

### Novos hooks (somente leitura)
- `useSalesRoute(threadId)` — reusa `resolveSalesReplyRoute` (já existe em `src/lib/salesReplyRoute.ts`, sem alterá-lo) + busca de `messaging_lines` (nome, `inbox_key`, `channel`, `is_active`, `active_endpoint_id`) e `communication_endpoints` (endereço, provider, status) para expor: Route, linha, endpoint ativo, provider, última inbound roteável, motivo (`resolved` | `flag_off` | `REPLY_ROUTE_UNRESOLVED`).
- `useThreadEndpointHistory(threadId)` — endpoints distintos usados pelas mensagens da thread, na ordem de primeira ocorrência (fonte dos divisores da timeline e do bloco "Recebeu mensagens por").
- `useSalesRouteConfig(organizationId)` — Route(s) `inbox_key='sales'` + `messaging_line_endpoints` vinculados + status/provider de cada endpoint, para a tela de Configurações.
- `useRouteResolverFlag(organizationId)` — leitura de `feature_flags.conv_route_resolver_v2` (ON/OFF + escopo por org).

### Componentes novos (`src/components/messages/route/`)
- `RouteBadge` — "Comercial · 8439 · Evolution" (substitui o uso de `Novo · XXXX` no Comercial).
- `ProviderChip`, `EndpointStatusChip` (Online/Offline/Sem Route).
- `SalesConversationHeader` — nome, contato, responsável, status, "Respondendo por +55 11 93619-8439 / Evolution API", histórico informativo.
- `EndpointSwitchDivider` — divisor na timeline "Número alterado 2890 → 8439".
- `SalesRoutePanel` — painel lateral read-only: Thread ID, Route, Linha, Provider, Endpoint ativo, Endpoints históricos, Última inbound roteável, Assignee, Status, Canal, Business Context.
- `SalesRouteDetailsDialog` — modal com os mesmos dados + último outbound, feature flag ativa e resolver utilizado (V2 vs legado).
- `SalesWhatsAppSettingsSection` — seção "WhatsApp Comercial" em Configurações > Integrações: Route, Inbox, Canal, número ativo, provider, status, endpoints vinculados e o indicador do Resolver V2 (read-only, item 1 acima).

### Páginas/arquivos alterados
- `src/pages/messages/MessagesList.tsx` (`/commercial`): lista filtrada por `merged_into_thread_id IS NULL` (uma conversa por contato), card com nome/status/responsável/última mensagem/última atividade + `RouteBadge`; header substituído por `SalesConversationHeader`; divisores de troca de endpoint na timeline; botão que abre o modal e o painel de detalhes.
- `src/components/settings/IntegrationsSettings.tsx`: monta a nova seção "WhatsApp Comercial" na categoria WhatsApp.
- `EndpointBadge` permanece intacto e continua usado pelo Atendimento (`InboxThreadList`); o Comercial passa a usar `RouteBadge`. Nenhum componente do Atendimento é modificado.

### Verificação
- `tsgo` + suíte de testes existente.
- Screenshots via Playwright: Inbox Comercial, Conversa, Modal, Configurações/Integrações, seção WhatsApp Comercial com o indicador do Resolver.
- Checagem de não-regressão do Atendimento (`/inbox`) por screenshot e diff de arquivos.

## Entrega final
Lista de componentes/páginas alteradas, lista de tabelas/APIs consumidas, screenshots antes×depois e confirmação explícita de zero alteração em SQL, webhooks, Edge Functions, triggers, feature flags e Atendimento.
