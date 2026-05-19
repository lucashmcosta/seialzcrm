## Problema

Ao clicar em **Acessar**, abre uma nova aba em:

```
https://seialz.com/auth/v1/verify?token=...&type=magiclink&redirect_to=...
```

…que cai no **404** do app.

O caminho `/auth/v1/verify` **não pertence ao app** — é o endpoint do **Supabase Auth** (`https://qvmtzfvkhkhkhdpclzua.supabase.co/auth/v1/verify`).

A edge function `admin-impersonate-switch` hoje faz:

```ts
const magicLinkUrl = new URL(sessionData.properties.action_link);
if (redirectUrl) {
  const targetUrl = new URL(redirectUrl);
  magicLinkUrl.protocol = targetUrl.protocol;
  magicLinkUrl.host = targetUrl.host;   // <-- troca supabase.co por seialz.com
}
```

Ou seja, ela está reescrevendo o **host do endpoint de verify** para `seialz.com`. Como o app não tem rota `/auth/v1/verify`, o React Router devolve 404 e o login nunca acontece.

## Correção

1. **Parar de reescrever `host`/`protocol` do `action_link`.**
   O link de verify precisa continuar apontando para o domínio do Supabase Auth — é lá que o token é validado e a sessão é criada.

2. **Usar `redirectTo` no `generateLink` para mandar o usuário de volta pro app depois do verify.**

   ```ts
   const { data: sessionData, error: sessionError } =
     await supabase.auth.admin.generateLink({
       type: 'magiclink',
       email: targetUser.email,
       options: {
         redirectTo: redirectUrl,            // ex: https://seialz.com
       },
     });
   ```

   O Supabase embute esse `redirectTo` dentro do próprio `action_link` (`?redirect_to=...`). Após validar o token, o Supabase redireciona o navegador para `redirectUrl` já autenticado.

3. **Manter o `imp_session` no link final**, só que agora anexado ao **`redirect_to` interno** (não no host do verify), para que ele sobreviva ao redirect:

   ```ts
   const magicLinkUrl = new URL(sessionData.properties.action_link);
   if (impSession) {
     const innerRedirect = magicLinkUrl.searchParams.get('redirect_to');
     if (innerRedirect) {
       const inner = new URL(innerRedirect);
       inner.searchParams.set('imp_session', impSession.id);
       magicLinkUrl.searchParams.set('redirect_to', inner.toString());
     }
   }
   ```

4. **Garantir que o domínio do app (`https://seialz.com`, preview, custom domain) esteja na lista de Redirect URLs do Supabase Auth.** Sem isso, o `redirectTo` é ignorado e cai na Site URL padrão. (Configuração no dashboard, não é código.)

## Arquivos

- `supabase/functions/admin-impersonate-switch/index.ts`
  - remover a reescrita de `host`/`protocol`
  - passar `options.redirectTo: redirectUrl` no `generateLink`
  - mover o `imp_session` para o `redirect_to` interno

Frontend (`AdminOrganizations.tsx`) **não precisa mudar** — já envia `redirectUrl: window.location.origin` e abre `data.action_link` em nova aba.

## Critérios de aceite

1. Clicar em **Acessar** abre nova aba que passa pelo verify do Supabase e cai no app já logado como aquele usuário da org.
2. Não aparece mais 404 em `seialz.com/auth/v1/verify`.
3. O parâmetro `imp_session` chega na URL final do app (para o banner de impersonação funcionar).
4. Conta sem usuário ativo continua mostrando o toast amigável (sem abrir aba).

## Ação manual (fora do código)

Conferir em **Supabase Dashboard → Authentication → URL Configuration → Redirect URLs** se estão liberados:
- `https://seialz.com`
- `https://seialzcrm.lovable.app`
- URL de preview do Lovable
