# Auditoria READ-ONLY — Seialz Web x SuvSign Signing Engine V2

Nada foi alterado. Fontes: código do repo e consultas somente de leitura ao banco. O que não pude comprovar está marcado NÃO CONFIRMADO.

## A. Fluxo atual de "Enviar contrato"
```text
OpportunityDetail.tsx:576
  -> SendToSignatureButton.tsx (aparece só se a org tem a integração suvsign ativa)
  -> navegador lê contacts + opportunities
  -> valida 12 campos obrigatórios (bloqueia se faltar algum)
  -> window.open(base_url/create-from-template?template_id&connector_id&data=<JSON>)
  -> SuvSign (tela pública dela gera o documento e colhe as assinaturas)
  -> POST suvsign-webhook (só document.completed)
  -> documents (external_source='suvsign') + Storage 'attachments' + activities
  -> outbox do Nammux (ADR-0010)
  -> UI (documentos do contato)
```
- Não existe backend no envio: o navegador monta a URL com os dados pessoais na query string.
- Só existe um ponto de uso: a página da oportunidade. Nenhum na página do contato.

## B. Autopreenchimento atual
Não existe merge no Seialz. Ele só envia um JSON, e a troca das variáveis acontece dentro da SuvSign (NÃO CONFIRMADO como ela faz).

| Chave enviada | Origem | Transformação |
|---|---|---|
| client.firstName / lastName | contacts.first_name/last_name, com full_name dividido por espaço como reserva | trim |
| client.email / phone | contacts.email / phone | trim |
| custom.contact_id | id do contato | — |
| custom.cpf, rg, rg_issuer, nationality | contacts | só entra se não estiver vazio |
| custom.address_street/neighborhood/city/state/zip | contacts | só entra se não estiver vazio |
| custom.deal_id / deal_title | opportunities.id / title | — |
| custom.deal_amount | opportunities.amount | String() |
| custom.deal_close_date | opportunities.close_date | data longa pt-BR |

O que não é enviado hoje: dados da organização, filial, responsável, campos customizados, produtos, honorários e forma de pagamento (nenhuma referência no código). Não há condicionais nem foreach, e o conteúdo não fica congelado no Seialz antes do envio.

## C. Integração SuvSign atual na UI
- Usa o fluxo genérico de integrações: `IntegrationsSettings.tsx`, `IntegrationConnectDialog.tsx` e `IntegrationDetailDialog.tsx`.
- Cadastro em `admin_integrations` (slug `suvsign`). No banco: 2 orgs conectadas, as 2 ativas. Campos em `config_values`: `base_url`, `template_id`, `connector_id`, `webhook_secret`.
- Conectar faz um upsert direto em `organization_integrations`, feito pelo navegador. Desconectar grava `is_enabled=false`.
- Não existe botão "Testar conexão" para a SuvSign.

## D. Multi-tenancy
- Tenant resolvido por `user_organizations`, `current_user_org_ids()` e RLS por `organization_id`. Documentação em `docs/audit/05-multi-tenancy.md`.
- Envio atual: o navegador lê os dados sob RLS, mas o próprio navegador é quem monta o pedido. Não há autoridade do servidor.
- Webhook: a org vem de `deal_id` (oportunidade), com checagem cruzada entre contato e org, mais o HMAC do connector daquela org.

## E. Modelo de dados atual
- `documents` tem `external_source` e `external_ref`, versionamento (`version`, `root_document_id`, `superseded_*`) e `content_hash`. Não tem status de assinatura, signatários nem `engine_version`.
- `activities` guarda a timeline (`activity_type='system'`).
- `integration_inbound_events` recebe um espelho (shadow) dos eventos SuvSign, com `handler_key='suvsign.v1'`.
- `integration_events` guarda o outbox (Nammux).
- No banco: 421 documentos SuvSign, o último em 24/09/2026.

## F. Webhook atual (`suvsign-webhook`)
- HMAC-SHA256 no header `x-webhook-signature`. O secret é por org: vem de `config_values.webhook_secret` do connector correspondente.
- Só trata `document.completed`; os outros eventos voltam como "skipped".
- Idempotência por (org, 'suvsign', id do documento no provedor), com proteção contra 23505.
- `file_url`: só https e só hosts permitidos (suvsign.com(.br), amazonaws.com e o Storage do próprio projeto).
- Grava o PDF assinado, registra a atividade e dispara o replay no Nammux.
- Flag `inbox_v2.ingest.suvsign` (global ON): liga só a gravação espelho. O fluxo legado roda sempre.

## G. Nova experiência (proposta)
Um painel lateral dentro da oportunidade, em 4 passos: documento/modelo, conferir os dados já preenchidos, signatários, preview. O envio passa pelo backend do Seialz e o operador não sai da tela. A partir daí o painel mostra: Enviado, Visualizado (só com evento real), Assinado por participante, Concluído, PDF, download e timeline. "Entregue" só aparece se houver confirmação real.

## H. Ponto central no backend
Uma edge function nova, `suvsign-v2`, com o mesmo contrato para Web e Mobile. Credencial e `organization_id` são resolvidos no servidor a partir do JWT (`_shared/auth.ts`). O webhook existente é estendido para rotear V1 ou V2. Nenhuma chave vai para o navegador.

## I / J. Contratos com o SuvSign V2
NÃO CONFIRMADO. Este repositório não tem a especificação da API V2: endpoints, autenticação, formato de campos e eventos. Não vou documentar nada de memória.

## K. Persistência: o que existe e o que falta
- Reaproveitado: `documents` para o PDF final (dedup atual), `activities` para a timeline, `integration_inbound_events` para os eventos.
- Falta, e o modelo atual não suporta:
  - estado da solicitação de assinatura (operação, status, id externo, snapshot/hash do conteúdo enviado);
  - estado por signatário.
- Proposta: uma tabela `signature_requests` e uma `signature_request_participants`, ambas com RLS por org. A decisão final depende da API V2.

## L. Coexistência V1/V2
- Mecanismo existente: `integration_feature_flags` + `fn_feature_flag_enabled`, com override por org (a ordem de precedência está NÃO CONFIRMADA).
- Proposta: uma flag nova `signing.suvsign_v2`, lida pelo backend, que devolve uma "capability" à UI. Um único ponto de decisão, sem `if v2` espalhado e sem o usuário escolher.
- Com a flag OFF, o botão atual continua idêntico.
- A regra da própria SuvSign (conta + source `seialz`) precisa bater com a flag. Fonte de verdade proposta: a flag do Seialz decide o envio; a SuvSign só recusa quando a conta não estiver habilitada.

## M. Configuração na tela de Integrações
Continuar no mesmo cadastro `suvsign`, com campos V2 (chave de API) guardados de forma criptografada através de uma edge function. Não gravar pelo navegador em `config_values`. Adicionar "Testar conexão".

## N. Segurança — gaps atuais
1. `webhook_secret` fica em texto puro em `config_values` e é gravado pelo navegador.
2. Dados pessoais (CPF/RG/endereço) viajam na URL da SuvSign pelo `window.open`.
3. O envio não passa pela validação do servidor.

## O. Arquivos envolvidos
`src/components/signature/SendToSignatureButton.tsx`, `src/pages/opportunities/OpportunityDetail.tsx`, `src/components/settings/Integration{sSettings,ConnectDialog,DetailDialog}.tsx`, `supabase/functions/suvsign-webhook/index.ts`, `_shared/feature-flags.ts`, `_shared/integration-credentials.ts`, `_shared/auth.ts`, `docs/decisions/0010-post-win-document-sync.md`.

## P. Gaps reais
- Especificação da API V2 ausente no repo.
- Sem merge, preview ou snapshot no Seialz.
- Sem estado de assinatura.
- Secret em texto puro.
- Webhook só trata `completed`.
- Sem teste de conexão.
- Dados de organização/responsável/produto/honorários não entram no contrato hoje.

## Q. Plano único de implementação (depois do desbloqueio)
1. Receber a especificação da API V2 e registrar em `docs/integrations/suvsign/`.
2. Migration com `signature_requests` + participantes (GRANT, RLS por org) e a flag `signing.suvsign_v2` OFF.
3. Guardar a credencial V2 criptografada (`integration-credentials.ts`) e criar "Testar conexão".
4. Edge function `suvsign-v2` com as ações: `prepare` (monta os dados do CRM no servidor, mesmo mapa da seção B), `preview`, `send` (congela o snapshot e o hash), `status`, `cancel`.
5. Webhook: roteia V2 por id externo e trata os eventos V2. O caminho V1 fica intacto.
6. Painel lateral na oportunidade, que aparece só com a capability ativa.
7. Docs, catálogo e ADR.

## R. Critérios de aceite
- Com a flag OFF, V1 fica idêntico.
- Nenhum `organization_id` vem do cliente.
- Preview igual ao documento assinado (mesmo hash).
- Nenhum dado redigitado.
- Webhook idempotente.
- PDF final nos documentos.
- Nenhum status "Entregue" sem evento real.

## S. Primeiro rollout
Uma org controlada, com a flag ligada só para ela, contato e oportunidade de teste. Roteiro: envio pela UI, assinatura em `/s/:token`, webhook, timeline e PDF. Rollback: desligar a flag.

## T. Decisão
`BLOQUEADO` — falta a especificação real da API V2 da SuvSign (itens I/J). Com ela em mãos, o plano acima está pronto para implementar.
