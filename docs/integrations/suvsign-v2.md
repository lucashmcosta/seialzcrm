# SuvSign Signing Engine V2 no Seialz Web

Estado: implementado e desligado (`signing.suvsign_v2` global OFF, nenhuma org habilitada). A V1 (`SendToSignatureButton` + `suvsign-webhook`) continua inalterada.

## Peças
- Tabelas: `signature_requests`, `signature_request_participants` (usuário autenticado só consegue SELECT; a policy herda o acesso à oportunidade: responsável/view_all). `suvsign_v2_credentials` fica acessível só para o service_role; a API key e o webhook secret são guardados com AES-GCM (`META_TOKEN_ENCRYPTION_KEY`).
- Edge `signature-requests` (JWT validado no código). Ações: get_capability, get_credentials_status, save_credentials, test_connection, list_templates, prepare_contract, get_preview, send_for_signature, get_signature_status, cancel_signature, get_download_url, get_signing_link.
- Edge `suvsign-v2-webhook` (pública, com HMAC). A organização é resolvida por `data.operation_id` → `signature_requests`. Aceita `X-SuvSign-Signature` (`timestamp.body`, janela de 15 min) ou `X-Webhook-Signature`.
- UI: `ContractSignatureEntry` (oportunidade), `SignatureV2Sheet` e `SuvSignV2CredentialsCard` (Integrações).

## Regras
- A compatibilidade do modelo vem só da SuvSign: `v2_compatible` na listagem e 422 em `?include=v2_definition`. O Seialz não detecta tabela nem imagem.
- `prepare_contract` é o único ponto que lê o CRM. Ele grava `snapshot` e `snapshot_sha256` (JSON canônico). `send_for_signature` confere o hash e envia o snapshot salvo, com `Idempotency-Key` fixa por solicitação.
- `content_sha256`/`final_sha256` ficam só para auditoria, em `provider_documents`.
- A flag decide apenas novos envios. As solicitações existentes continuam visíveis e acompanháveis com a flag OFF.
- PDF final: `documents` com `external_source='suvsign_v2'`, fazendo dedupe por `external_ref`.
- [INCERTO] Os mapeamentos de campo do conector configurados dentro da SuvSign (V1 `applyFieldMapping`) não são acessíveis ao Seialz. O preenchimento V2 cobre as variáveis nativas (role, Contact, Deal, Document, Custom.<chave do Seialz>).
- [TODO] O repasse Nammux do contrato V2 não está ligado. A V1 continua fazendo esse repasse.

## Habilitar (homologação)
1. Salvar a credencial V2 e o secret nas Integrações e depois usar "Testar conexão".
2. Cadastrar na SuvSign o webhook `…/functions/v1/suvsign-v2-webhook` com o mesmo secret.
3. Ativar a regra live na SuvSign (conta + `seialz`).
4. Inserir `integration_feature_flags(flag_key='signing.suvsign_v2', organization_id=<org>, enabled=true)`.

Rollback: flag da org OFF (efeito em até 60 s) e depois a regra live OFF.

## Fechamento técnico pré-homologação (2026-09-24)

### Nammux (paridade V1)
- Mesmo chokepoint da V1: trigger `fn_emit_nammux_contact_contract_v1` em `documents` + RPC `fn_enqueue_nammux_contact_contract_replays_v1`. Ambos agora aceitam `external_source in ('suvsign','suvsign_v2')` (V1 sem mudança de comportamento).
- `suvsign-v2-webhook` em `document.completed` chama a mesma RPC também quando o documento já existia (retry). Idempotência pela `idempotency_key` da RPC.
- Teste em transação revertida: insert gerou 1 job; 2 replays extras geraram 0 (`events_inserted=0`); duplicar o documento foi bloqueado (unique).

### Webhook separado
- Org resolvida só por `data.operation_id` → `signature_requests`; secret = `suvsign_v2_credentials.webhook_secret_ciphertext` da org dona.
- URL exibida em Integrações (`/functions/v1/suvsign-v2-webhook`). [INCERTO] se o webhook na SuvSign é por conta ou por operação — confirmar com a SuvSign antes do E2E.
- V1 e V2 coexistem na mesma org. V2 recusa payload sem `engine:"v2"`; V1 agora ignora (200 skipped) payload com `engine:"v2"`.
- Rollback: flag OFF bloqueia novos envios; operações V2 existentes continuam chegando no mesmo endpoint V2.

### Ações `signature-requests` (11)
get_capability, get_credentials_status*, save_credentials*, test_connection*, list_templates, prepare_contract, get_preview*, send_for_signature, get_signature_status, cancel_signature, get_download_url, get_signing_link.
(*) extras: status mascarado da credencial; gravação cifrada (admin da org); teste de conexão (só contagem de templates); preview do snapshot congelado. Nenhuma é proxy genérico nem retorna segredo.

### Verificações
- Credenciais: anon/authenticated sem nenhum privilégio; nenhuma view/função referencia a tabela; só colunas `*_ciphertext` + `api_key_last4`; único log registra ação + mensagem de erro.
- RLS (transação revertida, org 40ae…, 15 usuários da org + 3 de outras): visibilidade da solicitação = visibilidade da oportunidade em 18/18 casos; usuários de outra org = 0.
- Template do piloto: BLOQUEADO — sem credencial V2 não dá pra listar variáveis; é preciso informar o template.

### Copiar link (`get_signing_link`, 2026-09-25)
- A ação chama `POST /api-v2/signing-operations/{op}/participants/{provider_participant_id}/signing-link` pelo mesmo `suvsignFetch` e pela mesma `baseUrl` das demais chamadas.
- `Idempotency-Key` fixa por solicitação e participante: `seialz:signing-link:<request_id>:<participant_id>:v1`. Todos os cliques devolvem o mesmo link.
- Só funciona em `sent`/`in_progress`. O participante precisa pertencer à solicitação, e a solicitação precisa estar visível para o usuário, pela RLS e pelo teste de membro da organização.
- Retorna somente `signing_url` e `expires_at`. O link não é gravado em banco nem em activity, e não aparece em log.
- Respostas: 409 `participant_already_signed` marca o participante como assinado; 409 `invalid_state`; 429 `rate_limited`; 503 `provider_unavailable`.
- [TODO] E2E com uma operação QA pendente.
