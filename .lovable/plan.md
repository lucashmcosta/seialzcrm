## Problema

No print, **todos os botões "Acessar" estão desabilitados** — inclusive em contas que claramente têm usuário (ex.: `Minha Empresa` com `Usuários = 1`).

A causa é a regra atual no frontend:

```ts
disabled={!org.user_count || accessingId === org.id}
```

O `user_count` é calculado no browser via:

```ts
supabase.from('user_organizations').select('*', { count: 'exact', head: true })
```

Esse `count` roda com a sessão do admin e está sujeito a **RLS de `user_organizations`**, que só deixa o admin ver as orgs das quais ele mesmo participa. Resultado: na maioria das linhas o count volta `0` e o botão fica travado — mesmo quando a org tem usuário ativo de verdade.

## Correção proposta

1. **Parar de bloquear pelo `user_count` do frontend.**
   - Quem sabe de verdade se existe usuário ativo é a edge function `admin-impersonate-switch` (roda com service role).
   - O botão `Acessar` passa a ficar habilitado por padrão, só desabilitando enquanto a requisição daquela linha está em andamento (`accessingId === org.id`).

2. **Tratar o erro "Organização sem usuário ativo" no frontend.**
   - A edge function já lança esse erro — basta exibir num toast amigável: _"Esta conta não tem usuário ativo para acessar."_
   - Sem abrir nova aba quando der erro.

3. **Mostrar `Usuários` real na lista (opcional, mesma correção).**
   - Trocar a contagem feita no browser por uma chamada à edge function `admin-list-orgs-for-switch` (ou estender `admin-list-orgs-for-switch` para devolver `user_count`).
   - Assim a coluna `Usuários` para de mentir "0" em contas que têm gente.
   - Esse passo é o que resolve a causa raiz; sem ele, a coluna `Usuários` continua incorreta mesmo com o botão funcionando.

## Arquivos

- `src/pages/admin/AdminOrganizations.tsx`
  - remover `!org.user_count` da prop `disabled`
  - tratar mensagem de erro vinda da edge function
  - (opcional) trocar a fonte de `user_count` para a edge function admin

- `supabase/functions/admin-list-orgs-for-switch/index.ts` (apenas se formos corrigir a coluna `Usuários`)
  - incluir `user_count` no payload de retorno

Sem migration, sem mudança de RLS.

## Critérios de aceite

1. Botão `Acessar` fica habilitado em todas as linhas (exceto enquanto carrega aquela linha).
2. Clicar numa conta com usuário ativo abre nova aba logada.
3. Clicar numa conta realmente sem usuário ativo mostra toast claro e **não** abre aba.
4. (Se incluirmos passo 3) Coluna `Usuários` passa a refletir o número real de usuários ativos.
