# Auditoria READ-ONLY — Atribuição no Comercial e encaixe do número pessoal

Nada foi alterado. Todas as afirmações abaixo vêm de leitura do banco (pg_proc/pg_trigger/tabelas) e do código das Edge Functions.

## Entrega (formato solicitado)

```text
CURRENT_ASSIGNMENT_SOURCE_OF_TRUTH= message_threads.assigned_user_id (conversa) — derivado, na criação, de contacts.owner_user_id
CONTACT_OWNER_ROLE= contacts.owner_user_id é a raiz da atribuição: herdado por thread e oportunidade
THREAD_ASSIGNEE_ROLE= message_threads.assigned_user_id (+ original_owner_user_id como snapshot) = responsável operacional da conversa
OPPORTUNITY_OWNER_ROLE= opportunities.owner_user_id, herdado do contato (trg_opportunities_round_robin) ou setado pelo webhook (oppData.owner_user_id = contactOwnerId)
NEW_CONTACT_ASSIGNMENT_FLOW= webhook cria contato SEM owner → trigger BEFORE INSERT contacts_round_robin → assign_round_robin(org) → grava owner_user_id; thread criada depois herda esse owner via threads_round_robin
EXISTING_CONTACT_ASSIGNMENT_FLOW= contato reutilizado mantém owner_user_id; thread canônica é reutilizada (sales-thread.ts) e assigned_user_id NÃO é recalculado
ROUND_ROBIN_FUNCTION= public.assign_round_robin(uuid) e overload assign_round_robin(uuid, text /*queue*/); triggers trg_contacts_round_robin, trg_threads_round_robin, trg_opportunities_round_robin
ROUND_ROBIN_ELIGIBLE_USERS= user_organizations com is_active=true AND round_robin_active=true (overload por fila exige queue ∈ round_robin_queues)
ROUND_ROBIN_STATE_STORAGE= persistido em user_organizations.last_assigned_at (ORDER BY last_assigned_at NULLS FIRST, id + FOR UPDATE SKIP LOCKED) — não é histórico calculado
MANUAL_ASSIGNMENT_FLOW= RPC reassign_thread(thread, user, reason): exige permissão manage_assignments/can_manage_cs_queue, alvo ativo na org, grava assigned_user_id/assigned_at + last_routing_decision.action='manual_assignment'; não toca contato nem oportunidade
REASSIGNMENT_RULES= automática só quando o campo está NULL na criação (todas as 3 triggers dão RETURN NEW se já preenchido); depois só muda por ação humana/RPC. Nenhuma mensagem inbound reatribui thread já atribuída
ENDPOINT_CHANGE_AFFECTS_ASSIGNMENT= NO (sales-thread.ts só atualiza primary_endpoint_id / status / last_inbound_at; nunca assigned_user_id)
PROVIDER_AFFECTS_ASSIGNMENT= NO (Meta, Twilio e Evolution não gravam assigned_user_id; a decisão é 100% nas triggers do banco)
META_VENDOR_PERSONAL_ASSIGNMENT_INTENT= existe e está explícita em get_default_queue_for_thread: purpose 'vendor_personal' → queue 'commercial' + suggested_user_id = communication_endpoints.assigned_user_id (dono do número como responsável sugerido, sem sair da fila Comercial)
PERSONAL_ENDPOINT_OWNER_ALREADY_USED_AS_SUGGESTED_USER= YES na função get_default_queue_for_thread, NO no fluxo real (nenhum consumidor: grep em src/ e supabase/functions/ não encontra chamadas; hoje endpoint.assigned_user_id só é usado para permissão de resposta em fn_can_user_use_reply_endpoint / reply-endpoint-selection.ts / manual-reply-endpoint.ts)
CENARIO_EXISTING_ASSIGNEE_RECEIVES_ON_PERSONAL_NUMBER= hoje MANTÉM Maria (nenhuma reatribuição por inbound/endpoint). Junior consegue responder pelo 9999 (permissão), mas a thread continua da Maria
CENARIO_UNASSIGNED_CONTACT_RECEIVES_ON_PERSONAL_NUMBER= hoje cai no round-robin da org (contato novo sem owner) e pode sair para qualquer vendedor elegível, ignorando o dono do número
RECOMMENDED_PERSONAL_ASSIGNMENT_MODEL= "dono do número = responsável sugerido, sem reatribuição": (1) mantém quem já é responsável; (2) quando não há responsável, o endpoint vendor_personal.assigned_user_id precede o round-robin — exatamente o contrato já expresso em get_default_queue_for_thread. Sem lógica paralela: reaproveita a mesma cadeia contato → thread → oportunidade
CHANGES_REQUIRED= (a) passar o endpoint de entrada como "sugestão" para a atribuição inicial — na prática, preencher owner_user_id/assigned_user_id com endpoint.assigned_user_id ANTES das triggers de round-robin (webhook ou parâmetro nas triggers), preservando o RETURN NEW quando já há responsável; (b) registrar o evento na timeline com razão própria (ex.: action 'initial_assignment' + reason 'personal_endpoint_owner') em vez do texto de round-robin; (c) nenhuma mudança em permissão de resposta (já pronta)
COMPATIBILITY_RISK= BAIXO: nada altera threads/contatos já atribuídos; sem impacto em Meta/Twilio (endpoints atuais têm assigned_user_id NULL — confirmado: todos os endpoints sales/commercial em produção estão com assigned_user_id nulo); risco residual = número pessoal cujo dono está inativo/round_robin_active=false (precisa fallback explícito para o round-robin) e o texto de auditoria "Contato auto-atribuído via round-robin" ficar impreciso se não for ajustado
```

## Como funciona hoje (cadeia real)

```text
inbound (meta-whatsapp-webhook | twilio-whatsapp-webhook | evolution-webhook)
  → resolve endpoint/org
  → contato: SELECT por telefone → se não existe, INSERT sem owner
      trigger contacts_round_robin (BEFORE INSERT)
        organizations.round_robin_scope ∈ (contacts_only, threads_and_contacts)
        → assign_round_robin(org) → owner_user_id
      trigger contacts_round_robin_audit (AFTER INSERT)
        → activities: "Atribuicao automatica / Contato auto-atribuido via round-robin"
          (só quando não há JWT de usuário, i.e. service_role)
  → thread canônica (_shared/sales-thread.ts): reutiliza a canônica ou INSERT
      trigger threads_round_robin (BEFORE INSERT)
        assigned_user_id já preenchido → preserva (+ original_owner_user_id)
        senão herda contacts.owner_user_id
        senão assign_round_robin(org)
  → oportunidade (se aplicável): owner_user_id = contactOwnerId
      trigger trg_opportunities_round_robin como rede de segurança
  → mudanças posteriores: só reassign_thread (manual_assignment) ou take_over
      trigger trg_log_thread_assignment_change → thread_assignment_history
```

Fatos observados no banco:
- `assign_round_robin` liga/desliga por `organizations.round_robin_enabled`; escopo por `round_robin_scope`. Em produção: Central Trabalhista e Viagi (`b246ef6f…`) com `round_robin_enabled = true`.
- `thread_assignment_history` hoje: `take_over` 7.807, `reopen` 670, `manual_assignment` 650, `auto_reassign` 7.
- Nenhuma diferença Comercial vs Atendimento na atribuição inicial: a única distinção é a fila em `get_default_queue_for_thread` (`customer_service` vs `commercial`) e a permissão `can_manage_cs_queue` em `reassign_thread`.

## Fluxo concreto dos 4 casos

Caso 1 — contato novo, número Comercial compartilhado
Cria contato sem owner → round-robin da org escolhe vendedor elegível (menor `last_assigned_at`) → thread nova herda esse owner → atividade "auto-atribuído via round-robin". Sem mudanças propostas.

Caso 2 — contato existente com responsável, número Comercial compartilhado
Contato mantém owner; thread canônica reutilizada; `assigned_user_id` intocado; só `primary_endpoint_id`/`last_inbound_at`/status podem mudar. Sem mudanças propostas.

Caso 3 — contato novo pelo número pessoal do Junior (9999)
Hoje: round-robin sorteia qualquer vendedor; Junior pode ficar sem a conversa que chegou no próprio número.
Proposto: `owner_user_id`/`assigned_user_id` = `endpoint.assigned_user_id` (Junior), com fallback para round-robin se Junior estiver inativo. Thread segue canônica Comercial, visível a todo o time; timeline registra "atribuído ao dono do número pessoal".

Caso 4 — contato já atribuído à Maria envia para o 9999 do Junior
Mantém Maria em contato, thread e oportunidade (regra atual de não reatribuir por inbound). Junior pode responder pelo 9999 (permissão por `assigned_user_id` do endpoint), e a troca de responsável, se desejada, é sempre explícita via `reassign_thread`/take over. Proposta não altera esse caso.
