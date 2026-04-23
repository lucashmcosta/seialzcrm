

## Editar usuários + reativar 3 contas da Central Trabalhista

### Parte 1 — Diagnóstico das contas "deletadas"

Os 3 usuários **não foram deletados** — estão apenas **desativados** (`is_active = false`) na organização Central Trabalhista. Basta reativá-los:

| Nome | Email | Status atual |
|---|---|---|
| Laura Flandoli | lflandoli@centraltrabalhista.com.br | Desativado (Sales Rep) |
| Lucas Kim | lkim@centraltrabalhista.com.br | Desativado (Sales Rep) — *obs: existe outro "Lucas Kim" ATIVO com email `kim@centraltrabalhista.com.br` (Admin); são contas distintas* |
| Camila Silva | csilva@centraltrabalhista.com.br | Desativado (Sales Rep) |

**Capacidade de assentos**: a Central Trabalhista tem hoje 5 ativos. Vou validar `max_seats` da subscription antes de reativar — se não couber, aumento o limite via migração.

### Parte 2 — Editar usuário ao clicar (UI)

Hoje a tabela de Usuários & Permissões só permite trocar perfil (Select inline) e ativar/desativar. Não dá pra editar dados pessoais (nome, email visual, etc.).

**Mudança em `src/components/settings/UsersSettings.tsx`:**

1. **Linha clicável**: cada `<TableRow>` de usuário ativo passa a ser clicável (`cursor-pointer hover:bg-muted/50`). Clique em qualquer área que **não seja** o `Select` de perfil ou o botão "Desativar" abre um diálogo de edição.

2. **Novo componente `EditUserDialog.tsx`** em `src/components/settings/`:
   - Campos editáveis: `full_name`, `first_name`, `last_name`, `avatar_url` (upload simples reutilizando o padrão do Profile)
   - Campos somente leitura: `email` (mudança de email exige fluxo de auth próprio — fora do escopo)
   - Seções: **Dados pessoais** (acima), **Permissão e status** (Select de perfil + toggle Ativo/Inativo, espelhando o que já existe inline)
   - Botão **"Resetar senha"** que envia email de reset via `supabase.auth.resetPasswordForEmail(email)` — útil pra admin destravar usuário
   - Salva via `UPDATE users SET ... WHERE id = membership.user_id`
   - Proteção: o admin logado pode editar dados próprios mas NÃO consegue se rebaixar/desativar (mesma regra que já aplicamos no Select inline)

3. **RLS**: a tabela `users` já permite update pra admins da mesma org via `current_user_managed_org_ids()`. Não precisa migração.

### Parte 3 — Reativar as 3 contas

**Migração SQL** (uma só):
1. Conferir `subscriptions.max_seats` da Central Trabalhista. Se `< 8` (5 atuais + 3), subir pra `8`.
2. `UPDATE user_organizations SET is_active = true WHERE user_id IN (...) AND organization_id = '40ae935c-...'`
3. Recalcular `subscription_usage.current_seat_count` pra refletir os 8 ativos.

### Fora do escopo
- Mudar email do usuário (requer fluxo de confirmação no Auth)
- Editar usuários **pendentes** (convites) — basta cancelar e reenviar
- Mexer em senha direto (apenas botão de reset via email)

