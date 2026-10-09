# Etapa 1 — Segurança + RBAC v2 — Log de execução

Plano aprovado em 2026-10-09. Rollbacks em `rollback/<item>.sql`; snapshot em `snapshot-antes.sql`.

## A0 — Diagnóstico (2026-10-09)
- a) `is_platform_admin = true`: 0 usuários; fora de `admin_users`: 0. Condição de parada não ocorreu.
- h) Coluna de privacidade: `organizations.private_records_enabled` (2 orgs ligadas).
- i) Backups: `_backup_ct_inbox_cleanup_2026_07` 5000 linhas; `_document_submissions_backup_phase1` 13; `_documents_e1_backup` 19. Nenhum código usa.
- f) Threads sem responsável nas orgs com privacidade: 1 (business_context nulo). Impacto do A9 mínimo; contagem por usuário será feita no A9.
- k) Usuários sem nenhum vínculo ativo: 16; com sessão ativa: 11; com refresh token não revogado: 11; com perfil Admin no vínculo inativo: 13. Hoje "Desativar" só muda `is_active`; a sessão continua válida até expirar.
- Perfis "Admin": exatamente 16 (1 por org, 16 orgs).
- g) Views sem `security_invoker`: v_entity_sync_status, vw_marketing_ad_performance, vw_marketing_campaign_summary, vw_marketing_funnel, intelligence_stale_claims_metrics, vw_intel_won_vs_lost_30d, vw_meta_media_performance, vw_intel_sellers_30d, best_time_per_contact, vw_journey_timeline.
- c) UPDATE no frontend: `users` (Profile.tsx, EditUserDialog.tsx); `organizations` (Onboarding, GeneralSettings, ThemeSettings, CustomerServiceSettings, DuplicatePreventionSettings, RoundRobinSettings, Admin*/SuspendOrgDialog); `user_organizations` (UsersSettings, EditUserDialog, RoundRobinSettings). Edge Functions com service_role: create-user, admin-impersonate-switch e outras (lista no histórico do chat). [TODO] detalhar colunas por chamada antes do A5.
- d) `export-conversations`: chamada em `MessagesList.tsx` (botão) e documentada em ApiDocs.
- e) Exclusão de contatos/oportunidades: soft delete (`deleted_at`); Lixeira em Configurações → Lixeira (`Trash.tsx`). DELETE físico direto só para registros de exemplo (GeneralSettings).
- Funções que escrevem em `permission_profiles`: `handle_new_user`, `handle_user_signup` (SECURITY DEFINER, seed do perfil Admin).
- m) Snapshot salvo em `snapshot-antes.sql`.

## A1 — Backups expostos ✅
- RLS ligado sem policies; REVOKE ALL de anon/authenticated. Nada apagado.
- Verificação: anon e authenticated sem privilégio de SELECT nas 3 tabelas. OK.
- Linter: "RLS Enabled No Policy" (INFO) nas 3 — intencional.
- Rollback: `rollback/A1.sql`.

## A2 — Perfil de sistema ✅
- `permission_profiles.is_system` (16 marcados, 1 por org — condição de parada não ocorreu).
- `is_org_system_admin(_org)`; `can_manage_permission_profiles` = is_org_system_admin OR is_admin_user (sem is_platform_admin); `has_org_role('admin')` usa `is_system`.
- Trigger `trg_protect_system_profile`: para `authenticated`/`anon` bloqueia UPDATE/DELETE de perfil de sistema e criar/marcar is_system. Execução interna (service_role, funções SECURITY DEFINER) liberada; seed de nova org ("Admin" sem perfil de sistema) vira is_system automaticamente.
- Funções internas que alteram a tabela: handle_new_user, handle_user_signup (INSERT do Admin — continuam funcionando pela regra de seed).
- Verificação: 16 perfis is_system em 16 orgs. [TODO] teste simulado como authenticated (editar perfil comum / bloquear Admin) e BYOK do Admin.
- Rollback: `rollback/A2.sql`.

## Próximos: A3 → A9, B1 → B7

## A6 — Exportar conversas só para Admin (aplicado)
- export-conversations: exige has_org_role(users.id, org, 'admin'); demais recebem 403. Publicada.
- Comercial: botão de exportar só aparece para Admin (hook useIsOrgSystemAdmin).
- Verificado: sem token → 401. [INCERTO] chamada com token real de Admin/não-Admin não testada (sessão externa indisponível).
- Rollback: reverter o trecho de checagem para membership ativa (git).

## A7 — Lixeira por permissão (aplicado)
- Trigger fn_guard_soft_delete (contacts/opportunities): mudar deleted_at exige can_delete_* ou Admin; funções internas liberadas (todas as que alteram deleted_at são SECURITY DEFINER).
- DELETE físico: só Admin. Ver lixeira: só quem pode excluir ou Admin.
- Impacto: hoje só perfis Admin (34 vínculos) têm can_delete_*.
- Teste simulado (ROLLBACK): sem chave não move nem vê lixeira; com chave move/restaura, não apaga de vez; Admin move e vê 22 itens.
- Rollback: rollback/A7.sql

## A8 — security_invoker nas 10 views (aplicado)
- Antes/depois para Admin da Central: ad_performance 48/48, funnel 48/48, media 106/106. Demais 7 views não são usadas pelo app.
- Rollback: rollback/A8.sql

## A9 — pendente (próximo passo)
