# SuvSign V2 — seleção dinâmica e multidocumento

Escopo: somente o painel V2 (piloto) e a Edge `signature-requests`. Não mudam: V1 e o botão V1, a SuvSign, o webhook V2, o Nammux, o renderer, as credenciais e as flags. Nenhuma operação real será criada ou enviada.

## Achados (lidos no código)
- **Hardcode: NÃO.** `SignatureV2Sheet` chama `list_templates`, que faz `GET /templates` na SuvSign e mostra o retorno. Não há template_id, nome ou ref fixo no painel nem na Edge. Só existe a seleção única (`templateId` string).
- `prepare_contract` recebe hoje só `template_id` e monta `documents: [d1]`. `send_for_signature` já envia `s.documents` inteiro em UMA operação, com `Idempotency-Key` fixa.
- O webhook V2 já grava um `documents` por `data.document_id` (dedupe por `external_ref`). `get_download_url` e a lista de concluídos já funcionam por documento. Com isso, a persistência separada dos PDFs não precisa de mudança.

## 1. Painel "Escolha os documentos" (multiseleção)
- Lista com checkbox, vinda só de `list_templates`. Templates com `v2_compatible=false` aparecem desabilitados, com o motivo (`v2_unsupported_features`).
- Sem limite artificial de quantidade.
- O preview abre em abas: "Documento 1 — <nome>", "Documento 2 — …", com um aviso claro de que é uma única solicitação.
- O botão mostra a quantidade: "Enviar N documentos para assinatura" (singular quando for 1).
- No acompanhamento: status geral, participantes com status e a lista de documentos da operação (título, status e baixar quando concluído).

## 2. `prepare_contract` com `template_ids: string[]`
- Aceita `template_ids` (1..N, sem duplicatas, cada id ≤100). `template_id` continua aceito como `[template_id]`, por compatibilidade.
- Busca o CRM e valida os campos obrigatórios uma vez só.
- Para cada template, em ordem:
  1. busca a `v2_definition`; qualquer 422/404 bloqueia tudo e informa qual template falhou;
  2. resolve os roles para participantes reais;
  3. preenche o `frozen_content`;
  4. bloqueia placeholders não resolvidos, informando o documento;
  5. filtra os `fields` oficiais.
- Participantes são unificados entre os documentos pela chave e-mail + ref. O cliente é sempre o mesmo participante, e cada field aponta para o `participant_ref` unificado.
- Snapshot `version: 2`, com `templates: [{id,name,layout_mode,coordinate_system}]`, `participants` e `documents: [{ref:"d1".."dN", title, template_id, frozen_content, fields}]`. O `snapshot_sha256` cobre o snapshot inteiro.
- Cria UMA `signature_request`. `template_id` guarda o primeiro template e `template_name` os nomes juntos ("A + B"); as colunas não mudam.
- `get_preview` e `send_for_signature` não mudam, porque já usam o snapshot inteiro. A atividade de envio passa a citar os N documentos.

## 3. Idempotência
- Clique duplo: o botão fica travado durante o envio, e o servidor mantém `status !== draft → already` e a `Idempotency-Key` fixa.
- Webhook: continua o dedupe atual (`external_ref` por documento e activity por `source_external_id`). Uma operação de 3 documentos gera exatamente 3 documentos locais.

## 4. Assinatura única (item 5 do pedido)
Pelo contrato V2 já publicado, a operação é multi-documento e o participante assina uma única vez. Nada muda na SuvSign. [INCERTO] vou citar o trecho do contrato no relatório; se não estiver explícito, marco como pendente de confirmação no E2E.

## 5. Testes (sem operação real)
- Testes Deno do agrupamento: 2 templates → 1 snapshot com 2 documentos, participantes unificados, hash estável, e um placeholder faltando bloqueia.
- Chamada real de `list_templates` na Central, só leitura, para contar os templates ativos na conta QA.
- Deploy de `signature-requests` e confirmação de build OK.
- Se houver só 1 template ativo: `MULTISELECT IMPLEMENTADO — E2E MULTIDOCUMENTO AGUARDA SEGUNDO TEMPLATE QA`.

## 6. Documentação
Atualizar `docs/integrations/suvsign-v2.md` (multidocumento, snapshot v2) e `roadmap.md`.

## Detalhes técnicos
- Arquivos: `supabase/functions/signature-requests/index.ts` (prepare_contract e texto da activity), `src/components/signature/SignatureV2Sheet.tsx`. Opcionalmente, um helper puro em `_shared/suvsign-v2.ts` para unificar participantes e montar documentos, com teste.
- Sem migration: `snapshot` é jsonb e `provider_documents` já é uma lista.
- Relatório final no formato pedido (hardcode, listagem, multiselect, prepare, snapshot, operação única, acompanhamento, PDFs separados, nº de templates, build/deploy).
