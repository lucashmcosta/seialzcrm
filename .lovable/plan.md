# Auditoria somente de leitura: solicitações V2 "QA-LEGACY Procuração"

Nesta rodada nada é alterado: nenhum DELETE ou UPDATE, nenhuma migration, deploy ou mudança de código ou tela. Não chamo a SuvSign e não clico em "Continuar preparação".

## Já levantado (oportunidade 9a865dec…, Central 40ae935c…)
São 6 solicitações com o modelo QA-LEGACY (`2703fa4d…`):
- Rascunho, sem operação na SuvSign: `c8153191…`, `a2765bee…`, `a756a4ae…`
- Enviado, com operação: `3703fb67…` (op `65cac19c…`)
- Concluído, com operação: `d916df8f…` (op `8221349c…`) e `d5ce0615…` (op `79ee5366…`)

As solicitações reais (Contrato Unificado 2 e Procuração + Contrato Unificado) ficam fora do escopo e não serão mexidas.

## Passos (somente leitura)
1. Detalhar as 6 solicitações: idempotency_key, sha256, template dentro do snapshot, participantes e provider_documents. Procurar também "QA-LEGACY" dentro do snapshot de outras solicitações.
2. Levantar dependências de cada uma em `signature_request_participants`, `documents` (`external_source='suvsign_v2'` e `external_ref`), `activities` (`source_external_id` com o op_id), `integration_inbound_events`, jobs Nammux (`integration_jobs`) e arquivos no storage `attachments`.
3. Conferir no catálogo do banco as FKs que apontam para `signature_requests`, com as regras `ON DELETE`, e os triggers da tabela. O objetivo é descrever o que um DELETE direto causaria, sem executá-lo.
4. Ler a função `signature-requests` para saber se existe uma ação de descarte ou exclusão de rascunho (e sua validação, os estados aceitos e o tipo de exclusão) e como `cancel_signature` trata um rascunho.
5. Rastrear "Continuar preparação" no `SignatureV2Sheet`: se reaproveita o snapshot ou chama `prepare_contract` e busca o modelo de novo, em que ponto falha com o modelo desativado, qual mensagem o usuário vê e se sobra algum estado gravado pela metade.
6. Para a solicitação "Enviado" (`3703fb67…`): usar só os eventos já gravados no Seialz para classificar como C ou F (operação órfã na conta QA já desativada).

## Entrega
- Uma tabela por solicitação: Status na tela | Estado real | Operação | Efeitos permanentes | Classificação A–F | Pode descartar? | Ação recomendada.
- As 10 respostas objetivas pedidas.
- A menor intervenção proposta, só no relatório e sem implementar.
- Uma das três conclusões pedidas.
