# Push do app não chega: o envio está sendo recusado antes de sair

## O que o diagnóstico mostrou (verificado agora)

1. **A fila está funcionando.** `push_delivery_jobs` tem **1.348 avisos acumulados**, do primeiro
   às 15:39 até 20:34 de hoje — inclusive o da conversa de teste. Todos com `attempts = 0` e
   `status = pending`: nunca saíram da fila.
2. **O processo de 30s roda sem falhar** (359 execuções na última hora, todas com sucesso do lado do
   agendador) — mas a chamada que ele faz para o serviço de envio volta **401 unauthorized**
   (120 respostas nessa condição na última hora, a última às 20:35).
3. **Causa raiz:** o serviço `push-dispatch` exige um tipo de credencial (chave de serviço no
   cabeçalho `Authorization`) e o agendamento foi criado enviando outra credencial interna
   (`get_internal_function_auth_token()`). Como a checagem falha, ele responde 401 sem nem ler a
   fila — por isso a Expo mostra "No data available": nenhuma tentativa chegou lá.

Ou seja: gatilho OK, fila OK, agendamento OK, autenticação do worker incompatível.

## Correção proposta (menor mudança possível)

1. **Alinhar `push-dispatch` ao padrão dos outros workers do projeto** (`integration-worker`,
   `intelligence-worker`): autenticação por cabeçalho `x-worker-token` comparado a um segredo
   próprio (`PUSH_DISPATCH_TOKEN`), em vez da chave de serviço no `Authorization`.
2. **Criar o segredo** `PUSH_DISPATCH_TOKEN` e reagendar o job de 30s enviando esse cabeçalho.
3. **Não disparar o acumulado de 1.348 avisos.** Antes de religar, marcar como `skipped`
   (motivo `backlog_pre_fix`) tudo que foi enfileirado antes do momento da correção. Sem isso, o
   primeiro ciclo mandaria centenas de notificações antigas de uma vez para os aparelhos.
4. **Validar com um caso real:** confirmar que existe token de aparelho ativo em
   `user_push_tokens` para o seu usuário; se não existir, o app precisa registrar o token
   (`rpc_register_push_token`) antes do teste — nesse caso o job sai como `skipped: no_active_token`,
   e isso também será verificado.
5. Enviar uma mensagem de teste na conversa atribuída a você e acompanhar o job até `sent`, com o
   push chegando no iPhone e a Expo passando a mostrar envios.

## Detalhes técnicos

- `supabase/functions/push-dispatch/index.ts`: trocar a checagem `bearer !== SERVICE_ROLE_KEY` por
  `req.headers.get("x-worker-token") !== Deno.env.get("PUSH_DISPATCH_TOKEN")`. Nada mais do worker
  muda (claim, Expo, backoff, `DeviceNotRegistered`).
- Novo segredo `PUSH_DISPATCH_TOKEN`; redeploy da function.
- `cron.unschedule('push-dispatch')` + `cron.schedule` com `x-worker-token` e mesmo intervalo de 30s.
- Update pontual em `push_delivery_jobs` (`status = 'skipped'`, `last_error = 'backlog_pre_fix'`)
  para `created_at < now()` no momento da correção.
- Registrar a mudança de cron/segredo conforme a regra de drift (migração/insert versionado).

## Fora de escopo

- Qualquer alteração no sininho/toast do web ou no insert em `notifications`.
- Mudança de destinatário (segue sendo o responsável da conversa).
- Push no navegador.
