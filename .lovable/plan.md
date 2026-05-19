## Problema
A correção anterior tornou `currentSessionId` obrigatório em `admin-impersonate-switch`. Mas a tela `AdminOrganizations` (admin portal) também usa essa função — e lá não existe sessão ativa ainda. Resultado: "Acessar" no portal quebrou.

## Correção
Tornar a autorização em `supabase/functions/admin-impersonate-switch/index.ts` **dual**:

1. Ler `currentSessionId`, `targetOrganizationId`, `redirectUrl` do body. Apenas `targetOrganizationId` obrigatório.
2. **Se `currentSessionId` presente** → autorizar via `impersonation_sessions` (modo "trocar conta de dentro do CRM").
3. **Se não** → cair no fluxo antigo: validar JWT do `Authorization` header, buscar `admin_users.auth_user_id = user.id`, validar MFA + active (modo "iniciar do portal admin").
4. Em ambos os casos, prosseguir com o restante do fluxo já existente usando o `adminUser` resolvido.

Sem mudanças no frontend.
