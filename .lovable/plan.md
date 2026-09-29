# SuvSign V2: enviar o autor real (`requested_by`)

## O que a leitura do código mostrou
- `signature-requests` autentica pelo JWT (`admin.auth.getUser(token)`) e depois carrega o usuário do Seialz em `users` (`id, full_name, email`) pelo `auth_user_id`. O resultado é `me`.
- `prepare_contract` grava `signature_requests.created_by = me.id`. Esse campo guarda o autor do rascunho: quem preparou o envio.
- O `POST /signing-operations` é montado em um único lugar, `send_for_signature` (`signature-requests/index.ts`, cerca da linha 308). O corpo é `{ source, external_id, metadata, participants, documents }`, e a `Idempotency-Key` é `r.idempotency_key`, fixa para cada solicitação.
- O body do browser só é usado para `action` e `request_id` nessa ação. Nada vindo de `requested_by` no body é lido.

## Alteração (somente em `send_for_signature`, V2)
1. Antes do POST, buscar com service role em `users`: `id, full_name, email` do registro em que `id = r.created_by` **e** que tenha vínculo ativo em `user_organizations` com `r.organization_id`. Assim a autoria é sempre de quem criou a solicitação, e não de quem clicou em reenviar.
2. Montar `requested_by = { external_user_id: autor.id, name: full_name (se houver), email }`, cortando cada texto em 200 caracteres.
3. Acrescentar `requested_by` ao corpo atual e manter o resto como está: participants, documents, metadata, external_id e Idempotency-Key.
4. Se o autor não tiver e-mail ou não pertencer à org, o POST segue **sem** `requested_by`, no comportamento de hoje, e o motivo é registrado em `last_error`. [A confirmar com você: prefere bloquear o envio nesse caso?]
5. Não mudo V1, webhook, renderer, snapshot, preview, schema nem frontend.

## Retry e idempotência
- A autoria sai de `created_by`, que não muda, então retries feitos por outra pessoa enviam o mesmo `requested_by`.
- Risco que sobra: se o nome ou o e-mail do autor forem editados em `users` entre a primeira tentativa que falhou e o retry, a SuvSign devolve `409 idempotency_conflict`. Para evitar isso seria preciso congelar a identidade, com schema novo ou dentro do snapshot, que tem hash. Pela sua regra **não faço isso sem autorização**. O 409 aparece como erro claro e não duplica nada.
- Solicitações que já têm `provider_operation_id` não refazem o POST, então não são afetadas.

## Testes (Deno, com o fetch da SuvSign simulado; sem chamada real)
A e B: Victoria e Junior, cada um como autor, enviam os próprios dados. C: outro usuário qualquer, sem hard-code. D: um body com `requested_by` falso é ignorado. E: retry repete o mesmo payload e a mesma chave. F: retry feito por outro usuário mantém o autor original. G: nenhum arquivo V1 mudou (diff). H: um autor de outra org resulta em envio sem `requested_by`.

## Publicação
Deploy explícito somente de `signature-requests`. Não crio contrato real. Entrego o relatório com os 14 itens e o bloco final. Migration: NÃO.
