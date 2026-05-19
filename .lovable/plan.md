## Objetivo
Eliminar o comportamento quebrado em fases e fechar o fluxo inteiro de impersonação para que:
- o acesso pelo portal admin funcione
- a troca de organização dentro do CRM funcione
- o usuário nunca caia na landing page por causa de redirect incorreto
- o callback finalize a sessão e leve para a org correta com consistência

## Plano
1. Padronizar a entrada do fluxo
- Ajustar todos os pontos de entrada de impersonação para sempre usar a rota de callback dedicada (`/impersonate/callback`) em vez de usar apenas `window.location.origin`.
- Corrigir tanto o acesso a partir de `AdminOrganizations` quanto o acesso por usuário em `AdminOrganizationDetail` e a troca via `ImpersonationBanner`.

2. Endurecer os edge functions
- Revisar `admin-impersonate` e `admin-impersonate-switch` para seguirem a mesma regra de redirect, geração do magic link e anexação do `imp_session`.
- Manter a autorização dual no `admin-impersonate-switch`:
  - sem `currentSessionId`: admin iniciando pelo portal
  - com `currentSessionId`: admin já impersonado trocando de org dentro do CRM
- Garantir que o link final preserve corretamente callback + `imp_session`, sem depender do comportamento implícito do link retornado pelo Supabase.

3. Criar fallback no frontend para links “errados”
- Adicionar uma proteção no app para o caso de o usuário cair em `/?imp_session=...` ou outra rota indevida.
- Se houver `imp_session` na URL, redirecionar automaticamente para o callback correto em vez de mostrar a landing page.
- Isso evita que qualquer link legado ou sessão antiga continue quebrando a experiência.

4. Fortalecer o callback de impersonação
- Revisar `ImpersonateCallback` para garantir a sequência correta:
  - persistir `imp_session`
  - aguardar sessão autenticada válida
  - identificar o usuário interno
  - resolver a organização ativa
  - navegar para onboarding ou dashboard sem corrida de estado
- Melhorar o fallback de erro para não deixar o usuário “preso” sem contexto.

5. Validar o fluxo completo de ponta a ponta
- Conferir os cenários principais:
  - admin portal → acessar organização
  - CRM impersonado → trocar para outra organização
  - sessão já existente com `imp_session` em URL antiga
  - encerramento de sessão de impersonação
- Revisar logs/requests relevantes para confirmar que o link final e o callback estão coerentes.

## Detalhes técnicos
- Arquivos mais prováveis de ajuste:
  - `supabase/functions/admin-impersonate/index.ts`
  - `supabase/functions/admin-impersonate-switch/index.ts`
  - `src/components/admin/ImpersonationBanner.tsx`
  - `src/pages/admin/AdminOrganizationDetail.tsx`
  - `src/pages/admin/ImpersonateCallback.tsx`
  - possivelmente `src/App.tsx` ou a camada de roteamento para o fallback de `imp_session`
- Causa raiz identificada:
  - parte do fluxo ainda usa `redirectUrl: window.location.origin`, então o magic link retorna para `/` e a aplicação abre a landing page com `?imp_session=...` em vez de passar pelo callback de impersonação.
- Resultado esperado após a correção:
  - um único fluxo consistente, sem depender de testes manuais por etapa para descobrir o próximo quebra-cabeça.