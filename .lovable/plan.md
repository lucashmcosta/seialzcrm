# Auditoria read-only: prontidão da Central Trabalhista para o E2E V2

Nenhuma alteração. Nenhuma operação criada. Nenhum documento enviado.

## Já confirmado (consultas feitas agora)
- Flags: `signing.suvsign_v2` global OFF e da Central OFF. `signing.suvsign_v2_pilot` da Central ON.
- Credencial V2 da Central: existe, com chave final `6016`, webhook secret salvo e base `vpysvlbfsvomwrgbpybc…/functions/v1`. Foi atualizada em 24/09 às 21:14 UTC.
- V1 da Central: integração SuvSign habilitada. A configuração tem base_url, template_id, connector_id e webhook_secret e não mudou desde 13/03.
- Solicitações V2 da Central: 3 rascunhos, 1 enviada, 2 concluídas. Todas vêm dos testes QA.
- Código: `ContractSignatureEntry` mostra o botão V1 (`SendToSignatureButton`) sempre que `v2_enabled=false`. O botão V2 do piloto só abre o `SignatureV2Sheet`, que chama `signature-requests`, e fica ao lado do V1, sem substituí-lo.

## Falta verificar (só leitura, após aprovação)
1. Reler `SendToSignatureButton.tsx` e `suvsign-webhook` e confirmar que não dependem de nada da V2.
2. Chamar `test_connection` e `list_templates` do `signature-requests` com uma sessão de usuário da Central. Esse passo só lê dados. Serve para ver:
   - se a conexão está OK;
   - quantos templates existem, com id, nome, se estão ativos, `v2_compatible` e `v2_unsupported_features`, exatamente como a SuvSign devolve.
3. Descobrir o `account_id` da SuvSign que corresponde à chave `…6016`, se a listagem ou a resposta da API trouxer esse dado. O Seialz não guarda o account_id.
4. Regra LIVE `source=seialz`/`v2` e o cadastro do webhook V2 na SuvSign: o Seialz não tem acesso de leitura a essas configurações. Vou informá-las como "confirmar no painel da SuvSign", sem supor nada.

## Resultado
Um relatório com os 13 itens e o veredito `CENTRAL TRABALHISTA — PRONTA / NÃO PRONTA PARA E2E V2 SEM IMPACTAR V1`.

Ponto de atenção: a chave `…6016` foi salva durante os testes QA. Pode ser que ela seja da conta QA, e não da conta real da Central. O passo 3 existe para esclarecer isso.
