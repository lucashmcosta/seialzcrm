# Rollback da Central + piloto V2 só para o Junior

## 0. Rollback (primeiro, logo após aprovar)
- `update integration_feature_flags set enabled=false where flag_key='signing.suvsign_v2' and organization_id='40ae935c-a7f7-4ad7-8ea4-91be6404a95f'`.
- Verificar: global OFF, Central OFF e nenhuma org ON. `get_capability` volta a dar `v2_enabled=false`, e o botão "Enviar contrato" abre a V1 (até 60 s por causa do cache).
- A credencial V2, o webhook V2 e a regra `source=seialz` não mudam.

## 1. Liberação por usuário (mínima, reaproveitando a flag)
A tabela de flags não tem coluna de usuário, mas tem `metadata` (jsonb). Não é preciso mudar o schema.

- Na mesma linha da Central (que continua `enabled=false`), gravar `metadata = {"pilot_user_ids": ["400ab2e2-5bfc-42fc-8c15-9e95ead6da6e"]}` (Junior, `users.id`).
- Na edge `signature-requests`, criar um helper `v2AllowedFor(orgId, me.id)` que retorna true se:
  - a flag está ON para a org, como hoje; ou
  - `me.id` está em `metadata.pilot_user_ids` da linha dessa org.
- Usar esse helper nos 4 pontos que hoje chamam `featureFlagEnabled` para a V2: `get_capability`, `prepare_contract`, `get_preview`/envio e `send_for_signature`. O backend recusa com 409 `v2_disabled` qualquer outro usuário.
- O frontend não muda: `ContractSignatureEntry` já decide pelo `v2_enabled` que vem de `get_capability`. Para os outros usuários continua o mesmo botão V1, sem segundo botão.
- A função SQL `fn_feature_flag_enabled`, o webhook V2 e a V1 não mudam.

## 2. Remover depois do E2E
`update ... set metadata = metadata - 'pilot_user_ids'`: uma linha de SQL, sem deploy.

## Verificação
- Com o Junior, `get_capability` retorna true.
- Com outro usuário da Central, retorna false e `prepare_contract` dá 409.
- Global e org continuam OFF.
- Nenhuma operação é criada e nenhum documento é enviado.
