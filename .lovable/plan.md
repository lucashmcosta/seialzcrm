# Push: filtrar envio por vínculo ativo e limpar tokens órfãos

## Resposta à pergunta: o item (A) já existe?
Não. Hoje nada confere o vínculo com a organização:
- `notify_new_message` (trigger em `messages`) cria o job em `push_delivery_jobs` para `message_threads.assigned_user_id`, com o `organization_id` da mensagem, sem olhar `user_organizations`.
- `push-dispatch` (`loadTokens`) busca só `user_push_tokens` com `user_id = destinatário` e `is_active = true`.
- O push de leitura (`fn_enqueue_read_sync_push`) segue o mesmo caminho.
Então um usuário desativado que continua como responsável da conversa recebe título e trecho na tela de bloqueio. O furo é real, e (A) é necessário.

Sobre (C): o upsert é por `(user_id, expo_push_token)`, não só pelo token. O mesmo aparelho pode ficar ativo para dois usuários. (C) também é necessário.

## O que muda

**A) Filtro no envio (`push-dispatch`)**
- Antes de buscar tokens, conferir se existe `user_organizations` com `user_id = recipient_user_id`, `organization_id = job.organization_id` e `is_active = true`.
- Sem vínculo ativo: job encerrado como `skipped`, com `last_error = 'recipient_not_active_member'`, sem chamar a Expo. Vale para os dois tipos de job (mensagem e leitura).
- Se a consulta falhar, o job não é enviado e entra na repetição normal. Assim, um erro nunca deixa o push passar.
- O filtro fica no envio, não na criação do job: cobre também jobs já enfileirados e protege o app que já está nas lojas.

**B) Desativar tokens ao perder o vínculo**
- Nova trigger em `user_organizations`, AFTER UPDATE OF `is_active` (true para false) e AFTER DELETE. Ela desativa `user_push_tokens` do usuário **somente se ele não tiver mais nenhum vínculo ativo em outra organização**.
- Motivo: o token não tem organização. Desligar tudo ao sair de uma organização cortaria o push das outras onde a pessoa continua. O vazamento por organização já fica fechado pelo (A).
- A trigger é à prova de erro (`EXCEPTION WHEN others` só registra aviso), para nunca bloquear a desativação de um usuário. Ela convive com `trg_revoke_sessions_on_deactivate`, que não muda.

**C) Token pertence a quem registrou por último**
- Só o corpo de `rpc_register_push_token_v2` e de `rpc_register_push_token` muda. Antes do upsert, entra `UPDATE user_push_tokens SET is_active=false WHERE expo_push_token = token AND user_id <> atual AND is_active`.
- `rpc_deactivate_push_token` não muda.

## Garantias
- As assinaturas das três RPCs ficam idênticas: mesmos nomes, tipos, ordem, defaults, retorno, `SECURITY DEFINER`, `search_path` e grants. A migration usa `CREATE OR REPLACE` com exatamente os mesmos parâmetros. Depois dela, uma checagem em `pg_proc` confirma uma única versão de cada.
- Não mexe no Web, em `notify_new_message`, em `user_push_tokens`, na estrutura de `push_delivery_jobs` nem nas notificações dentro do app.

## Verificação
- Testes Deno do filtro do `push-dispatch` com vínculo ativo, inativo, inexistente e erro de consulta. Depois, publicar a função.
- Teste SQL em transação com ROLLBACK, cobrindo B: com outra organização ativa e sem ela.
- Teste SQL em transação com ROLLBACK, cobrindo C: token registrado por um segundo usuário.
- Contagem de quantos tokens ativos hoje pertencem a usuários sem nenhum vínculo ativo. A limpeza deles é opcional, separada, e só roda com sua autorização.
- Docs: atualizar `docs/reference/catalog.md` e o data-model de Push. Rollback em `docs/platform/security/`.
