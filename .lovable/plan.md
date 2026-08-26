# Contrato da Ana Carolina — diagnóstico e correção mínima

## O que os dados mostram (verificado agora)

- Contato: Ana Carolina Lopes Rosa (`5788e56a…`), org Central (`40ae935c…`). Todos os campos obrigatórios do envio estão preenchidos (nome, email, telefone, CPF, RG, órgão emissor, nacionalidade, endereço completo, CEP). Ou seja, o botão "Enviar para Assinatura" não foi bloqueado por validação.
- Documentos dessa contato: 3 arquivos, todos com `external_source = NULL` (uploads manuais). Nenhum documento `suvsign`, isto é, nenhum callback de contrato assinado chegou para ela.
- O webhook do SuvSign está saudável no geral: 93 documentos `external_source='suvsign'`, o mais recente hoje 26/08 às 15:07, inclusive outros contratos da mesma org nas horas próximas (13:46, 13:55, 14:47, 15:00, 15:07).
- Não há nenhum registro em `integration_inbound_events` com slug `suvsign` — ou seja, nada foi rejeitado/enfileirado com erro do nosso lado; simplesmente não houve requisição para esse contrato.
- Divergência relevante de domínio: a integração da org tem `base_url = https://suprisign-doc.lovable.app`, mas a aba travada no print está em `suvsign.com/create-from-template?connector_id=b566143d…`. O `connector_id` é o mesmo da org, porém o host é outro.

## Conclusão

A falha ocorreu **dentro da página do SuvSign** (tela em branco com spinner infinito em `create-from-template`), antes de qualquer contrato existir. Nada no nosso CRM travou: nosso papel termina ao abrir a URL com o payload, e nenhum callback foi recebido nem recusado. Portanto isso precisa ser analisado pelo SuvSign — com dois pontos concretos para eles:

1. Por que `create-from-template` fica em loading infinito em vez de retornar erro (provável falha de carregamento/resolução do connector, sem timeout nem mensagem).
2. Se o `connector_id` `b566143d…` é válido no host `suvsign.com` ou apenas no deploy `suprisign-doc.lovable.app` — se o domínio do print não for o oficial, a nossa configuração precisa ser corrigida para o host correto (ou vice-versa).

## Correção mínima do nosso lado (opcional, a decidir)

Nada disso muda o comportamento do SuvSign, só evita que o usuário fique sem sinal:

1. Alinhar `base_url` da integração ao domínio oficial confirmado pelo SuvSign (mudança de configuração, sem código).
2. Em `src/components/signature/SendToSignatureButton.tsx`: registrar a tentativa de envio (log/atividade com contato, oportunidade e connector) para termos rastro de "enviei e não voltou", hoje inexistente.
3. Ainda no mesmo componente: `trim()` nos valores enviados (hoje `nationality` e `address_street` vão com espaço final) e aviso claro quando `base_url`/`connector_id` estiverem inconsistentes.

## Detalhes técnicos

- Fluxo atual: o botão monta `client` + `custom` e faz `window.open(`${base_url}/create-from-template?connector_id=…&data=…`)`. Não há chamada de API nossa ao SuvSign, logo não há como detectar o travamento pelo nosso lado hoje.
- O retorno é 100% assíncrono via `suvsign-webhook` → `documents` (`external_source='suvsign'`, `external_ref` = id do documento no provedor, idempotente por `(organization_id, external_source, external_ref)`).
