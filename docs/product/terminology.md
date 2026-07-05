# Terminologia

Vocabulário do produto conforme aparece em código, tabelas e UI.

## Mapeamento PT (fala do produto) ↔ EN (tabelas / código)

| Português (produto/UI) | Inglês (tabela/código) | Módulo |
|---|---|---|
| Contatos | `contacts` | [`modules/contacts`](../modules/contacts/) |
| Empresas | `companies` | [`modules/companies`](../modules/companies/) |
| Oportunidades / Negócios | `opportunities` | [`modules/opportunities`](../modules/opportunities/) |
| Tarefas | `tasks` | [`modules/tasks`](../modules/tasks/) |
| Atividades | `activities` | (transversal) |
| Atendimento / Conversas / Inbox | `message_threads` + `messages` | [`modules/messages`](../modules/messages/), [`modules/inbox`](../modules/inbox/) |
| Modelos WhatsApp | `whatsapp_templates` | [`modules/whatsapp-templates`](../modules/whatsapp-templates/) |
| Snippets | `message_snippets` | [`modules/settings`](../modules/settings/) |
| Campanhas / Marketing | `marketing_campaigns` + `capi_event_log` | [`modules/marketing`](../modules/marketing/) |
| Anúncios | `marketing_campaign_insights_daily` | [`modules/marketing`](../modules/marketing/) |
| Atribuição de leads | `marketing_attribution_ambiguities` | [`modules/marketing`](../modules/marketing/) |
| Agente IA | `ai_agents` + `ai_agent_*` | [`modules/ai-agent`](../modules/ai-agent/) |
| Base de conhecimento | `knowledge_items` + `knowledge_chunks` + `knowledge_embeddings` | [`modules/knowledge-base`](../modules/knowledge-base/) |
| Inteligência | `intelligence_jobs` + `message_analyses` + `seller_metrics_daily` | [`modules/intelligence`](../modules/intelligence/) |
| Round-robin / Fila | `thread_routing_rules` + `thread_assignment_history` | [`modules/messages`](../modules/messages/) |
| Documentos / Contratos | `document_types` + `document_submissions` | [`integrations/suvsign`](../integrations/suvsign/) |
| Chamadas / Voz | `calls` + `call_recordings` | [`integrations/voice-twilio`](../integrations/voice-twilio/) |
| Organizações / Tenants | `organizations` | [`modules/settings`](../modules/settings/) |
| Assinaturas / Plano | `subscriptions` + `plans` | [`modules/billing`](../modules/billing/) |
| Cupons | `coupons` + `coupon_redemptions` | [`modules/billing`](../modules/billing/) |
| Usuários / Perfis / Permissões | `users` + `user_organizations` + `permission_profiles` | [`modules/settings`](../modules/settings/) |
| Impersonação | `impersonation_sessions` | [`modules/admin`](../modules/admin/) |
| Auditoria | `audit_logs` + `admin_audit_logs` | (transversal) |
| Integrações | `organization_integrations` + `admin_integrations` | [`integrations/`](../integrations/) |
| Outbox (Seialz → mundo) | `integration_events` + `integration_jobs` | [`operations`](../operations/README.md) |
| Inbound (mundo → Seialz) | `integration_inbound_events` + `_claims` + `_dead_letter_archive` | [`operations`](../operations/README.md) |

## Superfícies de auth

| Termo | Descrição | Fonte |
|---|---|---|
| Usuário CRM | Membro de organização | `AuthContext`, `users` |
| Admin de plataforma | Operador Seialz (MFA obrigatório) | `useAdminAuth`, `admin_users` |
| Impersonação | Admin operando como org | `admin-impersonate*` + `impersonation_sessions` |

## Objetos do sistema (não são "módulos" mas aparecem no vocabulário)

| Termo | Definição |
|---|---|
| Endpoint de comunicação | Número/canal remetente da org (`communication_endpoints`) |
| Handler de ingest | Roteador por integração no dispatcher inbound |
| BYOK | Bring Your Own Key — chave de LLM da própria org |
| CAPI | Meta Conversions API (`capi_event_log`) |
| CTWA | Click-to-WhatsApp (Meta Ads) |
| Janela 24h | Regra WhatsApp que limita mensagens livres a 24h após último inbound |
| Realtime | Canais Supabase (frontend inscreve com RLS aplicada) |

## Tenants ativos (produção 2026-07-04)

11 organizações ativas. Principais: **Central Trabalhista** e **Viagi**. `parse_lead_source_marker_from_message` tem UUID da Central Trabalhista hardcoded — ver drift #8.
