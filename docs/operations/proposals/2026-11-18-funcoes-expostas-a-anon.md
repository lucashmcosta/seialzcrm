# Funções `SECURITY DEFINER` executáveis por `anon` — auditoria de 2026-11-18

Em produção, **166 de 330** funções `SECURITY DEFINER` do schema `public` podem
ser executadas pelo papel `anon` — isto é, por qualquer pessoa com a chave
pública do projeto. A causa é uma só: `CREATE FUNCTION` concede `EXECUTE` a
`PUBLIC` por padrão, e a maioria das migrations nunca revogou.

Uma função `SECURITY DEFINER` roda com os privilégios do dono e ignora RLS.
Quando ela escreve e não confere quem está chamando, estar exposta a `anon` é
um caminho aberto para alterar dados.

Levantado por consulta somente-leitura (`has_function_privilege('anon', …)`).
A classificação cruza com: triggers e políticas de RLS em produção, e chamadas
`.rpc('…')` no repositório (`src/` e `supabase/functions/`).
⚠ = a função escreve (insert / update / delete) e o corpo não confere quem chama.

## Resumo

| Classe | Quem usa | Funções | ⚠ | O que fazer |
|---|---|---|---|---|
| A | Só triggers | 56 | 38 | **Revogado neste PR.** Trigger não precisa que quem dispara tenha `EXECUTE` |
| B | Políticas de RLS | 16 | 0 | Manter: a política roda com o papel de quem consulta |
| C | A tela (`src/`) | 24 | 3 | Manter para `authenticated`; avaliar tirar `anon` uma a uma |
| D | Só funções de borda | 27 | 19 | As de fila e worker **revogadas neste PR**; as demais, decisão abaixo |
| E | Só outras funções SQL | 6 | 1 | Decisão abaixo |
| F | Nenhuma chamada no repositório | 35 | 16 | As de fila e manutenção **revogadas neste PR**; as demais, decisão abaixo |

## Revogado neste PR

`supabase/migrations/20261118180000_revoke_anon_trigger_and_worker_functions.sql`

1. **Toda função de trigger do schema `public`** (56 expostas hoje). A regra é dinâmica
   (`prorettype = trigger`), então cobre também as que não são `SECURITY DEFINER`.
   Sem risco: o Postgres confere `EXECUTE` da função de trigger quando o trigger
   é criado, não quando ele dispara.
2. **Funções de fila e worker** (15), que só o `service_role` ou o agendador chamam:
   `rpc_claim_integration_jobs`, `rpc_claim_intelligence_jobs`, `rpc_claim_push_delivery_jobs`, `rpc_claim_inbound_shadow_events`, `rpc_claim_inbound_events`, `fn_schedule_retry`, `fn_inbound_archive_dead_letter`, `fn_inbound_expire`, `fn_inbound_reap_stuck`, `fn_inbound_replay`, `fn_inbound_schedule_retry`, `intelligence_reap_stale_jobs`, `intelligence_fire_all_now`, `prune_intelligence_worker_runs`, `recover_stale_job_items`.
   Conferido: as quatro chamadas no código são de workers (`integration-worker`,
   `intelligence-worker`, `push-dispatch`, `integration-inbound-dispatcher`), com
   cliente `service_role`; as demais só rodam por `pg_cron`, que executa como
   dono do banco e não depende dessas permissões.

## Para decidir (não alterado)

### D — só funções de borda chamam
`assign_round_robin` ⚠, `cancel_telephony_transfer_workflow` ⚠, `claim_next_telephony_recipient` ⚠, `claim_telephony_transfer_target_v2` ⚠, `fn_build_opportunity_won_payload`, `fn_log_marketing_attribution_attempt` ⚠, `fn_resolve_inbound_suggested_assignee`, `fn_sync_nammux_subscription` ⚠, `has_org_role`, `hold_telephony_call` ⚠, `promote_session_to_contact` ⚠, `provision_line_endpoint`, `reclaim_telephony_transfer_target_v3` ⚠, `release_telephony_transfer_reservations` ⚠, `reserve_telephony_transfer_target` ⚠, `resolve_communication_endpoint`, `rotate_messaging_line_endpoint`, `rpc_kommo_upsert_contact` ⚠, `rpc_kommo_upsert_opportunity` ⚠, `search_knowledge_all`, `search_knowledge_global`, `search_knowledge_product`

Recomendação: revogar de `anon` e `authenticated`, **depois** de conferir em cada
chamada se a função de borda usa o cliente `service_role` ou o do usuário. As
com ⚠ primeiro: `rpc_kommo_upsert_contact`, `rpc_kommo_upsert_opportunity`,
`promote_session_to_contact` e as de transferência de telefonia escrevem dados de
negócio sem conferir quem chama.

### E — só outras funções SQL chamam
`fn_build_nammux_contact_payload`, `fn_default_inbound_settings`, `fn_emit_nammux_contact_updated` ⚠, `fn_resolve_marketing_campaign_id`, `telephony_number_is_open`, `telephony_transfer_enabled_for_org`

Recomendação: revogar. Chamada a partir de outra função `SECURITY DEFINER` roda
como dono e não depende da permissão de quem iniciou.

### F — sem nenhuma chamada no repositório
`can_review_contact_documents`, `claim_telephony_transfer_target` ⚠, `clear_thread_reply_endpoint_pref`, `fn_marketing_attribution_dryrun`, `fn_marketing_attribution_top_conflicts`, `get_dashboard_stats`, `get_default_queue_for_thread`, `get_home_dashboard_stats`, `get_opportunities_by_stage`, `grant_user_reply_endpoint`, `handle_user_signup`, `kairos_table_stats`, `merge_message_threads` ⚠, `populate_communication_endpoints_from_v2_senders` ⚠, `reassign_thread`, `reclaim_telephony_transfer_target` ⚠, `reclaim_telephony_transfer_target_v2` ⚠, `revoke_user_reply_endpoint` ⚠, `rpc_deactivate_push_token`, `rpc_register_push_token`, `search_knowledge`, `search_knowledge_chunks`, `set_thread_reply_endpoint_pref`, `take_over_thread`, `unmerge_message_thread` ⚠

Recomendação: conferir uma a uma. Há função de tela antiga (`get_dashboard_stats`,
`take_over_thread`, `reassign_thread`) que pode estar em uso por um cliente que
não está neste repositório (o aplicativo móvel usa `rpc_register_push_token` e
`rpc_deactivate_push_token`).

### C — a tela chama
`admin_list_pipeline_stages`, `fn_can_user_use_reply_endpoint`, `fn_feature_flag_enabled`, `fn_inbound_health_summary`, `fn_inbound_top_errors`, `fn_is_canonical_sales_thread`, `fn_is_sales_eligible_endpoint`, `fn_outbox_dismiss_job`, `fn_outbox_dlq_by_integration`, `fn_outbox_health_summary`, `fn_outbox_pause_subscription`, `fn_outbox_resume_subscription`, `fn_outbox_retry_job`, `fn_outbox_top_errors`, `get_marketing_ad_performance`, `get_opportunity_stage_counts`, `get_service_dashboard_stats`, `get_service_worst_responses`, `record_failed_admin_login` ⚠, `reset_admin_login_attempts` ⚠, `rpc_configure_cpf_registry`, `rpc_get_message_threads_by_ids`, `rpc_set_operating_country`, `update_organization_usage_metrics` ⚠

Precisam continuar executáveis por `authenticated`. Tirar `anon` só é seguro
onde a tela não chama antes do login.

### B — usadas em política de RLS
`can_manage_cs_round_robin`, `can_manage_integrations_in_org`, `can_manage_permission_profiles`, `commercial_can_read`, `commercial_has_permission`, `current_user_id`, `current_user_managed_org_ids`, `current_user_org_ids`, `is_admin_user`, `is_org_admin`, `telephony_v2_enabled_for_org`, `user_can_view_all`, `user_has_cs_permission`, `user_has_org_access`, `user_has_org_permission`, `user_has_telephony_permission`

Manter como estão.

## Para não voltar

- Toda função nova: `revoke all on function … from public, anon, authenticated`
  e `grant` só para quem precisa, na mesma migration.
- Alternativa estrutural, a decidir: `alter default privileges … revoke execute
  on functions from public`, que inverte o padrão. Exige conceder explicitamente
  toda função que a tela chama.
- `supabase/tests/anon_exposed_functions.sql` falha se uma função de trigger ou
  de fila voltar a ser executável por `anon` ou `authenticated`.
