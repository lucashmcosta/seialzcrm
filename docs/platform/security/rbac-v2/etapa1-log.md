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

## A9 — Lista de conversas igual à regra de abrir conversa (aplicado)
- rpc_list_message_threads: sem responsável só aparece para quem vê todas ou tem can_manage_cs_queue (igual à policy de message_threads). Assinatura única mantida (sem overload).
- A0 (f): conversas sem responsável abertas em 3 orgs (1, 47 e 141). Usuários que perderiam acesso: 0 (todos têm view_all ou fila). Aplicado.
- Nulos: a regra atual já trata business_context nulo como comercial (exceto contato cliente / endpoint de atendimento). Dados não alterados.
- Rollback: rollback/A9.sql

## B1 — Interruptor (parcial)
- Flag rbac_v2 criada desligada, organization_ids vazio. rbac_v2_enabled(org) e rbac_v2_set_global(on) (só platform admin/service_role).
- [BLOQUEADO] Org de teste "Seialz Teste Permissões" + 4 usuários: criar login exige a chave de serviço (não guardada no projeto) ou sessão de admin da plataforma no /admin. Nenhuma org foi adicionada à flag.

## B2 — Tabelas (aplicado)
- teams, team_members (FK composta org), permission_profiles.permissions_v2. RLS: leitura para membros; escrita can_manage_teams (Admin ou administracao.usuarios).
- Rollback: rollback/B1-B2.sql

## B3 — Conversão (aplicado)
- src/lib/permissions/{types,convert}.ts + convert.test.ts (7 testes, bun test: OK).
- SQL: fn_permissions_from_legacy, fn_permissions_to_legacy, trigger trg_permissions_v2_to_legacy (pula durante rbac_v2_backfill), rbac_v2_backfill.
- Paridade código × SQL: 32/32 casos idênticos (26 chaves isoladas, tudo-true, tudo-false, com/sem privacidade, perfil comercial amplo → atendimentos.encerrar/atribuir = nenhum).
- Backfill ainda NÃO executado.
- Rollback: rollback/B3.sql

## Próximo: B4 (resolver e travas, atrás da flag), B5 (telas), B6 (depende da org de teste), B7.

## B4 — aplicado (travas atrás da flag; contagens antes/depois iguais para 3 não-Admin da Central).
## B5 — banco: rbac_v2_delete_profile. Telas: PermissionProfilesV2 (modelos/cópia/branco, abas Dados/Ferramentas/Administração, resumo, exclusão com destino), TeamsSettings (/settings/teams), coluna Equipes em Usuários, RequirePerm nas rotas, menu filtrado, privacidade oculta. Tudo só ativa com rbac_v2 ligado.
## B6 — simulação na Central com ROLLBACK: todos os testes OK (T2 explicado: Líder vê 6 oportunidades na lixeira sem responsável). Conferido depois: flag desligada, 0 equipes, 0 perfis temporários, 0 permissions_v2.
## B7 — NÃO executado. Simulação completa (35 não-Admin, 4 orgs, com ROLLBACK) excedeu o tempo do servidor; nada gravado (flag false, organization_ids vazio, 0 perfis convertidos). Interruptor não foi ligado.

## B7 por organização — 2026-10-09 ~04:00 UTC
- blueviza (1 não-Admin, perfil "Sales Rep"): DIVERGIU. Antes 4357 contatos / 2593 oportunidades / 243 conversas / 4 chamadas / 0 tarefas; depois 4357 / 2593 / 243 / 0 / 0. Menus iguais. Transação desfeita (ROLLBACK).
- PARADA conforme a regra: Viagi, Campoar e Central não foram simuladas; nada ligado; rbac_v2 segue desligado.

## Causa da divergência da blueviza (só leitura) — confirmada
Regra antiga de calls: sem telefonia v2 na org (`NOT telephony_v2_enabled_for_org`), qualquer membro vê todas as chamadas. A conversão dava "meus".
Correção (código e SQL, mesma regra): chamadas.ver = 'todos' se can_view_all_calls OU telefonia v2 inativa na org; senão 'meus'.
fn_permissions_from_legacy(l, privacy_on, telephony_v2_on) — versão de 2 argumentos removida (sem overload); rbac_ctx e rbac_v2_backfill usam o estado atual da org. Teste novo em convert.test.ts; paridade SQL × código: 8/8 combinações iguais.

## Revisão das regras que dependem da organização (não só do perfil)
- Privacidade (`private_records_enabled` via user_can_view_all) em contatos, oportunidades, conversas — já tratada.
- Telefonia v2 (`telephony_v2_enabled_for_org`) em chamadas — corrigida acima.
- Nenhum outro caso: messages/tasks/documents/activities eram por organização inteira; contact_identity_profiles e fila de atendimento dependem só do perfil; is_admin_user é admin da plataforma.
- Ressalva: mensagens, atividades e documentos não entram na contagem (consultas muito pesadas). No modelo novo, eles seguem a visibilidade do registro principal.

## B7 por organização, refeito (cada transação desfeita no final)
- blueviza: 1 pessoa, 0 divergências
- Viagi: 6 pessoas, 0 divergências
- Campoar: 12 pessoas, 0 divergências
- Central Trabalhista: 16 pessoas (4 blocos de 4), 0 divergências

## LIGADO PARA TODOS: 2026-10-09 04:16:06 UTC
rbac_v2_backfill(NULL) converteu 34 perfis; rbac_v2_set_global(true). Nenhum perfil comum ficou sem modelo novo.
Conferência pós-ligação, 7 pessoas (2 por org; a blueviza tem só 1): agora × modelo antigo, 0 divergências.
Emergência: SELECT rbac_v2_set_global(false);

## 2026-10-09 13:51 UTC — Encerrar/Atribuir = Ver (pedido do usuário)
Critério: perfis comuns que veem Atendimentos ou Conversas comerciais, com Encerrar ou Atribuir em "nenhum", e que NÃO foram salvos pela tela nova depois da ligação (updated_at = horário do backfill, 04:16:06). Gravado em permissions_v2; as chaves antigas foram atualizadas pelo trigger trg_permissions_v2_to_legacy, que também sincroniza a tela.
Antes → depois (AT = Atendimentos, CC = Conversas comerciais; ver/encerrar/atribuir):
| Org | Perfil | id | Pessoas | AT antes | CC antes | AT depois | CC depois |
|---|---|---|---|---|---|---|---|
| blueviza | Sales Rep | ebcc223d | 1 | todos/nenhum/nenhum | todos/todos/nenhum | todos/todos/todos | todos/todos/todos |
| Blueviza | Sales Rep | 14850bec | 0 | todos/nenhum/nenhum | todos/todos/nenhum | todos/todos/todos | todos/todos/todos |
| Campoar | Sales Rep | abe1bb98 | 12 | todos/nenhum/nenhum | todos/todos/nenhum | todos/todos/todos | todos/todos/todos |
| Central Trabalhista | Juridico | a97b2f0c | 6 | todos/nenhum/nenhum | todos/todos/nenhum | todos/todos/todos | todos/todos/todos |
| Minha Empresa | Sales Rep | 829a2afe | 0 | idem | idem | todos/todos/todos | todos/todos/todos |
| Minha Empresa | Sales Rep | 0ddc9671 | 0 | idem | idem | todos/todos/todos | todos/todos/todos |
| Minha Empresa | Sales Rep | 2a617e32 | 0 | idem | idem | todos/todos/todos | todos/todos/todos |
| Minha Empresa | Sales Rep | 3965a937 | 0 | idem | idem | todos/todos/todos | todos/todos/todos |
| MSM Soluções Metlálicas | Sales Rep | 24a34e5f | 0 | meus/nenhum/nenhum | meus/meus/nenhum | meus/meus/meus | meus/meus/meus |
| Plamev | Sales Rep | 279a19c4 | 0 | idem | idem | todos/todos/todos | todos/todos/todos |
| Squadra | Sales Rep | edf4d343 | 0 | idem | idem | todos/todos/todos | todos/todos/todos |
| Squadra | Sales Rep | 4b1093f4 | 0 | idem | idem | todos/todos/todos | todos/todos/todos |
| Viagi | Sales Rep | bba3f059 | 0 | idem | idem | todos/todos/todos | todos/todos/todos |
| Viagi | Sales Rep | c479976b | 6 | idem | idem | todos/todos/todos | todos/todos/todos |
| VIAGI | Sales Rep | 32350760 | 0 | idem | idem | todos/todos/todos | todos/todos/todos |
Chaves antigas depois: can_close_threads=true, can_takeover_thread=true; manage_assignments segue false.
Fora (salvos pela tela depois de 04:16): Consultor (Central, 04:44:42) e Customer Service (Viagi, 13:35:26).

## Consultor (Central Trabalhista) — Atendimentos Ver = "nenhum"
A conversão não gera "nenhum" para Ver (mínimo "meus"). O perfil foi salvo depois da ligação, às 04:44:42 UTC, pela tela nova, que é o único caminho que grava esse valor. Autor: [INCERTO]. permission_profiles não tem coluna nem auditoria de quem alterou, e os logs do servidor desse horário não estão mais disponíveis. Não alterado.
Antes da ligação (modelo antigo, privacidade ligada, view_all_threads=false): Atendimentos = só as conversas atribuídas ao próprio consultor (5.790 das 6.927 de atendimento da org estão com algum dos 7 consultores), sem encerrar (can_close_threads=false) e sem reatribuir (takeover/escalate=false).

## 2026-10-09 ~17:00 UTC — Atribuição em lote (Comercial sem responsável)
- Viagi (b246ef6f…): 47 conversas → Ketlyn Vieira (Admin, vê Conversas comerciais "todos").
- blueviza (f677a500…): 141 conversas → Lucas Costa (Admin, "todos").
- Critério: abertas (status não resolved/closed), sem responsável, business_context 'sales' ou nulo.
- Histórico: 188 linhas em thread_assignment_history com "Atribuída em lote pelo administrador".
- Notificações: 2 (uma resumo por pessoa). Dono do contato não alterado; nenhuma mensagem enviada.
- Conferência: 0 conversas de outras organizações, 0 de outro tipo; restam 0 nesse critério.
- Desfazer: rollback/bulk-assign-2026-10-09.sql

## Rodízio do Atendimento (2026-10-09 ~18:30 UTC)
Rollbacks salvos antes de cada item: `rollback/cs-rr-{1-estrutura,2-escolha,3-regras,4-acerto}.sql`.
1. Estrutura — `organizations.cs_round_robin_enabled` (false), `cs_round_robin_members`, `cs_routing_errors` (só service_role), `perms_v2_for_user`, `can_receive_cs`, `can_manage_cs_round_robin`. OK.
2. Escolha — `assign_cs_round_robin` (menos abertas → last_assigned_at → id; SKIP LOCKED; só cs_round_robin_members). OK.
3. Regras — `trg_threads_round_robin` sai cedo quando o contexto (business_context ou derivado do endpoint) é customer_service; resto idêntico. Novo `trg_zy_cs_assignment` (BEFORE INSERT, após autofill) + `trg_cs_assignment_log` (AFTER INSERT, histórico). `trg_messages_smart_reopen` ganhou ramo customer_service (último responsável pelo histórico → rodízio do Atendimento → sem responsável); ramo comercial idêntico. Erros → sem responsável + linha em cs_routing_errors.
4. Acerto — `cs_round_robin_overview/preview/enable/disable`. Não executado.
5. Tela — abas Comercial (intacta) / Atendimento; card de Configurações atualizado.

Verificação (transação desfeita, Central): off dono sem acesso → sem responsável ✔; off dono com acesso → dono ✔; rodízio comercial não chamado ✔; histórico na criação ✔; reabre → quem atendia ✔; reabre pausado → rodízio ✔; ligado nova → elegível com menos abertas (sem acesso ignorado) ✔; ninguém disponível → sem responsável ✔; reabre com responsável desativado → rodízio ✔; acerto simulado: 9 conversas fora ✔; comercial herda dono como hoje ✔; erro forçado → gravada sem responsável + erro registrado ✔.
Estado final: rodízio do Atendimento desligado em todas (0 orgs), 0 membros.
Efeito imediato (proteção com rodízio desligado): hoje 1 conversa de Atendimento aberta e 5.787 encerradas estão com pessoas sem acesso ao Atendimento (Consultores da Central); se esses clientes voltarem a falar, a conversa reabre sem responsável.

## 2026-10-09 18:30–18:36 UTC — Central: acerto com lista vazia e reacerto
- Acerto de 18:30:15 UTC (lista vazia): 6 conversas → "Sem responsável" (antes: Bruna 2, Luyza 2, Tamires 1, Eduarda 1).
- Reabertura conferida: a busca do último responsável NÃO ignorava entradas "sem responsável" (pegava NULL). Ajustada: `to_user_id IS NOT NULL` → pega a última PESSOA. f71089fc (resolvida) voltará para a Luyza se reabrir.
- Reacerto (5 abertas, lista Luyza/Mariane/Bruna): Bruna 4 (30803202, 62aff697, 55d791ba, 910f6512), Luyza 1 (c54fa9e9); todas "Devolvida para quem atendia"; 0 rodízio; 0 sem responsável. Sem notificações nem envios. Desfazer: `rollback/cs-rr-5-reacerto-e-trava.sql`.
- Trava: `cs_round_robin_enable` recusa com `cs_rr_empty_list` sem ninguém ativo na lista; tela desabilita o interruptor com dica e avisa se a lista esvaziar com o rodízio ligado.
- Números conferidos (Abertas / Hoje / Último): Bruna 4/4/18:35 UTC; Luyza 1/1/18:35 UTC; Mariane 0/0/nunca.
