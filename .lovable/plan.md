# Seialz Web x SuvSign V2 — continuação da auditoria (itens I/J desbloqueados)

Fontes lidas por completo, direto do projeto SuvSign Flow (somente leitura): `docs/reference/api/signing-engine-v2.md`, `docs/decisions/0011-signing-engine-v2.md` e o código de `api-v2`, `api-router`, `api-handler` (V1) e `_shared/signing-v2/render.ts`. Nada foi alterado em nenhum dos dois projetos.

## A. Contrato Seialz -> SuvSign V2
- Endereço base: `https://vpysvlbfsvomwrgbpybc.supabase.co/functions/v1/api-router`. O router manda `/signing-operations*` para o `api-v2` e o resto para a V1, e devolve o header `X-Signing-Engine`.
- Autenticação: header `x-api-key`, uma chave por conta SuvSign. Sem chave ou com chave inválida: `401 invalid_api_key`.
- Origem: `source: "seialz"` existe na lista aceita (`api | suvsign_web | seialz | seialz_mobile`). Sem divergência. Para o Mobile futuro existe `seialz_mobile`.
- Pré-condição: regra live para (conta, `seialz`). Sem ela, `409 signing_engine_v2_not_enabled`.
- Rotas:
  - `POST /signing-operations`: header `Idempotency-Key` obrigatório. Respostas `201` / `200` (repetição) / `409 idempotency_conflict` / `400` / `422`.
  - `POST /signing-operations/{id}/send`: só em draft. Devolve `signing_links[]`, ou `409 invalid_state`.
  - `GET /signing-operations/{id}`: operação, documentos (`content_sha256`, `final_sha256`, `verification_code`) e participantes (`status`, `opened_at`, `signed_at`).
  - `POST /signing-operations/{id}/cancel`: `409` se já estiver completed/completing/cancelled.
  - `GET /signing-operations/{id}/documents/{docId}/download`: URL assinada válida por 300 s, ou `409 not_finalized`.
- Modelos (API V1, confirmado no código, fora da spec V2): `GET /templates` e `GET /templates/{id}` com a mesma chave, devolvem roles e variables.
- Conteúdo: o V2 recebe só `frozen_content` (páginas com blocos, `content` com HTML ou runs, `type`, `props.fontSize`). Não existe template+variables nem PDF no V2, então a resposta à pergunta A/B/C/D é B (conteúdo congelado).

Exemplo real de criação:
```json
POST /signing-operations
Idempotency-Key: seialz:<org_id>:<request_id>
{ "source": "seialz", "external_id": "<signature_request_id>",
  "metadata": { "organization_id": "...", "opportunity_id": "...", "contact_id": "...", "user_id": "...", "origin": "seialz_web" },
  "participants": [{ "ref": "p1", "name": "Maria Silva", "email": "maria@ex.com", "phone": "+5511999990000", "cpf": "00000000000", "birth_date": null, "role": "signer", "order_index": 0 }],
  "documents": [{ "ref": "d1", "title": "Contrato de Honorários", "frozen_content": { "pages": [{ "blocks": [ { "type": "paragraph", "content": "Contratante: Maria Silva, CPF ..." } ] }] },
    "fields": [{ "participant_ref": "p1", "field_type": "signature", "page_number": 1, "position_x": 60, "position_y": 700, "width": 200, "height": 50, "is_required": true, "metadata": {} }] }] }
```
De onde vem cada campo:

| Campo | Origem no Seialz |
|---|---|
| `participants[].name` | nome resolvido do contato (mesmo fallback da V1) |
| `email`, `phone`, `cpf` | `contacts.email`, `contacts.phone`, `contacts.cpf` |
| `external_id` | id da solicitação local |
| `metadata` | só ids, sem dado pessoal |
| texto do `frozen_content` | modelo da SuvSign + variáveis da seção E, substituídas no servidor |

## B. Contrato SuvSign V2 -> Seialz
- Eventos documentados: `document.sent`, `signatory.signed`, `document.completed`.
  - `document.created`: não existe no V2. A confirmação vem da resposta 201.
  - `document.cancelled`: não existe como evento. Cancelamento só pela resposta do `/cancel`.
  - "Visualizado": não existe webhook. Só via `GET` (`opened_at`).
- Headers:
  - `X-Webhook-Event` / `X-SuvSign-Event`.
  - `X-SuvSign-Delivery`: estável entre retries, é a chave de dedupe.
  - `X-Webhook-Signature` = hex(HMAC-SHA256(secret, body)), formato legado igual à V1.
  - `X-SuvSign-Signature` = hex(HMAC(secret, `${X-SuvSign-Timestamp}.${body}`)), com `X-SuvSign-Hmac-Version: 1`.
- Payload: `{event, engine:"v2", timestamp, document_id, data:{operation_id, external_id, document_id, title, status, signed_file_url (só em completed), signatory{id,name,email,signed_at}, artifact{id,sha256}, documents[], ...metadata.custom}, document{id,status,signed_file_url,file_url}}`.
- Retry: `min(3600, 30*2^(n-1))` s. Qualquer resposta fora de 2xx conta como falha.
- NÃO CONFIRMADO: se `metadata` inteira vem no payload ou só `metadata.custom`. Por isso a correlação usa `operation_id`/`external_id`, nunca `deal_id`.

## C. Persistência local mínima
Reaproveitado: `documents` (PDF final, dedup por `external_source='suvsign'` + `external_ref=<document_id V2>`), `activities` (timeline), `integration_inbound_events` (evento bruto + dedupe por `X-SuvSign-Delivery`).

O que não cabe no modelo atual: estado da operação, participantes, snapshot e hash. Por isso mantenho as duas tabelas:
- `signature_requests`: org, opportunity, contact, created_by, `engine='suvsign_v2'`, `provider_operation_id` (único por org), `idempotency_key` (único), `status` (draft/sent/completed/cancelled), `snapshot` jsonb (frozen_content + variáveis resolvidas), `snapshot_sha256`, `provider_documents` jsonb, sent/completed/cancelled_at.
- `signature_request_participants`: request, org, ref, name, email, phone, cpf, role, order_index, `provider_participant_id`, status, opened_at, signed_at.
- Ambas com GRANT authenticated/service_role, RLS `organization_id = ANY(current_user_org_ids())` e escrita só pelo servidor.

## D. Ponto central no backend
Uma edge function `signature-requests` com ações de negócio (não é um proxy genérico):
- `get_capability`
- `list_templates`
- `prepare_contract` (resolve dados e modelo, gera o snapshot)
- `send_for_signature` (usa o snapshot salvo; create + send com Idempotency-Key derivada do id local)
- `get_signature_status` (GET + sincronização local)
- `cancel_signature`
- `get_download_url`

Autenticação por JWT via `_shared/auth.ts`, org resolvida no servidor e credencial lida só no servidor. O mesmo contrato serve para Web e Mobile.

## E. Autopreenchimento, preview e snapshot
1. `prepare_contract`: o servidor lê o contato e a oportunidade e aplica exatamente as transformações da V1 (fallback de nome, trim, `deal_amount` String, `deal_close_date` longa pt-BR). Busca `GET /templates/{id}`, substitui as variáveis e grava `snapshot` + `snapshot_sha256` em uma solicitação `draft`. Campos ausentes voltam listados, com as mesmas 12 obrigatoriedades da V1.
2. O preview renderiza o próprio `snapshot` gravado, não os dados atuais.
3. `send_for_signature` só aceita `snapshot_sha256` igual ao exibido. Envia esse mesmo `frozen_content` e compara com o `content_sha256` devolvido.
4. Conteúdo imutável: mudou algo no CRM, é preciso um novo `prepare`, que gera outra solicitação.
- NÃO CONFIRMADO: formato interno do conteúdo do modelo V1 (`file_url` JSON) e a sintaxe das variáveis. Verifico no primeiro passo da implementação. Não bloqueia, porque o endpoint existe e devolve `variables`.

## F. Webhook V2 (extensão de `suvsign-webhook`)
- A rota V2 é escolhida quando `engine==="v2"` e `data.operation_id` existe em `signature_requests`. A org vem dessa linha, não do payload. Qualquer outro caso segue o caminho V1, byte a byte igual.
- HMAC: aceita `X-SuvSign-Signature` (timestamp) e, como reserva, `X-Webhook-Signature`, com o secret V2 da org.
- Por evento:
  - `document.sent`: status `sent` + atividade.
  - `signatory.signed`: participante `signed` + atividade.
  - `document.completed`: reaproveita o fluxo atual (host permitido `vpysvlbfsvomwrgbpybc.supabase.co`, que já está na allowlist; Storage; `documents`; `activities`; Nammux via `ensureContactContractOwnershipAndDelivery`), com `external_ref = document_id` V2.
- Dedupe por `X-SuvSign-Delivery`.

## G. Credencial
- Campos novos no cadastro `suvsign`: chave de API V2 e webhook secret V2.
- Gravação e leitura só pelo servidor, com `_shared/integration-credentials.ts` (AES-GCM). O navegador recebe apenas "configurado / ****".
- "Testar conexão": `GET /templates` (espera 200; se vier 401, a chave é inválida).
- O `webhook_secret` da V1 continua como está. Fica registrado como dívida técnica separada.

## H. Coexistência, rollout e rollback
- Precedência da flag (confirmada no banco): `fn_feature_flag_enabled` usa primeiro a linha da org, depois a global, e na falta das duas devolve false.
- Flag `signing.suvsign_v2`: global false, ligada só na org escolhida.
- Ordem para habilitar: credencial V2, regra live SuvSign (conta + `seialz`), teste de conexão, e só então a flag.
- Rollback: desligar a flag (novos envios voltam à V1) e depois a regra live. Solicitações V2 existentes continuam identificadas pelo `provider_operation_id` e recebendo webhook, porque o dispatcher não depende da regra.
- Se a flag estiver ON e a regra OFF, o `409 signing_engine_v2_not_enabled` vira a mensagem clara "V2 não habilitado na SuvSign". Não há volta silenciosa para a V1.

## I. Tela interna
Um painel lateral (`Sheet` existente), aberto pelo mesmo botão quando a capability está ON:
1. Documento (lista de modelos; aceita vários documentos).
2. Dados (preenchimento automático + campos faltando, com link para o contato).
3. Signatários (nome, email, telefone, CPF, papel, ordem sequencial opcional).
4. Preview do snapshot.

CTA "Enviar para assinatura". Depois vira acompanhamento: Enviado, Visualizado (via `opened_at`), Assinado por participante, Concluído, Cancelado, e PDF/download. Nada de "Entregue".

## J. Arquivos
- Novos: migration (2 tabelas + flag OFF), `supabase/functions/signature-requests/index.ts`, `supabase/functions/_shared/suvsign-v2/{client,prepare,credentials}.ts`, `src/components/signature/v2/{SignatureRequestSheet,SignatureRequestTimeline}.tsx`, `src/hooks/useSignatureCapability.ts`, `useSignatureRequests.ts`, docs `docs/integrations/suvsign/v2.md`, ADR 0011 do Seialz, `catalog.md`.
- Alterados: `suvsign-webhook/index.ts` (ramo V2), `SendToSignatureButton.tsx` (só a decisão pela capability), `OpportunityDetail.tsx` (timeline), a tela de detalhe da integração (campos V2 mascarados + testar).

## K. Plano de implementação
1. Persistência + flag OFF: migration e testes de RLS com duas orgs.
2. Credencial: salvar/testar pelo servidor, criptografada; confirmar que o navegador não lê a chave.
3. Backend `signature-requests`: prepare/send/status/cancel/download; testes Deno (idempotência, cross-org 403, 409 traduzido).
4. Webhook V2: ramo por `operation_id`; teste de regressão V1 com um payload real.
5. UI: painel lateral + acompanhamento, tudo atrás da capability.
6. Rollout: org controlada, ciclo completo real, depois rollback.

## L. Critérios de aceite
- A nunca acessa solicitações de B.
- A chave nunca chega ao navegador.
- Nenhum dado pessoal em query string na V2.
- Com a capability OFF, V1 idêntica.
- Pelo menos paridade com o mapa atual de preenchimento.
- Preview e envio com o mesmo `snapshot_sha256`.
- Retry ou clique duplo não duplica a operação.
- Webhook duplicado não duplica timeline nem documento.
- Status real por signatário.
- Vários documentos representáveis.
- `document.completed` salva o PDF.
- O rollback preserva as solicitações existentes.
- O mobile consome o mesmo backend.

## M. Lacunas restantes (nenhuma bloqueia a implementação)
- Formato do conteúdo do modelo V1 e sintaxe das variáveis: validar no passo 3.
- Sem webhook de visualizado ou cancelado: status vem de polling/resposta.
- Posição dos campos de assinatura no `frozen_content` precisa vir do modelo (NÃO CONFIRMADO onde a V1 guarda).
- Payload traz só `metadata.custom`: correlação por `operation_id`.
- Regra live SuvSign e piloto dependem do lado SuvSign.

## N. Decisão
`PRONTO PARA IMPLEMENTAR ENVIO SUVSIGN V2 DENTRO DO SEIALZ WEB`
