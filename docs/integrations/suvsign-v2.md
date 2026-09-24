# SuvSign Signing Engine V2 no Seialz Web

Estado: implementado e desligado (`signing.suvsign_v2` global OFF, nenhuma org habilitada). A V1 (`SendToSignatureButton` + `suvsign-webhook`) continua inalterada.

## Peças
- Tabelas: `signature_requests`, `signature_request_participants` (usuário autenticado só consegue SELECT; a policy herda o acesso à oportunidade: responsável/view_all). `suvsign_v2_credentials` fica acessível só para o service_role; a API key e o webhook secret são guardados com AES-GCM (`META_TOKEN_ENCRYPTION_KEY`).
- Edge `signature-requests` (JWT validado no código). Ações: get_capability, get_credentials_status, save_credentials, test_connection, list_templates, prepare_contract, get_preview, send_for_signature, get_signature_status, cancel_signature, get_download_url.
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
