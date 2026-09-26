# Auditoria read-only: fluxo V2 de assinatura (SuvSign) para o app mobile

Nada foi alterado. As fontes são `supabase/functions/signature-requests/index.ts` (edge, chamada de "SR" abaixo), `supabase/functions/_shared/suvsign-v2.ts`, `supabase/functions/suvsign-v2-webhook/index.ts`, `src/components/signature/ContractSignatureEntry.tsx`, `SignatureV2Sheet.tsx`, `FrozenDocumentPreview.tsx` e `docs/integrations/suvsign-v2.md`.

## A. Ativação e convivência com o V1
1. O botão "Enviar contrato V2 (Piloto)" não depende do critério V1 (`organization_integrations` + `admin_integrations.slug='suvsign'`). Ele depende de flags em `integration_feature_flags`, lidas por `fn_feature_flag_enabled` com cache de 60 s (`_shared/feature-flags.ts`):
   - `signing.suvsign_v2`: V2 oficial. Está OFF no global e em todas as orgs.
   - `signing.suvsign_v2_pilot`: piloto. Está ON só na Central (`40ae935c…`).
   - Para saber qual mostrar, o cliente chama SR `get_capability({opportunity_id})`, que devolve `{v2_enabled, pilot_enabled, has_credentials, requests[]}`. No web, o botão piloto aparece quando `pilot_enabled && !v2_enabled`.
   - Não existe variável de ambiente nem permissão nomeada para isso.
2. O V1 continua em paralelo e não mudou. No piloto, os dois botões aparecem lado a lado. Com `v2_enabled=true` (futuro), o botão V1 some e o V2 vira "Enviar contrato".
   - Não há data documentada para desligar o V1. [INCERTO]
   - Recomendação para o app: manter o V1 e mostrar o V2 pela capability.

## B. Modelo de dados
3. O V2 criou três tabelas:
   - `signature_requests`: id, organization_id, opportunity_id, contact_id, created_by, engine='suvsign_v2', template_id (primeiro), template_name (nomes unidos por " + "), status, snapshot (jsonb), snapshot_sha256, idempotency_key, provider_operation_id, provider_documents (jsonb[]: document_id, ref, title, status, hashes), sent_at, completed_at, cancelled_at, last_error, created_at.
   - `signature_request_participants`: request_id (FK com cascade), organization_id, ref (p1…pN), name, email, phone, cpf, role, template_role, order_index, status, provider_participant_id, opened_at, signed_at.
   - `suvsign_v2_credentials`: só o service_role acessa; os dados ficam cifrados.
   - Não existe tabela separada de "documentos da solicitação". Eles ficam em `snapshot.documents` (rascunho) e em `provider_documents` (depois do envio).
4. Status da solicitação (`mapOperationStatus`): `draft`, `sent`, `in_progress`, `completing`, `completed`, `cancelled`.
   - Não existe `expirado` nem `aguardando`.
   - `draft` nasce em `prepare_contract`.
   - `sent` vem de `send_for_signature`.
   - `in_progress`, `completing` e `completed` chegam pelo webhook ou por `get_signature_status`, espelhando a operação na SuvSign.
   - `cancelled` vem de `cancel_signature`.
   - Status do participante: `pending`, `invited`, `opened`, `viewed`, `signed`.
   - Os rótulos em PT estão em `src/lib/signatureRequestsApi.ts`.
5. O usuário autenticado tem só SELECT via RLS, herdando a visibilidade da oportunidade. Toda escrita e toda chamada à SuvSign passa por SR (POST com JWT, `{action, ...}`). Os helpers usam `callSignatureRequests` via `supabase.functions.invoke('signature-requests')`.

## C. Passo 1: documentos
6. A lista vem de SR `list_templates({opportunity_id})`, que é um proxy do `GET /templates` da SuvSign com a credencial da org. Nada fica guardado no Seialz. A ordem é a da SuvSign, e o Seialz não aplica filtro.
7. A compatibilidade é calculada só pela SuvSign: o campo `v2_compatible` mais `v2_unsupported_features[]`. "invalid_fields" é um desses códigos.
   - O front apenas exibe "Incompatível: <códigos>" (`SignatureV2Sheet.tsx:359`).
   - A regra não depende do contato nem da oportunidade. O app só precisa reproduzir: bloquear quando `v2_compatible=false`.
   - Os outros códigos possíveis são definidos pela SuvSign. [INCERTO] A lista não está no repo.
   - Reforço no servidor: `prepare_contract` busca `?include=v2_definition` e recusa com 422/404 se o modelo não for compatível. Mesmo que o app erre, o servidor bloqueia.
8. Vários documentos por envio: `template_ids[]` é deduplicado e gera uma única operação com N documentos. Não há limite no código. [INCERTO] O limite da SuvSign não foi verificado.
   - A regra é tudo ou nada: se qualquer modelo falha, `prepare_contract` aborta antes de gravar qualquer coisa.

## D. Passo 2: dados e signatários
9. Origem dos campos (`prepare_contract`):
   - Da tabela `contacts`: full_name/first_name/last_name, email, phone, cpf, rg, rg_issuer, nationality, address_street + address_number (formam `Endereco`), address_neighborhood, address_city, address_state, address_zip (o CEP é formatado como 00000-000).
   - Da tabela `opportunities`: title, amount, close_date. Com `buildDealCustom`, close_date gera `DataFechamento`/`deal_close_date` por extenso, por exemplo "7 de maio de 2026".
   - Obrigatórios, que retornam 422 `missing_contact_fields` com `missing[]`: Nome, Email, Telefone, CPF, RG, Órgão Emissor, Nacionalidade, Endereço, Bairro, Cidade, Estado, CEP.
10. Esse passo é só de conferência. Nada é gravado no CRM. Para corrigir, o usuário edita o contato e prepara de novo.
11. Signatários (`resolveTemplateSignatories`, por modelo):
   - O papel do cliente vira o contato.
   - Papéis com `identity_source:"template"` usam a identidade fixa configurada no modelo, dentro da SuvSign. Esse é o caso do Kaik. Se estiver inválida, retorna 422 `invalid_template_signatory`.
   - Os demais papéis recebem nome/e-mail informados pelo usuário em `signers`. Se faltarem, retorna 422 `signers_required` com `unresolved[]`.
   - Signatários sem campo no modelo são ignorados.
   - `buildMultiDocument` deduplica pela identidade real entre os documentos. Daí vem o "assina 2 documentos" / "assina 1 documento": é derivado de quantos modelos têm aquele signatário.
   - O mesmo signatário com e-mails diferentes retorna 422 `participant_conflict`.
   - Placeholders sem valor retornam 422 `unresolved_template_variables`.

## E. Passo 3: prévia e envio
12. A prévia não é PDF nem URL. É JSON (`snapshot.documents[i].frozen_content.pages`) renderizado no navegador pelo `FrozenDocumentPreview`, com a geometria do modelo. Pode ser obtida de novo com SR `get_preview({request_id})`.
   - No mobile, é preciso portar o renderer ou usar WebView. [TODO] Decisão do app.
13. Fluxo de envio:
   - "Enviar N documentos" chama SR `send_for_signature({request_id})`.
   - O servidor confere `snapshot_sha256`, cria a operação na SuvSign com `Idempotency-Key` fixa e faz o envio.
   - Retorna `{request_id, status:"sent", provider_operation_id}`. Se a solicitação já tinha sido enviada, retorna `{already:true}`.
   - Não devolve link. Links individuais saem de SR `get_signing_link({request_id, participant_id})`, que retorna `{signing_url, expires_at}` e não grava nada.

## F. Acompanhamento
14. Atualização de status:
   - O webhook `suvsign-v2-webhook` (HMAC) atualiza `signature_requests` e os participantes, e cria `activities`.
   - O web não faz polling. Ele recarrega a capability ao abrir e depois de cada ação. Também pode chamar SR `get_signature_status`, que sincroniza com a SuvSign e devolve os dados atualizados.
   - Realtime não foi verificado. [INCERTO]
   - Para o app: chamar `get_signature_status` ao focar a tela, ou fazer polling curto enquanto o status for `sent`/`in_progress`.
15. "Baixar" chama SR `get_download_url({request_id, document_id})`. Retorna uma URL assinada da SuvSign (`{url, expires_in≈300}`). Antes da conclusão, retorna 409 `not_finalized`.
   - Além disso, em `document.completed` o webhook salva o PDF em `public.documents` com `external_source='suvsign_v2'` e faz dedupe por `external_ref`. Portanto ele aparece na aba Documentos existente e dispara o mesmo fluxo Nammux do V1.
16. Ações sobre uma solicitação:
   - `cancel_signature`: vale para qualquer status exceto completed, completing e cancelled. Cancela na SuvSign e cria activity.
   - `discard_draft`: só para draft nunca enviado. Apaga a solicitação sem chamar a SuvSign.
   - `get_signing_link`: copia o link.
   - Não existe "reenviar". Para isso, é preciso preparar uma solicitação nova.

## G. Permissões e erros
17. Pode enviar quem enxerga a oportunidade pela RLS (responsável ou view_all) e é membro ativo da org (`user_organizations`). Não há papel específico para isso.
   - Salvar ou testar credencial exige `can_manage_integrations_in_org`.
18. Erros, com código e mensagem vindos do servidor no corpo `{error, message}`:
   - Sessão e acesso: `unauthorized`, `not_found`.
   - Flag e credencial: `v2_disabled`, `not_configured`.
   - Modelo e dados: `template_required`, `template_unavailable` e os códigos da SuvSign, `contact_required`, `missing_contact_fields`.
   - Signatários e variáveis: `invalid_template_signatory`, `signers_required`, `unresolved_template_variables`, `participant_conflict`.
   - Envio: `signing_engine_v2_not_enabled`, `provider_error`.
   - Estado e rede: `invalid_state`, `not_finalized`, `participant_already_signed`, `rate_limited`, `provider_unavailable`.
   - Descarte: `not_discardable`, `discard_failed`.
   - O app deve exibir `message` diretamente.

## H. Restrição do mobile
19. Tudo é alcançável só com a sessão do usuário: SELECT com RLS nas duas tabelas e as ações de SR autenticadas pelo JWT. A API key e o secret da SuvSign ficam cifrados no servidor, e o app não precisa de nenhum segredo.

## Pontos em aberto
- [INCERTO] Lista completa dos códigos de `v2_unsupported_features`, limite de documentos da SuvSign e se as tabelas estão publicadas no Realtime.
- [INCERTO] Prazo para desligar o V1.
