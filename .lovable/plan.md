# Criar contas (tenants) pelo Portal Admin

## Por que você não consegue hoje

A tela **Portal Admin → Contas** é apenas de consulta: ela lista, busca, permite "Acessar" (entrar na conta) e "Ver" os detalhes. **Não existe nenhum botão de criar conta** — nunca foi construído.

Hoje uma conta nova só nasce de duas formas:

1. Alguém se cadastra sozinho na tela pública "Criar conta" (informando nome da empresa) — isso cria a conta com o próprio cadastrante dentro dela.
2. Criação manual nos bastidores (foi o que fizemos nos últimos dias para a Squadra).

Ou seja: não é bloqueio de plano, limite ou permissão. Falta a funcionalidade na tela.

## O que vou construir

Um botão **"Nova conta"** no topo da tela Contas, abrindo um formulário com:

- Nome da conta (obrigatório) — o identificador curto (slug) é gerado automaticamente e verificado para não repetir
- E-mail do primeiro administrador (obrigatório)
- Nome completo desse administrador (obrigatório)
- Senha inicial (obrigatória, mínimo 8 caracteres, com botão para gerar uma forte)
- País de operação (Brasil por padrão)
- Plano inicial (Free por padrão, lista vinda dos planos cadastrados)

Ao confirmar: a conta é criada, o primeiro usuário entra nela já como administrador, e a lista se atualiza mostrando a conta nova com 1 usuário. Se o e-mail já existir no sistema, a tela avisa e o usuário existente é apenas vinculado à nova conta como administrador (sem mexer na senha dele).

Ao final, a tela mostra o e-mail e a senha para você repassar, com aviso para trocar no primeiro acesso.

## Regras de segurança

- A ação só funciona para administradores de plataforma ativos e com MFA, exatamente como as ações de impersonação já exigem.
- Toda criação fica registrada no histórico de auditoria administrativa (quem criou, qual conta, qual primeiro usuário).
- Nada muda para as contas existentes nem para a tela pública de cadastro.

## Detalhes técnicos

- Nova edge function `admin-create-organization` (`verify_jwt = false`, auth própria em código: `Authorization` → `auth.getUser` → `admin_users` ativo + `mfa_enabled`, mesmo padrão de `admin-impersonate`), usando service role.
  - Passos: gerar slug único (`nome-slug` + sufixo curto quando houver colisão) → `insert organizations` (name, slug, operating_country_code) → `auth.admin.createUser` (email_confirm: true) ou reuso do usuário existente por e-mail → upsert em `users` → `insert user_organizations` (is_active, role admin, `permission_profile_id` do perfil Admin quando os perfis-padrão da org existirem) → `insert subscriptions` com o plano escolhido, seguindo o mesmo shape usado hoje → remover org auto-criada pelo trigger de signup, se houver → `insert admin_audit_logs`.
  - Rollback best-effort em falha parcial (apaga a org criada quando o usuário não pôde ser vinculado).
- Frontend: `src/pages/admin/AdminOrganizations.tsx` ganha botão + `AdminCreateOrganizationDialog.tsx` novo (shadcn Dialog/Form, tokens semânticos, sem cinzas hardcoded), invocando a função via `supabase.functions.invoke` e chamando `fetchOrganizations()` no sucesso.
- `supabase/config.toml`: entrada `[functions.admin-create-organization] verify_jwt = false` com comentário justificando (auth própria + MFA).
- Sem migração de banco: usa tabelas e colunas já existentes.
- Deploy explícito da edge function após a implementação.
