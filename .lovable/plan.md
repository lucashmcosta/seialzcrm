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

Tabelas novas:
- `signature_requests`:
  - org, opportunity, contact, created_by;
  - `engine='suvsign_v2'`: decide como uma solicitação existente é lida, independente da flag;
  - `provider_operation_id` (único por org) e `idempotency_key` (único);
  - `status`, espelhando o provedor: draft / sent / in_progress / completing / completed / cancelled;
  - `snapshot` jsonb (frozen_content + fields + variáveis resolvidas) e `snapshot_sha256`, hash local do snapshot;
  - `provider_documents` jsonb (`document_id`, `content_sha256`, `final_sha256`, `verification_code`), guardados só para auditoria e nunca comparados ao `snapshot_sha256`;
  - sent/completed/cancelled_at.
- `signature_request_participants`: request, org, ref, name, email, phone, cpf, role, order_index, `provider_participant_id`, status, opened_at, signed_at.
- Permissões: `authenticated` só SELECT; `service_role` escreve; `anon` sem acesso; nenhuma escrita pelo navegador.
- A organização sozinha não basta. Policy real de `opportunities` (lida no banco): `is_admin_user() OR (organization_id = ANY(current_user_org_ids()) AND deleted_at IS NULL AND (user_can_view_all(organization_id,'opportunities') OR owner_user_id = current_user_id()))`. Existe escopo por responsável.
- SELECT de `signature_requests`: `organization_id = ANY(current_user_org_ids()) AND EXISTS (SELECT 1 FROM opportunities o WHERE o.id = opportunity_id)`. O subselect roda com a permissão de quem consulta, então herda exatamente a policy da oportunidade. Não é um modelo novo.
- SELECT de `signature_request_participants`: `EXISTS` na `signature_requests` correspondente, que por sua vez herda a regra acima.

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
1. `prepare_contract` roda uma única vez. O servidor lê o contato e a oportunidade e aplica as transformações da V1. Monta o snapshot completo (modelo -> conteúdo -> roles -> variables -> fields) e grava `snapshot` + `snapshot_sha256` em uma solicitação `draft`.
2. O preview renderiza o snapshot gravado.
3. `send_for_signature` envia exatamente esse snapshot salvo. Não relê contato nem oportunidade e confere só o `snapshot_sha256` local.
4. `content_sha256` (PDF assinado antes do certificado) e `final_sha256` (PDF final) são hashes dos PDFs da SuvSign: ficam guardados para auditoria e não entram na comparação.
5. Mudou algo no CRM: é preciso um novo `prepare`, que gera outra solicitação.

### Sinal de compatibilidade (contrato publicado pela SuvSign)
- Compatível: `200` com `v2_definition`.
- Incompatível (tabela ou imagem no corpo): `422 template_not_v2_compatible` com `unsupported_features`.
- Sem definição: `422 template_has_no_v2_definition`. Fields inválidos: `422 template_has_invalid_fields`. Modelo de outra conta: `404`.
- `GET /templates` expõe `v2_compatible` e `v2_unsupported_features`: `list_templates` desabilita os incompatíveis e mostra o motivo.
- `prepare_contract` repete a checagem pelo endpoint de detalhe e bloqueia antes de criar qualquer operação. O Seialz não infere nada.
- Na execução, confirmo esse sinal no código publicado da SuvSign antes de consumi-lo.

### Definição V2 do modelo (gate resolvido pela SuvSign)
- Fonte: `GET /templates/{id}?include=v2_definition` (`x-api-key`). Traz `frozen_content`, `layout_mode` (ex.: `legacy_template_816x1056`), roles, variables, signatários e `fields` já com coordenadas V2. O Seialz não converte coordenadas.
- `prepare_contract`:
  1. busca a definição;
  2. valida a compatibilidade;
  3. substitui as `variables` pelos dados do CRM (mapa V1);
  4. liga cada role/ref de signatário a um participante real do CRM (nunca o e-mail que vem do modelo);
  5. grava o snapshot.
- Sem definição (`422 template_has_no_v2_definition`) ou com recurso incompatível (tabela ou imagem no corpo): bloqueia antes de criar qualquer operação. Mensagem ao usuário: "Este modelo ainda não é compatível com o novo fluxo de assinatura." Nenhum erro técnico é exibido.
- `list_templates` marca a compatibilidade de cada modelo. Os incompatíveis aparecem desabilitados, com o motivo na dica. Nenhum modelo é alterado.

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
- A flag `signing.suvsign_v2` decide apenas se é possível criar um novo envio V2.
- Capability OFF e nenhuma solicitação V2: "Enviar contrato" = V1 exatamente como hoje.
- Capability ON: "Enviar contrato" abre a experiência V2.
- Capability OFF com solicitação V2 existente: novos envios voltam à V1, mas a solicitação V2 continua visível (status, participantes, timeline, PDF, download, e cancelar só se o estado/API ainda permitir). A leitura é decidida por `signature_requests.engine`, não pela flag.
- Ordem para habilitar: credencial V2, regra live SuvSign (conta + `seialz`), teste de conexão, e então a flag.
- Rollback: flag OFF, depois regra live OFF. O webhook e o acompanhamento seguem pelo `provider_operation_id`.
- Flag ON com regra OFF: `409 signing_engine_v2_not_enabled` vira a mensagem clara "V2 não habilitado na SuvSign", sem volta silenciosa para a V1.

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

## K. Plano de implementação (sem rollout nesta rodada)
1. Banco:
   - migration com as 2 tabelas (SELECT para authenticated via RLS da org, escrita só por service_role, sem anon);
   - flag `signing.suvsign_v2` global OFF;
   - testes com duas organizações.
2. Credenciais: API key V2 + webhook secret V2 criptografados no servidor (`integration-credentials.ts`), UI mascarada e "Testar conexão" via `GET /templates`.
3. Backend `signature-requests`: `get_capability`, `list_templates` (com compatibilidade), `prepare_contract` (definição V2 + validação + preenchimento + snapshot), `send_for_signature` (snapshot salvo, Idempotency-Key), `get_signature_status`, `cancel_signature`, `get_download_url`.
4. Webhook: ramo V2 por `operation_id` (sent / signed / completed), dedupe por `X-SuvSign-Delivery` e regressão completa da V1.
5. UI: capability, painel lateral (Documento / Dados / Signatários / Preview), envio e acompanhamento. Solicitações existentes continuam visíveis com a flag OFF.
6. Testes: multi-tenant, V1, modelo compatível e incompatível, preenchimento, snapshot, idempotência, webhook, PDF, rollback, segurança.

Estado final da rodada: flag global OFF, 0 orgs reais habilitadas, nenhuma regra live da SuvSign alterada pelo Seialz, V1 intacta.

## L. Critérios de aceite
- A nunca acessa solicitações de B.
- A chave nunca chega ao navegador.
- Nenhum dado pessoal em query string na V2.
- Com a capability OFF e sem solicitação V2, V1 idêntica.
- Pelo menos paridade com o mapa atual de preenchimento.
- Preview e envio usam o mesmo snapshot persistido, provado pelo `snapshot_sha256` local. `content_sha256`/`final_sha256` só para auditoria, nunca comparados.
- O envio não relê o CRM.
- Coordenadas vêm da definição oficial da SuvSign.
- Modelo incompatível é bloqueado antes do envio.
- Status local espelha os 6 estados do provedor.
- Retry ou clique duplo não duplica a operação.
- Webhook duplicado não duplica timeline nem PDF.
- Status real por signatário.
- Vários documentos representáveis.
- PDF final aparece no Seialz.
- Com a capability OFF, solicitações V2 existentes continuam visíveis e acompanháveis.
- O mobile consome o mesmo backend.

## M. Lacunas restantes
- Limitação conhecida: 2 modelos com tabela e 1 com imagem no corpo são incompatíveis. Tratados como incompatibilidade explícita do modelo, não como bloqueio da integração.
- Sem webhook de visualizado ou cancelado: status vem de GET/resposta do `/cancel`.
- Payload traz só `metadata.custom`: correlação por `operation_id`.
- Regra live da SuvSign e piloto: fora desta rodada.

## N. Decisão
`PRONTO PARA IMPLEMENTAR ENVIO SUVSIGN V2 DENTRO DO SEIALZ WEB`

- Compatibilidade: sinal explícito publicado pela SuvSign.
- RLS: herda o acesso da oportunidade (seção C).
- Ao aprovar, executo as fases 1 a 6 e entrego o relatório dos 22 itens. Ao final: flag global OFF, 0 orgs habilitadas, nenhuma regra live alterada e sem rollout.
