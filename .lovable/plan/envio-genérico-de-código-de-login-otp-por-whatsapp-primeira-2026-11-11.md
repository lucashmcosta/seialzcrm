# Envio genérico de código de login (OTP) por WhatsApp — primeira org: Auxilius

## O que já existe (conferido)
- Auxilius: `4bba3f19-b17e-4205-b495-68e62f62f41b`, com 1 número Meta Cloud API ativo (endpoint `0789f3b7…`, integração `be28e82d…`) e o template `codigo_acesso` (AUTHENTICATION, pt_BR, approved).
- `client-portal-otp-send` (Central) fica intocada. A nova função só reaproveita os módulos compartilhados (`_shared/client-portal/hmac.ts`, `_shared/meta-whatsapp/graph.ts` e `credentials.ts`).

## O que será feito
1. Nova Edge Function `whatsapp-otp-send` (POST, `verify_jwt = false`, OPTIONS/GET → 405, Content-Type JSON obrigatório).
2. Segredo por organização: um mapa fixo no código `organization_id → nome do secret` (hoje só Auxilius → `AUXILIUS_OTP_HMAC_SECRET`). Uma org fora do mapa ou sem o secret cadastrado responde 401, sem revelar o motivo. Para incluir outra org no futuro: adiciona uma linha no mapa e cadastra o secret dela.
3. Ordem: lê o corpo cru → pega `organization_id` → escolhe o segredo → verifica a assinatura (`sha256=` + HMAC de `"{timestamp}.{corpo}"`, ±5 min, comparação em tempo constante) → 401 se falhar. Uma assinatura feita com o segredo de outra org nunca bate, e é isso que prova que a org do corpo é a mesma que assinou.
4. Validação (400 `invalid_input`): org em formato uuid, `phone_e164` no formato `^\+[1-9]\d{7,14}$`, `code` com 4 a 15 caracteres alfanuméricos, `template` em `^[a-z0-9_]{1,512}$` e `language` em `^[a-z]{2}(_[A-Z]{2})?$`.
5. Integração: endpoint Meta Cloud API ativo da org com `sender_sid` (nunca o 7020 histórico). Se houver mais de um, usa o mais antigo ativo. Se não houver nenhum, responde 503 `whatsapp_not_connected`.
6. Template: precisa existir aprovado e ativo naquela integração, com o nome e idioma recebidos e `category = AUTHENTICATION`. Se não, responde 422 `template_not_found`.
7. Limite: no máximo 5 tentativas por telefone por organização na última hora. Se passar, responde 429 `rate_limited`. Contam os envios e as falhas na Meta.
8. Envio: payload no mesmo formato da Central, com o código no parâmetro do corpo e no botão (`button`, `sub_type url`, `index 0`). Usa o token salvo na integração. Não exige conversa anterior e não toca em `message_threads`/`messages`.
9. Respostas: sucesso = 200 `{ "sent": true }`. Erro = `{ "sent": false, "code": "..." }`, com os códigos `unauthorized` 401, `invalid_input` 400, `whatsapp_not_connected` 503, `template_not_found` 422, `rate_limited` 429, `send_failed` 502 (com o código de erro da Meta quando houver, ex. `send_failed`) e `internal_error` 500.

## Registro (sem o código)
Nova tabela `whatsapp_otp_send_log`, só para o service_role (REVOKE de anon/authenticated, RLS ligada, sem policy):
- colunas: `organization_id` (FK ON DELETE CASCADE), `phone_hash` (sha256 do telefone, usado no limite), `phone_last4`, `template_name`, `status` CHECK (`sent`, `failed`), `error_code`, `meta_message_id` e `created_at`;
- índice em (org, phone_hash, created_at).

Nada do código nem do telefone completo vai para o banco ou para os logs.

## Testes e entrega
- `logic.ts` + `logic_test.ts` (Deno): assinatura (válida, errada, fora de 5 min, org fora do mapa), validação de entrada, payload com código no corpo e no botão, regra do limite.
- Bloco no `config.toml`, publicação e teste real sem assinatura (esperado 401). Nenhum envio real.
- Docs: linha em `docs/reference/catalog.md`, secret em `.env.example`/`docs/getting-started.md`, regra em `AGENTS.md`.
- Depois da publicação, peço o valor de `AUXILIUS_OTP_HMAC_SECRET` pelo formulário seguro (com botão Gerar, para você copiar no sistema externo).
- URL final: `https://qvmtzfvkhkhkhdpclzua.supabase.co/functions/v1/whatsapp-otp-send`.

## [INCERTO]
- O pedido não especifica o formato do `code`. Proposto: 4 a 15 caracteres alfanuméricos, limite que a Meta aceita no botão de copiar.
