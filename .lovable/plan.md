## Objetivo
Adicionar um botão **Acessar** direto na coluna **Ações** da tela `/admin/organizations`, para abrir a conta já impersonada com **1 clique**, sem precisar entrar no detalhe da organização.

## O que vou implementar

1. **Adicionar o botão `Acessar` na listagem de Contas**
   - Fica ao lado do `Ver` em cada linha.
   - O clique já inicia a impersonação da organização.
   - A abertura será em **nova aba**, para **não derrubar sua sessão do Admin** nem tirar você da lista de contas.

2. **Usar o fluxo já existente de troca por organização**
   - Reaproveitar a edge function `admin-impersonate-switch`, passando apenas:
     - `targetOrganizationId`
     - `redirectUrl`
   - Como ela já sabe escolher o **primeiro usuário ativo** da organização, não preciso duplicar regra no frontend.

3. **Tratar contas sem usuário ativo**
   - No seu print já existem várias contas com `Usuários = 0`.
   - Nessas linhas, o botão `Acessar` ficará **desabilitado** ou com feedback claro (`Sem usuário ativo`).
   - Assim evitamos clique que falha e a UX fica previsível.

4. **Manter o switcher de tenant no banner impersonado**
   - Depois que a conta abrir, o banner vermelho continua sendo o lugar para trocar rapidamente entre tenants já dentro do CRM.
   - Ou seja:

```text
Admin / Contas  ->  [Acessar]  ->  abre tenant já logado
Tenant aberto   ->  banner vermelho  ->  troca para outro tenant
```

## Arquivos previstos

- `src/pages/admin/AdminOrganizations.tsx`
  - adicionar botão `Acessar`
  - loading por linha
  - estado desabilitado para contas sem usuário ativo
  - chamada da edge function e `window.open(...)`

- `supabase/functions/admin-impersonate-switch/index.ts`
  - no máximo um ajuste pequeno para garantir suporte explícito ao uso **sem `currentSessionId`** como acesso inicial vindo do Admin
  - sem mudança de schema

## Validação / risco

- **Baixo risco**: mudança aditiva, localizada, sem migration, sem alterar RLS.
- **Não quebra o fluxo atual**:
  - `Ver` continua existindo
  - `Entrar como` na aba de usuários continua existindo
  - switcher no banner continua funcionando
- **Preserva sua sessão admin** porque o acesso abre em nova aba.

## Critérios de aceite

1. Na tela **Contas**, cada linha passa a exibir `Acessar` + `Ver`.
2. Clicar em `Acessar` numa conta com usuário ativo abre uma nova aba já logada naquele tenant.
3. Dentro dessa aba, o banner vermelho permite trocar para outro tenant.
4. Contas sem usuário ativo não tentam abrir impersonação e mostram estado claro de indisponibilidade.
5. A tela de detalhe da organização continua funcionando igual.