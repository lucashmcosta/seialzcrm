

## Plano: criar Victoria Caroline na Central Trabalhista (replicando o método da Tamires)

### O que descobri
- Tamires Sousa foi criada com sucesso em 9/mar/2026 nessa mesma org (`40ae935c-a7f7-4ad7-8ea4-91be6404a95f`) — prova que o caminho funciona.
- Victoria ainda não existe no banco.
- Perfil **Sales Rep** da Central Trabalhista: `4b534121-b290-4575-a4fe-a82488cca346`.
- A edge function `create-user` não vai bloquear (current_seat_count é NULL → trata como 0 → passa do limite de 3).

### Por que falhei antes
Tentei chamar a edge function via `curl` direto, que exige JWT de admin autenticado. Mas eu tenho ferramenta dedicada (`supabase--curl_edge_functions`) que injeta automaticamente o token de sessão atual — exatamente como o navegador do admin faria quando criou a Tamires.

### Execução (1 chamada)

Invocar `create-user` via `supabase--curl_edge_functions` com payload:
```json
{
  "email": "vamorim@centraltrabalhista.com.br",
  "password": "123456",
  "full_name": "Victoria Caroline Vieira Amorim de Souza",
  "organization_id": "40ae935c-a7f7-4ad7-8ea4-91be6404a95f",
  "permission_profile_id": "4b534121-b290-4575-a4fe-a82488cca346"
}
```

A edge function vai:
1. Criar em `auth.users` (email já confirmado)
2. Criar registro em `public.users`
3. Vincular em `user_organizations` (ativa)
4. Limpar a auto-org criada pelo trigger
5. Incrementar contador de seats

### Validação pós-criação
Rodar SELECT confirmando que Victoria aparece em `users` + `user_organizations` da Central Trabalhista com perfil Sales Rep.

### Pré-requisito
Você precisa estar **logado no preview como admin da Central Trabalhista** (ex: lcosta@centraltrabalhista.com.br) na rota /auth/signin → entrar. Sem isso, a ferramenta não tem JWT pra anexar e a edge function rejeita.

Atualmente você está na tela `/auth/signin` (não logado). **Faça login primeiro como admin**, então me avise pra eu disparar a criação.

### O que NÃO vou fazer
- Não vou tocar em `max_seats`, `subscription_usage` ou na lógica da edge function
- Não vou mexer nos erros de build de `ContactTasks.tsx` / `Dashboard.tsx` (não relacionados)

