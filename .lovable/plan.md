# Corrigir "Falha ao salvar credencial" (Nammux) — 401 em `nammux-credential-manage`

## O que está confirmado

- O erro do Sentry vem de `src/components/integrations/nammux/NammuxDialog.tsx:312` (mutation de salvar), mas a causa real é a chamada `POST /functions/v1/nammux-credential-manage` retornando **401** — três vezes no mesmo fluxo (status, status, rotate).
- `supabase/config.toml` tem `verify_jwt = false` para essa função, e um curl direto sem token chega até o código da função (resposta `{"error":"missing_authorization"}`). Ou seja, o gateway não está bloqueando por JWT.
- A função autentica o usuário com `createClient(url, SUPABASE_ANON_KEY).auth.getUser(token)` e devolve `401 invalid_authorization` quando isso falha. As demais funções do projeto (`_shared/auth.ts`) validam o token com o **client service-role**, não com a anon key.
- O frontend usa um helper próprio (`invokeAuthenticatedFunction`) que lê `getSession()` e fixa manualmente o header `Authorization`, em vez de deixar o supabase-js anexar o token já renovado.

Causa provável (ainda **não confirmada**): o token enviado/validado é rejeitado no `getUser` — seja por token fixado manualmente já vencido, seja porque a validação via anon key não funciona com o esquema de chaves atual. A primeira etapa do plano é confirmar qual dos dois.

## Etapas

1. **Diagnóstico (5 min, sem mudança de comportamento)**
   - Adicionar log estruturado na função distinguindo `missing_authorization`, falha do `getUser` (com `code`/`status`) e falha de membership/permissão.
   - Reproduzir abrindo o diálogo Nammux e ler os logs da função para saber exatamente qual ramo devolve 401.

2. **Alinhar a validação de token ao padrão do projeto**
   - Em `supabase/functions/nammux-credential-manage/index.ts`, validar o token com o client **service-role** (mesmo padrão de `_shared/auth.ts`) em vez do client anon.
   - Aplicar o mesmo ajuste nas funções Nammux irmãs que repetem o padrão anon: `nammux-test-connection`, `nammux-replay-opportunity`, `nammux-reconcile-opportunities`, `nammux-audit`.

3. **Simplificar a chamada no frontend**
   - Em `NammuxDialog.tsx`, deixar o `supabase.functions.invoke` anexar o token automaticamente (token sempre fresco, com auto-refresh), mantendo apenas a checagem de sessão existente para a mensagem amigável.

4. **Melhorar a mensagem de erro**
   - `functionFailureMessage` passa a incluir o status HTTP e o código retornado, para que o Sentry mostre "401 invalid_authorization" em vez do genérico "Falha ao salvar credencial".

5. **Validação**
   - Abrir Configurações → Integrações → Nammux, conferir que o status da credencial carrega e que "Salvar" com um segredo novo retorna `ok: true`, confirmando pelos logs da função.

## Detalhes técnicos

- Nenhuma migration, nenhuma mudança de schema ou de RLS.
- As checagens de autorização de negócio permanecem idênticas: usuário interno existente, membership ativo na organização e `permissions.can_manage_integrations === true`.
- `verify_jwt = false` continua como está; a validação segue explícita no código da função.
