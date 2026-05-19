## Problema

Após o clique em **Acessar**, a nova aba é aberta no link do Supabase Auth (`/auth/v1/verify?...`), o Supabase processa o token e redireciona para `https://seialz.com/?imp_session=...#access_token=...`.

O destino é a **landing page** (`/`). Ela não trata o hash do magic link de forma confiável (sem `useEffect` que aguarde `onAuthStateChange`), e como a aba não tem sessão prévia, qualquer navegação subsequente acaba caindo em `/auth/signin`. Resultado: o admin "loga", mas é jogado para a tela de login do Seialz em vez do dashboard da organização.

## Solução

Criar uma rota pública dedicada `/impersonate/callback` que:

1. É pública (não passa por `ProtectedRoute`).
2. Espera o `supabase-js` consumir o `#access_token` do hash (detectSessionInUrl).
3. Lê `imp_session` da query string e guarda em `sessionStorage` (para o `ImpersonationBanner` exibir o aviso).
4. Quando `onAuthStateChange` dispara `SIGNED_IN`, resolve a organização do usuário e navega para `/dashboard` (ou `/onboarding` se aplicável) com `replace`.
5. Mostra um loader enquanto isso (`PageLoader`).

E ajustar o fluxo para apontar para essa rota:

- **`src/pages/admin/AdminOrganizations.tsx`**: trocar `redirectUrl: window.location.origin` por `redirectUrl: \`${window.location.origin}/impersonate/callback\``.
- **`supabase/functions/admin-impersonate-switch/index.ts`**: nenhuma mudança lógica — continua repassando `redirectUrl` em `options.redirectTo` e anexando `imp_session` ao `redirect_to` interno. Apenas o destino muda.

## Arquivos

```text
src/pages/admin/ImpersonateCallback.tsx   (novo)
src/App.tsx                                (registrar rota pública)
src/pages/admin/AdminOrganizations.tsx     (mudar redirectUrl)
```

## Detalhes técnicos

- `ImpersonateCallback` usa `useAuth()` + `useEffect` que observa `user`/`loading`. Quando `user` existir, busca `user_organizations` → `organizations.onboarding_step` e roteia para `/dashboard` ou `/onboarding`.
- Timeout de 8s: se `user` continuar `null`, mostra erro e botão "Voltar ao admin".
- Limpa o hash da URL após processar (`window.history.replaceState`).

## Configuração manual obrigatória

No Supabase Dashboard → **Authentication → URL Configuration → Redirect URLs**, adicionar:

```
https://seialz.com/impersonate/callback
https://seialzcrm.lovable.app/impersonate/callback
https://id-preview--3e7cbf89-7e65-4eb1-ae96-6b6359aa6e47.lovable.app/impersonate/callback
```

Sem isso o Supabase recusa o `redirect_to` e cai no fallback (Site URL → `/auth/signin`), que é exatamente o sintoma atual.

## Validação

1. Como admin, clicar **Acessar** numa org.
2. Nova aba abre em `qvmtzfvkhkhkhdpclzua.supabase.co/auth/v1/verify?...`.
3. Redireciona para `seialz.com/impersonate/callback?imp_session=...#access_token=...`.
4. Loader breve → cai em `/dashboard` logado como o usuário da org, com `ImpersonationBanner` no topo.
