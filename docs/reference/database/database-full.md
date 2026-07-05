# Seialz — Referência do Banco de Dados (GERADO)

> **⚠️ ARQUIVO GERADO do banco vivo. Não edite à mão — regenere.**
> Projeto: `qvmtzfvkhkhkhdpclzua` (Seialz DB, sa-east-1, Postgres 17)
> Gerado em: 2026-07-04 | Fonte: information_schema + pg_catalog do banco de produção

## 1. Sumário

| Métrica | Valor |
|---|---|
| Tabelas (public) | 117 |
| Functions Postgres | 257 (48 trigger + ~85 RPCs/helpers de negócio + ~124 internas do pgvector) |
| Triggers ativas | 107 |
| Migrations aplicadas | 184 (última: `20260705005328`) — ⚠️ repo tem 261 (ver DRIFT-REPORT) |
| Views | 11 |
| Policies RLS | 232 (cobertura total — 0 tabelas sem RLS) |
| Cron jobs (pg_cron) | 15 |
| Edge functions deployadas | 88 |
| Tabelas no realtime | 7: calls, document_submissions, document_types, import_logs, message_threads, messages, notifications |

## 2. Tabelas por domínio (contagem de linhas em 2026-07-04)

### CRM Core — contacts / companies / opportunities
contacts (24.960), contacts_merge_log (228), contact_memories (5.442), companies (10), opportunities (18.038), opportunity_behavior_snapshot (11.297), opportunities_status_backup_20260512 (1.559) ⚠️drift, pipeline_stages (57), products (5), custom_field_definitions (29), custom_field_values (0), tags (1.604), tag_assignments (4.174), saved_views (1)

### Messaging / Inbox
messages (177.463), message_threads (12.935), message_thread_reads (15.151), message_thread_merge_audit (36), message_attachments → attachments (2.425), message_snippets (8), message_analyses (36.206), message_response_times (20.138), scheduled_messages (3), thread_assignment_history (2.096), thread_routing_rules (0), communication_endpoints (20), communication_endpoints_purpose_audit (4), audio_transcriptions (3.096), calls (5.082), call_recordings (20)
⚠️drift: messages_endpoint_backfill_2b (92.106), message_threads_business_context_backfill (17.285), message_threads_business_context_backfill_20260703 (308), message_threads_business_context_backfill_null_20260703 (38), message_threads_primary_endpoint_backfill (3.967)

### WhatsApp
whatsapp_templates (148), whatsapp_template_actions (9), organization_phone_numbers (4)

### Pipelines de integração (outbox/inbound)
integration_events (129.660), integration_jobs (5.678), integration_subscriptions (14), integration_audit_logs (11.217), integrations (0), organization_integrations (26), admin_integrations (15), integration_feature_flags (5), external_mappings (3), outbox_system_heartbeats (1)
Inbound: integration_inbound_events (110.473), integration_inbound_event_claims (0), integration_inbound_handlers (1), integration_inbound_ingest_errors (281), integration_inbound_dead_letter_archive (0), integration_inbound_dry_run_log (155)

### Marketing / Attribution
marketing_campaigns (70), marketing_campaign_insights_daily (1.025), marketing_campaign_spend_history (0), marketing_attribution_ambiguities (293), capi_event_log (10.212), lead_forms (3), lead_form_questions (11), meta_lead_pages (2), sales_events (19.045)

### Intelligence
intelligence_jobs (119.490), intelligence_settings (11), intelligence_settings_audit (0), intelligence_backfill_runs (5), seller_metrics_daily (373)

### Knowledge / AI
knowledge_items (15), knowledge_chunks (31), knowledge_embeddings (1), knowledge_item_history (2), knowledge_edit_requests (6), ai_agents (5), ai_agent_versions (5), ai_agent_logs (172), ai_interaction_logs (125), ai_usage_logs (43.630), agent_pending_questions (0), provider_pricing (10), organization_api_keys (1)

### Tenancy / Auth / Admin
organizations (11), users (64), user_organizations (64), user_sessions (399), permission_profiles (22), team_memberships (0), invitations (0), admin_users (2), admin_sessions (0), admin_audit_logs (77), admin_notifications (0), admin_one_off_jobs (0), admin_one_off_job_items (0), impersonation_sessions (30), feature_flags (0), compliance_blocks (0)

### Billing / Plans
subscriptions (11), subscription_usage (1), plans (4), coupons (0), coupon_redemptions (0), organization_usage_metrics (1)

### Suporte / Documentos / Diversos
support_categories (60), support_sla_configs (10), escalation_targets (10), document_submissions (7), document_types (5), documentation (0), import_logs (5), kommo_user_mappings (12), kommo (via edge functions), webhook_field_mappings (0), notifications (328.705), activities (403.856), audit_logs (292.321), tasks (1.322)
⚠️drift: backup_meta_backfill_2026_05_28_contacts (0)

## 3. Views (11)
best_time_per_contact, intelligence_stale_claims_metrics, v_entity_sync_status, vw_intel_sellers_30d, vw_intel_won_vs_lost_30d, vw_marketing_ad_performance, vw_marketing_campaign_summary, vw_marketing_funnel, vw_org_monthly_cost_byok, vw_org_monthly_cost_managed, vw_org_provider_keys

## 4. Extensões
plpgsql 1.0, pg_stat_statements 1.11, uuid-ossp 1.1, pgcrypto 1.3, supabase_vault 0.3.1, hypopg 1.4.1, index_advisor 0.2.0, pg_trgm 1.6, unaccent 1.1, **vector 0.8.0** (pgvector — knowledge embeddings), **pg_cron 1.6.4**, **pg_net 0.19.5** (http_post de dentro do banco)

## 5. Cron jobs (pg_cron — 15 ativos)

| Job | Schedule | O que faz |
|---|---|---|
| integration-worker | 30 seconds | http_post → edge fn `integration-worker` (processa outbox `integration_jobs`) |
| intelligence-worker-30s | 30 seconds | http_post → `intelligence-worker` (processa `intelligence_jobs`) |
| outbox-reaper | * * * * * | `fn_reap_stuck_jobs(5)` — solta jobs presos >5min |
| intelligence-backfill-tick | */2 * * * * | `trigger_intelligence_backfill(resume)` por run ativa |
| meta-lead-ads-poll | */3 * * * * | http_post → `meta-lead-ads-poll` (poll de leads do Meta) |
| meta-capi-retry-cron | */5 * * * * | http_post → `meta-capi-retry-cron` (retry de eventos CAPI falhos) |
| intelligence-reap-stale-jobs | */5 * * * * | `intelligence_reap_stale_jobs(30,5)` |
| intelligence-ghosting-hourly | 0 * * * * | http_post → `intelligence-ghosting-detector` |
| integration-inbound-events-cleanup | 0 3 * * * | DELETE de `integration_inbound_events` expirados/processados |
| intelligence-rollup-daily | 15 3 * * * | http_post → `intelligence-rollup-cron` |
| intelligence-retention-daily | 30 4 * * * | http_post → `intelligence-retention-cron` |
| meta-discover-ads-cron | 30 5 * * * | http_post → `meta-discover-ads-cron` |
| marketing-insights-sync-daily-cron | 0 6 * * * | http_post → `marketing-insights-sync-daily` |
| meta-lead-ads-token-health | 0 8 * * * | http_post → `meta-lead-ads-token-health` |
| marketing-campaign-enrich-cron | 0 */6 * * * | http_post → `marketing-campaign-enrich` ⚠️ function não está no repo |

> ⚠️ `scheduled-messages-cron` está DEPLOYADA mas não tem cron job — ver DRIFT-REPORT item 3.

## 6. Mapa de triggers (107) — tabela | trigger | timing/evento | function

```
admin_users | update_admin_users_updated_at | BEFORE UPD | update_updated_at_column
ai_agents | update_ai_agents_updated_at | BEFORE UPD | update_updated_at_column
calls | call_activity_trigger | AFTER INS | create_call_activity
capi_event_log | capi_event_log_set_updated_at | BEFORE UPD | update_updated_at_column
communication_endpoints | trg_comm_endpoints_updated_at | BEFORE UPD | update_updated_at_column
companies | audit_companies_changes | AFTER INS/DEL/UPD | audit_log_trigger
companies | update_companies_updated_at | BEFORE UPD | update_updated_at_column
contact_memories | update_contact_memories_updated_at | BEFORE UPD | update_updated_at_column
contacts | audit_contacts_delete | AFTER DEL | audit_log_trigger          ⚠️ duplicado
contacts | audit_contacts_insert | AFTER INS | audit_log_trigger          ⚠️ duplicado
contacts | audit_contacts_update | AFTER UPD | audit_log_trigger          ⚠️ duplicado
contacts | contacts_audit_trigger | AFTER INS/DEL/UPD | audit_log_trigger ⚠️ duplicado
contacts | contacts_round_robin | BEFORE INS | trg_contacts_round_robin
contacts | contacts_round_robin_audit | AFTER INS | trg_contacts_round_robin_audit
contacts | trg_capi_lead_on_contact_insert | AFTER INS | fn_capi_trigger_lead_on_contact
contacts | trg_capi_lead_on_contact_update | AFTER UPD | fn_capi_trigger_lead_on_contact
contacts | trg_contacts_normalize_phone | BEFORE INS/UPD | contacts_set_phone_normalized
contacts | trg_populate_contact_marketing_campaign_fk | BEFORE INS/UPD | fn_populate_contact_marketing_campaign_fk
contacts | trg_publish_event_contacts | AFTER INS/UPD | fn_publish_integration_event
contacts | update_contacts_updated_at | BEFORE UPD | update_updated_at_column
coupons | update_coupons_updated_at | BEFORE UPD | update_updated_at_column
custom_field_definitions | update_custom_field_definitions_updated_at | BEFORE UPD | update_updated_at_column
custom_field_values | update_custom_field_values_updated_at | BEFORE UPD | update_updated_at_column
document_submissions | document_submissions_set_updated_at | BEFORE UPD | update_updated_at_column
document_types | document_types_set_updated_at | BEFORE UPD | update_updated_at_column
escalation_targets | set_updated_at_escalation_targets | BEFORE UPD | update_updated_at_column
integration_events | trg_fanout_integration_event | AFTER INS | fn_fanout_event
integrations | update_integrations_updated_at | BEFORE UPD | update_updated_at_column
intelligence_backfill_runs | trg_backfill_runs_updated_at | BEFORE UPD | update_updated_at_column
intelligence_settings | trg_intelligence_settings_audit | AFTER UPD | intelligence_settings_audit_trigger
intelligence_settings | trg_intelligence_settings_updated_at | BEFORE UPD | update_updated_at_column
knowledge_embeddings | update_knowledge_embeddings_updated_at | BEFORE UPD | update_updated_at_column
knowledge_items | trg_materialize_resolved_content | BEFORE INS/UPD | materialize_resolved_content
knowledge_items | trg_propagate_global_changes | AFTER UPD | propagate_global_changes
knowledge_items | trigger_update_knowledge_items_updated_at | BEFORE UPD | update_knowledge_items_updated_at
lead_form_questions | trg_lead_form_questions_recheck_form | AFTER INS/UPD | lead_form_questions_check_form_configured
lead_form_questions | trg_lead_form_questions_updated_at | BEFORE UPD | set_updated_at_lead_forms
lead_forms | trg_lead_forms_updated_at | BEFORE UPD | set_updated_at_lead_forms
marketing_attribution_ambiguities | trg_mkt_ambig_updated_at | BEFORE UPD | update_updated_at_column
marketing_campaign_insights_daily | update_marketing_insights_daily_updated_at | BEFORE UPD | update_updated_at_column
marketing_campaign_spend_history | spend_history_set_updated_at | BEFORE UPD | update_updated_at_column
marketing_campaigns | marketing_campaigns_set_updated_at | BEFORE UPD | update_updated_at_column
marketing_campaigns | trg_marketing_campaign_enrich_async | AFTER INS/UPD | fn_marketing_campaign_enrich_async
message_analyses | trg_validate_message_analysis_v2 | BEFORE INS/UPD | validate_message_analysis_v2
message_analyses | trg_validate_message_analysis_v21 | BEFORE INS/UPD | validate_message_analysis_v21
message_snippets | update_message_snippets_updated_at | BEFORE UPD | update_updated_at_column
message_threads | threads_round_robin | BEFORE INS | trg_threads_round_robin
message_threads | trg_handoff_notification | AFTER UPD | handle_handoff_notification
message_threads | trg_log_thread_assignment_change | AFTER UPD | fn_log_thread_assignment_change
message_threads | trg_message_threads_autofill_business_context | BEFORE INS | fn_message_threads_autofill_business_context
message_threads | trg_validate_thread_endpoint_org | BEFORE INS/UPD | fn_validate_thread_endpoint_org
message_threads | update_message_threads_updated_at | BEFORE UPD | update_updated_at_column
messages | message_activity_trigger | AFTER INS | create_message_activity
messages | messages_smart_reopen | AFTER INS | trg_messages_smart_reopen
messages | new_message_notification | AFTER INS | notify_new_message
messages | trg_calc_message_response_time | AFTER INS | fn_calc_message_response_time
messages | trg_inbound_message_status | AFTER INS | handle_inbound_message_status
messages | trg_messages_intelligence_enqueue | BEFORE INS | fn_messages_intelligence_enqueue
messages | trg_messages_touch_snapshot | AFTER INS | fn_messages_touch_snapshot
messages | trg_parse_lead_source_marker | AFTER INS | parse_lead_source_marker_from_message
messages | trg_publish_event_messages | AFTER INS | fn_publish_integration_event
messages | trg_update_thread_last_message | AFTER INS/DEL/UPD | fn_update_thread_last_message
messages | trigger_sanitize_agent_message | BEFORE INS | sanitize_agent_message
messages | trigger_sanitize_agent_message_update | BEFORE UPD | sanitize_agent_message
meta_lead_pages | trg_meta_lead_pages_updated_at | BEFORE UPD | set_updated_at_lead_forms
opportunities | audit_opportunities_delete | AFTER DEL | audit_log_trigger          ⚠️ duplicado
opportunities | audit_opportunities_insert | AFTER INS | audit_log_trigger          ⚠️ duplicado
opportunities | audit_opportunities_update | AFTER UPD | audit_log_trigger          ⚠️ duplicado
opportunities | opportunities_audit_trigger | AFTER INS/DEL/UPD | audit_log_trigger ⚠️ duplicado
opportunities | opportunities_round_robin | BEFORE INS | trg_opportunities_round_robin
opportunities | opportunity_stage_change_trigger | AFTER UPD | create_stage_change_activity
opportunities | opportunity_won_notification | AFTER UPD | notify_opportunity_won
opportunities | trg_capi_purchase_on_opp_won | AFTER UPD | fn_capi_trigger_purchase_on_opp
opportunities | trg_emit_opportunity_won | AFTER INS/UPD | fn_emit_opportunity_won_event
opportunities | trg_opportunity_won_promote_contact | AFTER INS/UPD | fn_opportunity_won_promote_contact
opportunities | trg_opps_finalize_snapshot | AFTER UPD | fn_opps_finalize_snapshot
opportunities | trg_publish_event_opportunities | AFTER INS/UPD | fn_publish_integration_event
opportunities | trg_sync_opportunity_status_from_stage | BEFORE INS/UPD | sync_opportunity_status_from_stage
opportunities | update_opportunities_updated_at | BEFORE UPD | update_updated_at_column
organization_integrations | trg_manage_kommo_subscriptions | AFTER INS/UPD | fn_manage_kommo_subscriptions
organization_integrations | trg_sync_nammux_subscription | AFTER INS/UPD | fn_trg_sync_nammux_subscription
organization_phone_numbers | update_organization_phone_numbers_updated_at | BEFORE UPD | update_updated_at_column
organizations | trg_org_intelligence_settings | AFTER INS | create_intelligence_settings_for_new_org
organizations | update_organizations_updated_at | BEFORE UPD | update_updated_at_column
permission_profiles | update_permission_profiles_updated_at | BEFORE UPD | update_updated_at_column
pipeline_stages | update_pipeline_stages_updated_at | BEFORE UPD | update_updated_at_column
plans | update_plans_updated_at | BEFORE UPD | update_updated_at_column
products | update_products_updated_at | BEFORE UPD | update_updated_at_column
saved_views | update_saved_views_updated_at | BEFORE UPD | update_updated_at_column
scheduled_messages | update_scheduled_messages_updated_at | BEFORE UPD | update_updated_at_column
subscriptions | update_subscriptions_updated_at | BEFORE UPD | update_updated_at_column
support_categories | set_updated_at_support_categories | BEFORE UPD | update_updated_at_column
support_sla_configs | set_updated_at_support_sla_configs | BEFORE UPD | update_updated_at_column
tags | update_tags_updated_at | BEFORE UPD | update_updated_at_column
tasks | audit_tasks_delete | AFTER DEL | audit_log_trigger          ⚠️ duplicado
tasks | audit_tasks_insert | AFTER INS | audit_log_trigger          ⚠️ duplicado
tasks | audit_tasks_update | AFTER UPD | audit_log_trigger          ⚠️ duplicado
tasks | tasks_audit_trigger | AFTER INS/DEL/UPD | audit_log_trigger ⚠️ duplicado
tasks | task_activity_trigger | AFTER INS | create_task_activity
tasks | task_assigned_notification | AFTER INS/UPD | notify_task_assigned
tasks | update_tasks_updated_at | BEFORE UPD | update_updated_at_column
team_memberships | set_updated_at_team_memberships | BEFORE UPD | update_updated_at_column
thread_routing_rules | set_updated_at_thread_routing_rules | BEFORE UPD | update_updated_at_column
user_organizations | update_user_organizations_updated_at | BEFORE UPD | update_updated_at_column
users | update_users_updated_at | BEFORE UPD | update_updated_at_column
webhook_field_mappings | update_webhook_field_mappings_updated_at | BEFORE UPD | update_updated_at_column
whatsapp_templates | update_whatsapp_templates_updated_at | BEFORE UPD | update_updated_at_column
```

## 7. RPCs e helpers de negócio (assinaturas — extensões pgvector omitidas)

### Round-robin / Assignment
```
assign_round_robin(_org_id uuid) -> uuid
assign_round_robin(_org_id uuid, _queue text) -> uuid
get_default_queue_for_thread(_thread_id uuid) -> TABLE(queue, suggested_user_id)
reassign_thread(_thread_id uuid, _to_user_id uuid, _reason text) -> jsonb
take_over_thread(_thread_id uuid, _reason text) -> jsonb
```

### Inbox / Threads / Mensagens
```
rpc_list_inbox_threads(p_organization_id, p_tab, p_only_mine, p_assigned_user_id, p_resolved_since, ...) -> SETOF jsonb
rpc_inbox_queue_counts(p_organization_id, p_only_mine, p_assigned_user_id, p_resolved_since) -> TABLE(active, waiting, resolved_today)
rpc_list_message_threads(...) -> TABLE(...)   [2 overloads — candidato a consolidação]
rpc_get_message_threads_by_ids(p_organization_id, p_thread_ids uuid[]) -> TABLE(...)
merge_message_threads(p_winner uuid, p_loser uuid, p_batch uuid) -> void
unmerge_message_thread(p_loser uuid) -> void
resolve_communication_endpoint(_organization_id, _channel, _address) -> uuid
```

### Contacts / Opportunities / Dashboard
```
rpc_search_contacts(p_organization_id, p_search, p_owner_user_id, p_lifecycle_stage, p_created_from, ...) -> TABLE(...)
get_opportunities_by_stage(p_organization_id, p_limit_per_stage) -> json   [2 overloads]
get_opportunity_stage_counts(org_id) -> TABLE(stage_id, opportunity_count, total_amount)
get_dashboard_stats(p_organization_id, p_days_ago, p_owner_user_id) -> json
get_service_dashboard_stats(p_org, p_from, p_to, p_owner) -> TABLE(...)
get_service_worst_responses(p_org, p_from, p_to, p_owner, p_kind) -> TABLE(...)
normalize_phone_br(phone_input text) -> text
```

### Pipeline Outbox (integration_events → integration_jobs)
```
rpc_claim_integration_jobs(p_limit) -> SETOF integration_jobs
fn_reap_stuck_jobs(p_threshold_minutes) -> integer
fn_schedule_retry(p_job_id, p_error) -> void
rpc_retry_integration_job(p_job_id) / rpc_dismiss_integration_job / rpc_resolve_integration_job_manually / rpc_update_integration_job_payload
fn_outbox_health_summary() -> jsonb  (+ _internal, _dlq_by_integration, _top_errors, _pause/resume_subscription, _dismiss_job, _retry_job)
fn_build_opportunity_won_payload(_opportunity_id) -> jsonb
fn_sync_nammux_subscription(p_org_id) -> void
```

### Pipeline Inbound (integration_inbound_events)
```
rpc_claim_inbound_events(_batch_size, _integration_slug, _worker_id) -> SETOF integration_inbound_events
rpc_claim_inbound_shadow_events(_batch_size, _integration_slug, _handler_key, _worker_id, _claim_ttl) -> SETOF ...
fn_inbound_schedule_retry / fn_inbound_replay / fn_inbound_expire / fn_inbound_reap_stuck / fn_inbound_archive_dead_letter
fn_inbound_health_summary(_window) / fn_inbound_top_errors(_window, _limit)
```

### CAPI / Marketing / Attribution
```
fn_capi_dispatch_event(p_organization_id, p_event_name, p_contact_id, p_opportunity_id) -> void
fn_resolve_marketing_campaign_id(_org_id, _utm_source, _utm_medium, _utm_campaign, _utm_content, _utm_term) -> TABLE(...)
fn_log_marketing_attribution_attempt / fn_marketing_attribution_dryrun / fn_marketing_attribution_top_conflicts
get_marketing_ad_performance(p_organization_id, p_from, p_to, p_status) -> TABLE(... 31 colunas de funil)
get_meta_credentials(p_org_id) -> TABLE(...)  ⚠️ retorna token criptografado — auditar callers
try_lead_form_polling_lock(p_lead_form_id) -> boolean
```

### Intelligence
```
rpc_claim_intelligence_jobs(p_limit) -> SETOF intelligence_jobs
intelligence_reap_stale_jobs(p_stale_minutes, p_max_reclaims) -> TABLE(reclaimed, killed)
trigger_intelligence_backfill(payload jsonb) -> bigint
intelligence_fire_all_now() -> jsonb
```

### Knowledge / RAG (pgvector)
```
search_knowledge(query_embedding, org_id, agent_id_filter, match_threshold, match_count) -> TABLE(...)
search_knowledge_all / search_knowledge_chunks / search_knowledge_global / search_knowledge_product
```

### Auth / Tenancy / Admin (usadas em RLS)
```
current_user_id() -> uuid
current_user_org_ids() -> uuid[] / current_user_managed_org_ids() -> uuid[]
user_has_org_access(org_id) -> boolean
is_org_admin(_org_id) / has_org_role(_user_id, _org_id, _role) / is_admin_user()
user_can_view_all(_org_id, _entity) / user_has_cs_permission(_org, _perm)
can_manage_integrations_in_org(_org_id) / can_review_contact_documents(_contact_id)
handle_user_signup(p_full_name, p_email, p_organization_name, p_locale, p_timezone) -> json
get_internal_function_auth_token() -> text  ⚠️ Vault — nunca expor
record_failed_admin_login / reset_admin_login_attempts
```

### Kommo / Migração / Utilitários
```
rpc_kommo_upsert_contact(p_existing_id, p_data jsonb) -> uuid
rpc_kommo_upsert_opportunity(p_existing_id, p_data jsonb) -> uuid
recover_stale_job_items(_job_id) -> TABLE(recovered, exhausted)
populate_communication_endpoints_from_v2_senders() -> TABLE(...)
update_organization_usage_metrics(org_id) -> void
kairos_db_stats() / kairos_diagnose() / kairos_table_stats() -> jsonb  (observabilidade Mission Control)
count_custom_fields_for_org / admin_list_pipeline_stages / fn_feature_flag_enabled / f_unaccent
```

## 8. Corpos das trigger functions (48)

Ver arquivo complementar: [`trigger-functions.sql`](./trigger-functions.sql) — dump completo gerado na mesma data.

## Como regenerar este arquivo

```sql
-- Triggers (seção 6):
SELECT c.relname, t.tgname, pg_get_triggerdef(t.oid)
FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid
JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname='public' AND NOT t.tgisinternal ORDER BY 1,2;

-- Corpos (trigger-functions.sql):
SELECT pg_get_functiondef(p.oid)
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='public' AND p.prorettype='trigger'::regtype ORDER BY p.proname;

-- RPCs (seção 7):
SELECT p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ') -> ' || pg_get_function_result(p.oid)
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='public' AND p.prorettype<>'trigger'::regtype ORDER BY 1;
```
