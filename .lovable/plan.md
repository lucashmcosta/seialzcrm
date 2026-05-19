## Objetivo
Consertar o fluxo completo de impersonação para que:
- acesso pelo portal admin funcione em nova aba
- troca de organização dentro da sessão impersonada funcione
- links mágicos nunca caiam em `404`
- callback finalize a sessão sem corrida entre auth e carregamento da app

## Causa raiz identificada
Hoje as edge functions estão reescrevendo o `action_link` gerado pelo Supabase para o host do app (`seialz.com` / preview). Isso quebra o endpoint de verificação, porque `/auth/v1/verify` precisa continuar no domínio do Supabase, não no domínio da aplicação.

Em resumo:
- correto: `https://qvmtzfvkhkhkhdpclzua.supabase.co/auth/v1/verify?...&redirect_to=https://seialz.com/impersonate/callback...`
- quebrado hoje: `https://seialz.com/auth/v1/verify?...`

## Plano

### 1. Corrigir a geração do magic link nas edge functions
Ajustar `admin-impersonate` e `admin-impersonate-switch` para:
- manter o `action_link` original no domínio do Supabase
- alterar apenas o parâmetro `redirect_to`
- garantir que `redirect_to` sempre aponte para `/impersonate/callback`
- preservar `imp_session` dentro do `redirect_to`
- manter a autorização dupla já implementada no switch (admin JWT ou sessão de impersonação ativa)

### 2. Padronizar todos os pontos de entrada do frontend
Revisar os três pontos que iniciam impersonação:
- `AdminOrganizations`
- `AdminOrganizationDetail`
- `ImpersonationBanner`

Todos devem continuar enviando `redirectUrl: ${window.location.origin}/impersonate/callback`, mas sem qualquer lógica adicional que dependa do host do magic link.

### 3. Fortalecer o callback de impersonação
Ajustar `ImpersonateCallback` para:
- capturar `imp_session` de forma robusta
- aguardar a sessão autenticada com segurança
- evitar corrida entre `onAuthStateChange`, `getSession()` e carregamento inicial
- limpar hash/query temporários sem perder o `imp_session`
- navegar para onboarding ou dashboard só depois de resolver o usuário interno e sua organização ativa
- exibir erro útil apenas quando realmente falhar a autenticação

### 4. Corrigir o fallback do `/`
Revisar o fallback em `App.tsx` para redirecionar somente casos válidos de callback legado e não mascarar outros acessos.

### 5. Validar o fluxo ponta a ponta
Vou validar estes cenários:
1. Admin portal -> acessar organização
2. Admin portal -> detalhe da organização -> impersonar usuário
3. Sessão impersonada -> trocar de organização
4. Link antigo com `imp_session`/hash chegando em `/`
5. Encerramento da sessão impersonada

## Arquivos a ajustar
- `supabase/functions/admin-impersonate/index.ts`
- `supabase/functions/admin-impersonate-switch/index.ts`
- `src/pages/admin/ImpersonateCallback.tsx`
- `src/App.tsx`
- se necessário, pequenos ajustes em:
  - `src/pages/admin/AdminOrganizations.tsx`
  - `src/pages/admin/AdminOrganizationDetail.tsx`
  - `src/components/admin/ImpersonationBanner.tsx`

## Detalhes técnicos
```text
Admin/CRM
  -> invoke edge function
  -> edge function gera magic link no Supabase
  -> mantém host qvmtzfvkhkhkhdpclzua.supabase.co/auth/v1/verify
  -> redirect_to = https://seialz.com/impersonate/callback?imp_session=...
  -> Supabase autentica
  -> app recebe callback
  -> callback persiste imp_session
  -> resolve users/auth_user_id + organization
  -> navega para onboarding ou dashboard
```

## Resultado esperado
Ao clicar em acessar/trocar organização, a navegação passa direto pelo verify do Supabase, cai no callback correto da app e abre a organização impersonada sem 404 nem tela branca.