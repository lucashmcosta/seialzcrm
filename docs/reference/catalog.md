# Seialz — Catálogo de Ownership por Domínio

> Toda tabela, trigger relevante e edge function tem UM domínio dono. Objeto novo sem linha aqui = doc incompleta.
> Formato simples (markdown) por decisão consciente — ver [ADR-0008](../decisions/0008-domain-ownership-catalog.md); promover a YAML+CI quando houver time.

## Domínio técnico ↔ módulo de produto

Os **domínios técnicos** (agrupamento por ownership de objetos do banco, herdado da descoberta no banco vivo) não coincidem 1:1 com os **módulos de produto** (`docs/modules/`, espelho das rotas da UI). Esta tabela é o mapa oficial entre as duas taxonomias:

| Domínio Técnico | Módulo de Produto | Documentação Principal |
|---|---|---|
| contacts | Contatos + Empresas | [`modules/contacts/`](../modules/contacts/README.md), [`modules/companies/`](../modules/companies/README.md) |
| opportunities | Oportunidades | [`modules/opportunities/`](../modules/opportunities/README.md) |
| messaging | Messages (comercial) **e** Inbox (atendimento) — separação por decisão de negócio, ver [`product/channel-boundaries.md`](../product/channel-boundaries.md) | [`modules/messages/`](../modules/messages/README.md), [`modules/inbox/`](../modules/inbox/README.md) |
| assignment | Transversal (round-robin de contatos, oportunidades e threads) — sem módulo próprio | [`modules/messages/`](../modules/messages/README.md) e [`modules/opportunities/`](../modules/opportunities/README.md); rota de config em `/settings/round-robin` |
| intelligence | Inteligência | [`modules/intelligence/`](../modules/intelligence/README.md) |
| knowledge-ai | Agente IA + Base de Conhecimento (superfícies distintas na UI) | [`modules/ai-agent/`](../modules/ai-agent/README.md), [`modules/knowledge-base/`](../modules/knowledge-base/README.md) |
| marketing-attribution | Marketing | [`modules/marketing/`](../modules/marketing/README.md) |
| tasks-activities | Tarefas (+ atividades e notificações transversais) | [`modules/tasks/`](../modules/tasks/README.md) |
| tenancy-security | Admin + Settings + Billing | [`modules/admin/`](../modules/admin/README.md), [`modules/settings/`](../modules/settings/README.md), [`modules/billing/`](../modules/billing/README.md), [`platform/security/`](../platform/security/README.md) |
| integrations/whatsapp | WhatsApp Templates (módulo) + canais | [`modules/whatsapp-templates/`](../modules/whatsapp-templates/README.md), [`integrations/whatsapp-meta-cloud/`](../integrations/whatsapp-meta-cloud/README.md), [`integrations/whatsapp-twilio/`](../integrations/whatsapp-twilio/README.md) |
| integrations/twilio-voice | Chamadas (transversal em contatos/threads) | [`integrations/voice-twilio/`](../integrations/voice-twilio/README.md) |
| integrations/kommo | Import/mirror (Settings → Integrations) | [`integrations/kommo/`](../integrations/kommo/README.md) |
| integrations/nammux | ERP mirror (Settings → Integrations) | [`integrations/nammux/`](../integrations/nammux/README.md) |
| integrations/suvsign | Documentos/contratos (Settings → Documents) | [`integrations/suvsign/`](../integrations/suvsign/README.md) |
| pipelines (transversal) | Filas outbox/inbound — sem UI própria | [`operations/README.md`](../operations/README.md) (arquitetura de filas), [ADR-0004](../decisions/0004-inbound-events-queue.md) |
| observability | Kairos Mission Control (projeto à parte) | [`platform/observability/`](../platform/observability/README.md) |

> **Precedência:** quando houver divergência, a tabela Domínio Técnico → Módulo de Produto acima prevalece sobre a coluna "Doc" da tabela de ownership abaixo.

## Ownership de objetos por domínio

| Domínio | Doc | Tabelas principais | Edge functions | Triggers-chave |
|---|---|---|---|---|
| contacts | [`modules/contacts/`](../modules/contacts/README.md) | contacts, contact_memories, contacts_merge_log, companies, tags, tag_assignments, custom_field_* | create-user (parcial), lead-webhook, backfill-attribution, ct-backfill-once | round_robin, normalize_phone, capi_lead, publish_event, marketing_campaign_fk |
| opportunities | [`modules/opportunities/`](../modules/opportunities/README.md) | opportunities, opportunity_behavior_snapshot, pipeline_stages, products, sales_events | fix-orphan-opportunities | sync_status_from_stage, emit_won, capi_purchase, promote_contact, finalize_snapshot, round_robin, publish_event |
| messaging | [`modules/messages/`](../modules/messages/README.md) + [`modules/inbox/`](../modules/inbox/README.md) | messages, message_threads, message_thread_reads, message_snippets, message_response_times, attachments, audio_transcriptions, communication_endpoints, scheduled_messages, thread_* | scheduled-messages-cron, export-conversations, transcribe-audio, analyze-message | update_thread_last_message, smart_reopen, intelligence_enqueue, touch_snapshot, sanitize_agent, inbound_status, response_time, parse_lead_source, validate_thread_endpoint_org, autofill_business_context |
| assignment | ver tabela acima (transversal) | thread_assignment_history, thread_routing_rules, escalation_targets, team_memberships | — | trg_contacts/opportunities/threads_round_robin + RPCs assign_round_robin, reassign_thread, take_over_thread |
| intelligence | [`modules/intelligence/`](../modules/intelligence/README.md) | intelligence_jobs/settings/*, message_analyses, seller_metrics_daily | intelligence-worker, -ghosting-detector, -rollup-cron, -retention-cron, -backfill-runner | intelligence_enqueue (em messages), settings_audit |
| knowledge-ai | [`modules/ai-agent/`](../modules/ai-agent/README.md) + [`modules/knowledge-base/`](../modules/knowledge-base/README.md) | knowledge_*, ai_agents, ai_agent_*, ai_usage_logs, ai_interaction_logs, agent_pending_questions, provider_pricing, organization_api_keys | ai-generate, ai-agent-respond, generate-embedding, *-knowledge*, knowledge-wizard, wizard-*, classify-agent-feedback, byok-*, migrate-legacy-ai-key | materialize_resolved_content, propagate_global_changes |
| marketing-attribution | [`modules/marketing/`](../modules/marketing/README.md) | marketing_campaigns, marketing_campaign_insights_daily, marketing_attribution_ambiguities, capi_event_log, lead_forms, lead_form_questions, meta_lead_pages, sales_events (compart.) | meta-capi-*, meta-lead-ads-*, meta-discover-*, marketing-insights-sync-daily, marketing-campaign-enrich ⚠️, meta-ads-manager-save, backfill-attribution, viagi-staging-loader | marketing_campaign_enrich_async, populate_contact_marketing_campaign_fk, capi_* |
| tasks-activities | [`modules/tasks/`](../modules/tasks/README.md) | tasks, activities, notifications, calls (activity), audit_logs | — | task_activity, task_assigned_notification, create_*_activity, audit_log_trigger |
| tenancy-security | [`platform/security/`](../platform/security/README.md) | organizations, users, user_organizations, permission_profiles, invitations, admin_*, impersonation_sessions, feature_flags, subscriptions, plans, subscription_usage | admin-impersonate*, admin-list-orgs-for-switch, create-user, health | handle_new_user, org_intelligence_settings; RPCs de RLS (current_user_*, is_org_admin, user_has_org_access...) |
| integrations/whatsapp | [`integrations/whatsapp-meta-cloud/`](../integrations/whatsapp-meta-cloud/README.md) + [`integrations/whatsapp-twilio/`](../integrations/whatsapp-twilio/README.md) | whatsapp_templates, whatsapp_template_actions, organization_phone_numbers, communication_endpoints (compart.) | twilio-whatsapp-*, meta-whatsapp-*, meta-wa-diagnose, twilio-message-debug ⚠️ | update_whatsapp_templates_updated_at; dispatcher em _shared/dispatch-whatsapp-send.ts |
| integrations/twilio-voice | [`integrations/voice-twilio/`](../integrations/voice-twilio/README.md) | calls, call_recordings | twilio-call, twilio-token, twilio-setup, twilio-webhook, twilio-media-proxy | call_activity_trigger |
| integrations/kommo | [`integrations/kommo/`](../integrations/kommo/README.md) | kommo_user_mappings, external_mappings (compart.) | kommo-* (8) | manage_kommo_subscriptions; RPCs rpc_kommo_upsert_* |
| integrations/nammux | [`integrations/nammux/`](../integrations/nammux/README.md) | external_mappings (compart.), v_entity_sync_status | nammux-* (4) | sync_nammux_subscription; fn_sync_nammux_subscription, fn_build_opportunity_won_payload |
| integrations/suvsign | [`integrations/suvsign/`](../integrations/suvsign/README.md) | document_submissions, document_types | suvsign-webhook | document_*_set_updated_at |
| pipelines (transversal) | [`operations/README.md`](../operations/README.md) | integration_events, integration_jobs, integration_subscriptions, integration_inbound_*, integration_audit_logs, outbox_system_heartbeats, organization_integrations, admin_integrations | integration-worker, integration-inbound-dispatcher, outbox-health | fanout_event, publish_integration_event; RPCs rpc_claim_*, fn_outbox_*, fn_inbound_* |
| observability | [`platform/observability/`](../platform/observability/README.md) (Kairos Mission Control é projeto à parte) | webhook_logs?, import_logs, kairos_* RPCs, user_sessions | health | — |

**Sem dono ainda (classificar na Onda 3):** documentation, compliance_blocks, coupons/coupon_redemptions, saved_views, support_categories, support_sla_configs, webhook_field_mappings, organization_usage_metrics, import_logs.
