# Ação oficial `discard_draft` para rascunhos V2 locais

Mudança mínima: sem migration, sem tabela nova, sem mexer no V1 ou na SuvSign e sem nenhum descarte automático.

## Conferido no código e no banco
- A função fica em `supabase/functions/signature-requests/index.ts`.
- Autenticação: o JWT é validado no próprio código com `admin.auth.getUser`, e `me` vem de `users` pelo `auth_user_id`.
- `loadRequest` lê a solicitação com o client do usuário. Isso aplica a RLS de `signature_requests`, que herda a visibilidade da oportunidade (responsável ou view_all). Depois `isMember` confere o vínculo ativo com a organização.
- A única FK que aponta para `signature_requests` é `signature_request_participants.request_id`, com ON DELETE CASCADE.
- O único trigger da tabela é `BEFORE UPDATE` (updated_at). Não há trigger de DELETE.
- Documentos, histórico e eventos não apontam para a solicitação.

O estado confere com a auditoria, então o desenho é seguro.

## Backend: novo `case "discard_draft"`
1. `loadRequest(body.request_id)`. Se não encontrar, devolve 404 `not_found`. Isso cobre outra organização e usuário sem acesso à oportunidade (G e H).
2. Pré-checagem para mensagem clara: se `status !== 'draft'`, ou se `provider_operation_id` ou `sent_at` estiverem preenchidos, devolve 409 `not_discardable`.
3. Exclusão atômica num único DELETE condicional, feito pelo client admin:
   `delete().eq('id', r.id).eq('organization_id', r.organization_id).eq('status','draft').is('provider_operation_id', null).is('sent_at', null).select('id')`
   As condições valem no momento exato do DELETE, dentro de uma só instrução do Postgres. Se o rascunho foi enviado em outra sessão nesse meio-tempo, 0 linhas são apagadas e a resposta é 409 `not_discardable`, com o registro preservado (caso I). Os participantes saem pelo cascade.
4. Resposta: `{ request_id, discarded: true }`.

Não chama a SuvSign nem `cancel_signature`, não grava histórico, evento ou documento, e não escreve em log.

## Tela (`SignatureV2Sheet.tsx`)
- No detalhe, ao lado de "Continuar preparação", entra um botão discreto (ghost) "Descartar rascunho". Ele só aparece quando `status==='draft'`, sem `provider_operation_id` e sem `sent_at`.
- A confirmação usa o AlertDialog que já existe no projeto: "Este rascunho ainda não foi enviado e será removido da lista."
- Em caso de sucesso: `refresh()` da lista, seleção do próximo item disponível e aviso "Rascunho descartado". O modal continua aberto.
- Em caso de erro: a mensagem de erro que o modal já usa hoje (`showErr`).
- "Continuar preparação" não muda.

## Testes
- Deno, com o banco simulado e sem SuvSign:
  - Casos A a F: a regra de elegibilidade.
  - Caso I: o DELETE condicional devolve 0 linhas e a resposta é 409.
  - Casos G e H: `loadRequest` nulo devolve 404.
  - Caso J: nenhuma chamada a `fetch` da SuvSign e nenhum insert em histórico ou documento.
- Banco real, em transação revertida (BEGIN … ROLLBACK), sobre uma cópia temporária criada dentro da própria transação, sem tocar nos 3 rascunhos QA:
  - rodar o DELETE condicional e confirmar que o participante foi removido pelo cascade;
  - confirmar que uma solicitação `sent` não é apagada.
- Rodar os 17 testes existentes e publicar só o `signature-requests`.

## Depois
- Os 3 rascunhos QA (`c8153191`, `a2765bee`, `a756a4ae`) não serão descartados agora.
- As solicitações `3703fb67`, `d916df8f` e `d5ce0615` não são tocadas.
- A ação entra em `docs/integrations/suvsign-v2.md`.
