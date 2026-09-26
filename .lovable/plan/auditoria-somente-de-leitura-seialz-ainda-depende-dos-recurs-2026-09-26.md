# Auditoria somente de leitura: Seialz ainda depende dos recursos QA da SuvSign?

Nesta rodada nada é alterado: nenhuma edição, deploy, secret, credencial ou operação.

## Já verificado no código
- Origem da chave: `loadV2Credentials(admin, orgId)` lê somente `suvsign_v2_credentials` da organização dona e decifra `api_key_ciphertext`. Não existe fallback por variável de ambiente, chave global ou chave de outra organização. A base usa `base_url` do registro ou `DEFAULT_V2_BASE`.
- O Web nunca recebe a chave: todas as chamadas passam por `signature-requests`, e o navegador só vê a máscara.
- A busca no repositório por `a9819596`, `ef22a0d3`, `2ec1f238`, `Seialz E2E QA` e `QA Webhook Pilot` não encontrou nenhuma ocorrência. A única menção a `49cfac40` e `6cc4fc44` é o texto do pedido.
- O V1 não usa `suvsign_v2_credentials` nem flags V2. Ele ignora eventos com `engine:"v2"`.

## Passos restantes (somente leitura)
1. Ler no banco a credencial V2 da Central (org `40ae935c…`): `api_key_last4`, `base_url`, se existe webhook secret, `updated_at` e dados do último teste. Nenhum valor secreto é lido.
2. Confirmar se `last4` deixou de ser `…6016` (chave antiga de conta não confirmada) e se `updated_at` é posterior à troca da chave `Seialz Central V2`.
3. Conferir se existem outras linhas em `suvsign_v2_credentials` e se alguma organização ainda usa `…6016`.
4. Ver as solicitações V2 mais recentes da Central, incluindo `provider_operation_id`, status e datas. Uma operação enviada depois da troca é evidência de uso real com a chave nova.
5. Conferir `integration_feature_flags` `signing.%`, confirmando que o piloto continua ON só na Central.
6. Procurar na lista de secrets das funções qualquer nome com SUVSIGN, QA ou V2. Só os nomes são lidos.
7. Reler a configuração V1 da Central em `organization_integrations` (sem secrets) e confirmar que ela não aponta para a conta QA.

## Limite conhecido
O Seialz não guarda `account_id` nem o ID da chave na SuvSign. A prova de que a chave é a `6cc4fc44…` será feita pelos últimos 4 dígitos comparados com a SuvSign, pela data da troca e pelo uso real após a troca. Se `last4` continuar `…6016`, o resultado será BLOQUEADO.

## Resultado
Responder aos 10 itens e terminar com CONFIRMADO ou BLOQUEADO, indicando a dependência exata quando houver.
