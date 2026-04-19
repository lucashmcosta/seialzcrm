

## Respostas às 5 verificações

**1. Perfis existentes** — 9 orgs, 18 perfis, padrão limpo:
- TODOS os admins se chamam exatamente `"Admin"` (10 perfis)
- TODOS os comerciais se chamam exatamente `"Sales Rep"` (8 perfis)
- Backfill: `WHERE name = 'Admin'` pega 100%. Sem lista manual.

**2. Funções já existem** — vou reusar (não recrio):
```sql
current_user_id()      → busca users.id via auth.uid()  [STABLE, SECURITY DEFINER]
current_user_org_ids() → array de org_ids ativas        [STABLE, SECURITY DEFINER, row_security=off]
```

**3. EXPLAIN ANALYZE** — Vou rodar antes de aplicar a policy nova (no momento da migration). Índices `idx_contacts_owner`, `idx_contacts_org_owner`, `idx_opportunities_owner`, `idx_message_threads_assigned_user` já existem → não preciso criar nada.

**4. Reabertura sem dono ativo** — Confirmado: roda RR novo + comentário `-- TODO(next-sprint): trocar por "caixa não atribuída" + task pro gestor`.

**5. Toggle Meus/Todos** — Confirmado:
- User SEM `view_all_*` → não vê toggle, sempre filtrado em "Meus"
- User COM `view_all_*` → vê toggle, default = "Todos"

---

## Plano de migration (1 migration, 4 partes)

### Parte A — Schema
- `organizations`: `round_robin_enabled` (bool, false), `round_robin_scope` (enum text, 'threads_and_contacts'), `private_records_enabled` (bool, false)
- `user_organizations`: `round_robin_active` (bool, true), `last_assigned_at` (timestamptz)
- `message_threads`: `original_owner_user_id` (uuid → users)
- Índice parcial: `(organization_id, last_assigned_at NULLS FIRST) WHERE round_robin_active AND is_active`

### Parte B — Backfill defensivo
```sql
UPDATE permission_profiles 
SET permissions = permissions || '{"view_all_contacts":true,"view_all_opportunities":true,"view_all_threads":true,"manage_assignments":true,"round_robin_recipient":false}'::jsonb
WHERE name = 'Admin';
```
Garante que admins de Blueviza, Plamev, Viagi, Campoar, Central, etc continuam vendo tudo se algum dia ligarem `private_records_enabled`.

### Parte C — Funções e triggers
1. `assign_round_robin(org_id) → uuid` — atômica com `FOR UPDATE SKIP LOCKED`
2. `user_can_view_all(org_id, entity)` — STABLE SECURITY DEFINER, retorna `true` se `private_records_enabled=false` OU profile tem `view_all_{entity}=true`
3. Trigger `BEFORE INSERT contacts` — auto-assign se `owner_user_id IS NULL`
4. Trigger `BEFORE INSERT message_threads` — herda do contato; fallback RR
5. Trigger `BEFORE INSERT opportunities` — herda do contato; fallback RR
6. Trigger `AFTER INSERT messages` — reabertura inteligente (com TODO comentado)
7. Auditoria: cada atribuição automática insere em `activities`

### Parte D — Refactor RLS (3 tabelas)
Padrão único, mantém InitPlan via `current_user_org_ids()`:

```sql
-- contacts SELECT (substitui as 2 policies antigas duplicadas)
DROP POLICY "Users can view contacts in their org" ON contacts;
DROP POLICY "Admins can view all contacts" ON contacts;
CREATE POLICY contacts_select ON contacts FOR SELECT USING (
  organization_id = ANY(current_user_org_ids())
  AND deleted_at IS NULL
  AND (
    user_can_view_all(organization_id, 'contacts')
    OR owner_user_id = current_user_id()
  )
);
```
Mesma estrutura para `opportunities` (campo `owner_user_id`) e `message_threads` (campo `assigned_user_id`).

EXPLAIN ANALYZE vai rodar dentro da migration via `RAISE NOTICE` antes/depois das policies para registrar nos logs.

---

## Frontend (2ª etapa, mesma sprint)

### Tela `/settings/round-robin` (gated por `manage_assignments`)
- Toggle "Atribuição automática (round-robin)"
- Toggle "Privacidade de registros (cada um vê o seu)"
- Lista de usuários da org com:
  - Switch ativo/pausado na fila
  - Contador "Leads recebidos hoje / 7 dias"
  - Última atribuição

### Toggle "Meus / Todos" em 3 telas
- `ContactsList`, `OpportunitiesKanban`, `MessagesList`
- Hook `usePermissions()` ganha `viewAllContacts`, `viewAllOpportunities`, `viewAllThreads`
- Sem permission → toggle escondido, filtro "Meus" forçado
- Com permission → toggle visível, default "Todos"

---

## Ordem de execução (default mode)
1. Rodar a migration (schema + backfill + funções + triggers + RLS)
2. Verificar logs do EXPLAIN ANALYZE
3. Construir tela `/settings/round-robin`
4. Adicionar toggle "Meus/Todos" nas 3 listas
5. Pronto pra você fazer o setup manual da Central (Parte 5)

