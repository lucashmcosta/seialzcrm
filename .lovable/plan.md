# Respostas para o app mobile (somente leitura, nada foi alterado)

## Parte 1 — Atribuição automática

**Correção aceita.** Não é uma coluna "de destinatário" com esses nomes. O Comercial usa **duas condições juntas**:
- `user_organizations.round_robin_active` (boolean, por pessoa). É isso que o interruptor da tela grava (UPDATE direto por `user_organizations.id`).
- A ferramenta `rodizio` do perfil (legado `permissions.round_robin_recipient`), que é a "porta" lida por `assign_round_robin`.
- Ao **ligar** alguém, o Web também liga `round_robin_recipient` no perfil inteiro, se estiver desligado. Ao **desligar**, só muda `round_robin_active`; nunca desliga no perfil (que é compartilhado).
- Para o app: "tirar da fila" = `round_robin_active=false`. Não troque o perfil. Atenção: ao ligar, o Web grava o jsonb legado `permissions` direto, sem `permissions_v2` (o gatilho só sincroniza v2→legado). [INCERTO] se isso deixa v2 divergente; é um ponto a corrigir no Web.
- `user_organizations.last_assigned_at` acompanha o último recebimento.

**2. `round_robin_scope`** (text, padrão `threads_and_contacts`, sem CHECK):
- `threads_and_contacts`: distribui contatos novos sem dono e conversas novas.
- `contacts_only`: só contatos novos (gatilho de contatos).
- `threads_only`: só conversas novas.
- Qualquer outro valor: não distribui nada. Só vale com `round_robin_enabled=true`.

**3. Agente na distribuição (Julia):** em `ai_agents` — `distribution_mode` (`all`, `every_n`, `percent`, `daily_quota`), `distribution_value`, `handoff_ack_message`, `presents_as_assistant`, `followup_enabled`, `followup_delays_minutes`, `followup_optout_attempt`. Estatística: `rpc_agent_distribution_stats(_org, _days)`.

**4. Fila do Atendimento (a mais importante):**
- O Web grava **direto**: `upsert` em `cs_round_robin_members` `{organization_id, user_id, active}` com `onConflict: organization_id,user_id`. Sem RPC.
- **Não existe ponteiro.** A escolha é calculada na hora (menos atendimentos abertos, depois o último recebimento mais antigo). Seu caminho direto está certo, mas use upsert (a pessoa pode não ter linha ainda).
- `cs_round_robin_enable(_org)`: exige permissão (`rbac_denied`); liga `organizations.cs_round_robin_enabled`; falha com `cs_rr_empty_list` se não há membro ativo com acesso; e **reatribui conversas de Atendimento abertas cujo responsável não pode mais atender** (devolve para quem atendia antes, senão rodízio, senão sem responsável). Retorna `{returned, round_robin, unassigned}`.
- `cs_round_robin_disable(_org)`: só desliga a flag. Não mexe em conversas.
- `cs_round_robin_overview(_org)`: `{enabled, people:[{user_id, full_name, has_access, member_active, open_now, today, week, last_at}]}`, só membros ativos da org. `has_access` = Atendimentos ver e editar diferentes de nenhum.
- Observação: desligar uma pessoa da fila não reatribui as conversas dela.

## Parte 2 — Perfis

**5.** O Web grava **os dois**: `permissions_v2` e `permissions` (via `toLegacy`). Além disso há o gatilho `trg_permissions_v2_to_legacy` (BEFORE INSERT/UPDATE OF permissions_v2), sentido **v2 → legado**. Gravando só o v2 o legado é gerado; gravar os dois, como o Web, é o mais seguro.

**6.** `rbac_v2_delete_profile(_profile uuid, _target uuid) returns integer`.
- Só admin de sistema da org. Erros: `profile_not_found`, `forbidden`, `system_profile_protected`, `target_required` (nulo ou igual), `target_invalid` (outra org).
- Os usuários do perfil excluído são movidos para `_target`; retorna quantos foram movidos.

**7.** INSERT direto em `permission_profiles` `{name, permissions_v2, permissions, organization_id}`, sem RPC.
- Nome **único por organização** (`UNIQUE (organization_id, name)`).
- Combinações: o banco não bloqueia; o Web corrige antes de salvar com `normalize` (`src/lib/permissions/catalog.ts`): uma ação não pode ter escopo maior que seu limite (ex.: editar ≤ ver), e com ver=nenhum, `criar` e `sem_responsavel` viram false. O app deve aplicar a mesma regra.
- Gatilho `trg_protect_system_profile` impede mexer em perfil de sistema.

## Parte 3 — `create-user`

- **Corpo:** `{ email, full_name, password, permission_profile_id, organization_id }`, com JWT do usuário no Authorization.
- **Sucesso 200:** `{ success: true, user: { id, email, full_name } }`.
- **Erros** (sempre `{ error: "<texto>" }`):
  - 401 `Authorization header required` / `Unauthorized`
  - 400 `Missing required fields: ...` / `Password must be at least 6 characters` / `Invalid permission profile` / `Subscription not found` / `Seat limit reached. ...` / `A user with this email already exists` / mensagem do Auth ao criar
  - 403 `Requester user not found` / `You do not have access to this organization` / `You do not have permission to manage users` / `Only the organization Admin can assign the Admin profile`
  - 500 `Failed to create user record` / `Failed to create user membership` / `Internal server error`
- **E-mail:** não envia; a conta já nasce confirmada.
- **Assentos:** sim, compara `subscription_usage.current_seat_count` com `max_seats` e soma 1 após criar.
- Atenção: a permissão é checada no jsonb **legado** (`can_manage_users`), não no v2.

## Sugestões (não aplicadas)
- Ligar alguém no rodízio Comercial grava só o legado do perfil; alinhar para gravar o v2.
