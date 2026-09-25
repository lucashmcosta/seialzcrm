# Copiar link V2

Entra apenas o botão "Copiar link", com uma ação nova no servidor. V1, SuvSign, schema e o resto do modal não mudam, e não há migration.

## Servidor: ação `get_signing_link` em `signature-requests`
Entrada: `request_id` e `participant_id` (o id local do participante, em formato UUID).

1. **Autenticação e acesso:** reaproveita o que já existe.
   - O usuário é autenticado.
   - `loadRequest` lê a solicitação com o banco do próprio usuário, então só encontra o que a política de acesso deixa ele ver (a mesma visibilidade da oportunidade), e ainda confere que ele é membro da organização.
   - A organização vem da própria solicitação, nunca do navegador.
2. **Validações:**
   - a solicitação precisa ter `provider_operation_id` e estar em `sent` ou `in_progress`; se não, responde 409 `invalid_state`;
   - o participante precisa pertencer a essa solicitação e ter `provider_participant_id`; se não, responde 404;
   - participante com status `signed` responde 409 `participant_already_signed`, sem chamar a SuvSign.
3. **Chamada à SuvSign:** `POST /api-v2/signing-operations/{op}/participants/{provider_participant_id}/signing-link`.
   - Usa a credencial V2 da organização, que é decifrada só no servidor.
   - `Idempotency-Key` fixa: `seialz:signing-link:<request_id>:<participant_id>:v1`.
4. **Respostas da SuvSign:**
   - **409 `participant_already_signed`:** marca o participante como `signed` localmente e devolve o mesmo código;
   - **409 `invalid_state`:** "Esta solicitação não aceita mais novos links.";
   - **429:** "Muitas tentativas. Aguarde um instante e tente novamente.";
   - **503:** "SuvSign temporariamente indisponível.";
   - **qualquer outro erro:** 502 genérico.
5. **Retorno:** só `{ signing_url, expires_at }`. Nada vai para activity, `last_error` ou log: nem o link, nem o token.

Deploy só de `signature-requests`.

## Tela: só a linha do participante no detalhe
- O botão contornado "Copiar link", com ícone de link, aparece à direita **somente** quando:
  - a solicitação está em `sent` ou `in_progress`;
  - o participante não assinou.
- Ao clicar:
  - chama `get_signing_link` e copia o `signing_url` para a área de transferência;
  - mostra o toast "Link de assinatura copiado";
  - o botão fica desabilitado enquanto a chamada roda.
- Em caso de `participant_already_signed`, atualiza a lista (o botão some) e mostra o toast "Este participante já assinou".
- Para os outros erros, mostra no toast a mensagem que o servidor devolveu.

## E2E
- Depende de uma operação QA pendente, com credencial real e login na conta.
- O preview de teste não me deixa entrar na sua conta. Então eu:
  - chamo a ação direto pelo servidor, usando uma sessão sua se você autorizar ou se já estiver ativa;
  - comparo o link do 1º e do 2º clique;
  - abro o link e confiro qual participante carrega, sem assinar.
- Se não houver sessão disponível, entrego a ação publicada e o roteiro de teste (clicar 2x, comparar os links, abrir, conferir o participante e o link do e-mail), e fica o E2E pendente com você.
- Sem PASS até o E2E rodar.

## Docs
- `docs/integrations/suvsign-v2.md`: incluir a ação na lista, com a regra da chave fixa.
- Tirar o bloqueio do "Copiar link" no roadmap.

Resultado esperado: `COPIAR LINK V2 INTEGRADO AO SEIALZ — PRONTO PARA LIMPEZA FINAL QA`
