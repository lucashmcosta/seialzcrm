# Auditoria pós-QR da instância Evolution (Central) — read-only

## Estado observado

Instância da Central (`evo-40ae935c-628b2eab`, org `40ae935c…`):

```text
provisioning_status = pending
endpoint_id         = NULL
last_known_state    = open           (conectado)
owner_jid           = NULL
owner_number_digits = NULL
last_state_checked_at = 2026-08-14 17:20:00Z
```

Referência (Viagi, `dev-int`): `linked`, `owner_jid` e `owner_number_digits` preenchidos — mostra como o registro fica quando o fluxo completa.

Observações por item:

1. Registro existe, conforme acima.
2. Webhook: `createInstance` só persiste a instância se `webhookSet` retornar sucesso (caso contrário faz rollback total e apaga a linha). Como a linha existe, o webhook foi configurado. Não há coluna `webhook_configured_at` na tabela — esse campo nunca existiu.
3. Webhook chegou: `last_qr_expires_at` (gravado só por `QRCODE_UPDATED`) e a transição `connecting → open` com `last_state_checked_at` atualizado são escritas exclusivas de `evolution-webhook`. Não há tabela de log de eventos Evolution, então a evidência é essa (indireta, mas exclusiva desse caminho).
4. `refreshEvolutionIdentity` NÃO foi executado. Nenhuma tela chama esse op para instâncias `pending`: o card Evolution (`EvolutionProvisionPanel`) só chama `listInstances`, que é leitura pura da tabela e não consulta o provedor. `instanceState`/`refreshEvolutionIdentity` só são acionados pelo diálogo de conexão do WhatsApp Comercial, que exige um `endpointId` já existente.
5. `provision_sales_endpoint` NÃO foi chamado. O op `provisionEndpoint` exige `lineId` + `address` digitados no formulário do WhatsApp Comercial; ninguém o disparou.
6. Não há erro de validação registrado — o pipeline não chegou à validação. Se fosse tentado agora, a RPC falharia porque `owner_number_digits` está NULL (identidade nunca lida do provedor).
7. Nenhum `communication_endpoint` com provider `evolution_api` para a Central (total no banco: 1, pertencente à Viagi).
8. A UI não está desatualizada — ela reflete o banco corretamente ("Em provisionamento" / "Aguardando QR" por falta de identidade). O endpoint realmente não foi criado.

## Resumo

```text
INSTANCE_CREATED=YES
INSTANCE_CONNECTED=YES
WEBHOOK_RECEIVED=YES
IDENTITY_REFRESHED=NO
PROVISION_ENDPOINT_CALLED=NO
COMMUNICATION_ENDPOINT_CREATED=NO
UI_REFRESH_BUG=NO
```

Onde parou: logo após a conexão (estado `open`), na etapa 4 — leitura da identidade real no provedor. Sem `owner_jid`/`owner_number_digits`, o número real permanece desconhecido, então nada chama `provision_sales_endpoint` e nenhum endpoint é criado. É uma lacuna de fluxo (nenhum gatilho de identidade para instâncias `pending`), não uma falha de webhook nem de UI.

## Correção aprovada — dois ops explícitos (sem persistência silenciosa)

`listInstances` permanece LEITURA PURA (nada de chamada ao provedor nem escrita).

Backend (`sales-route-operations`), sem DDL:

1. Novo op `syncPendingInstanceIdentity`
   - Exige JWT + `can_manage_integrations_in_org`.
   - Valida que a instância pertence à org do chamador.
   - Valida `provisioning_status='pending'` e `last_known_state='open'` (senão 409).
   - Chama `syncEvolutionIdentity` e persiste apenas `owner_jid` / `owner_number_digits`.
   - Não toca endpoint, Route, `active_endpoint_id` nem rotação.

2. Novo op `linkPendingInstance`
   - Recebe apenas `instanceId` (nenhum número vindo do frontend).
   - Usa exclusivamente `owner_number_digits` já persistido a partir da Evolution.
   - Localiza a Route Comercial da mesma org; chama `provision_sales_endpoint`.
   - Cria/localiza o `communication_endpoint` Evolution e o vínculo com a Route.
   - Marca `provisioning_status='linked'`.
   - Não altera `active_endpoint_id`, não cria `messaging_line_rotations`, não toca Meta/Twilio/Atendimento.

Frontend (`EvolutionProvisionPanel`), somente apresentação:

- `pending` + `open` sem identidade: exibir "Finalizando conexão…" e chamar `syncPendingInstanceIdentity`.
- Com identidade: exibir o número real.
- Botão "Vincular ao WhatsApp Comercial" → `linkPendingInstance`; após sucesso, estado "Vinculado".
- Nunca tornar ativo automaticamente; sem formulário de endereço manual.

Pós-condições a validar e reportar após o deploy:

```text
INSTANCE_CONNECTED=YES
OWNER_JID_PRESENT=YES
OWNER_NUMBER_DIGITS_PRESENT=YES
EVOLUTION_ENDPOINT_CREATED=YES
EVOLUTION_ENDPOINT_LINKED_TO_COMMERCIAL=YES
EVOLUTION_ENDPOINT_ACTIVE_FOR_SEND=NO
META_EXISTING_ENDPOINTS_TOUCHED=NO
ACTIVE_ENDPOINT_CHANGED=NO
MESSAGING_LINE_ROTATIONS_NEW=0
ATENDIMENTO_CHANGED=NO
```

