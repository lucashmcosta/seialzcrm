# Piloto V2: preservar o botão V1 e criar o botão "Enviar contrato V2 (Piloto)"

## 1. Rollback (primeiro)
- Na migration: `update integration_feature_flags set enabled=false where flag_key='signing.suvsign_v2' and organization_id='40ae935c-a7f7-4ad7-8ea4-91be6404a95f'`.
- Resultado: global OFF, Central OFF e nenhuma org ON. O botão "Enviar contrato" volta à V1, porque `ContractSignatureEntry` mostra o `SendToSignatureButton` quando `v2_enabled=false`.
- Credencial V2, webhook V2, regra `source=seialz`, template QA, Nammux e V1 não mudam.

## 2. Problema a resolver
Com a flag OFF, o backend (`list_templates`, `prepare_contract`, `send_for_signature`) responde 409 `v2_disabled`. Um botão V2 que só existisse na tela abriria o painel, mas não conseguiria enviar nada. Se o botão V2 usasse a flag atual, a Central inteira voltaria para a V2 (o erro de agora há pouco).

## 3. Solução mínima: flag separada só para o piloto
- Nova linha em `integration_feature_flags`: `flag_key='signing.suvsign_v2_pilot'`, `organization_id=Central`, `enabled=true`. Não precisa mudar o schema.
- Edge `signature-requests`:
  - `get_capability` passa a devolver também `pilot_enabled`;
  - o gate de envio (`list_templates`, `prepare_contract`, `send_for_signature`) aceita `suvsign_v2 OR suvsign_v2_pilot`. `v2_enabled` continua lendo só `suvsign_v2`.
- `ContractSignatureEntry`: a lógica do botão V1 fica igual. Um segundo botão "Enviar contrato V2 (Piloto)" aparece ao lado quando `pilot_enabled`, abrindo o `SignatureV2Sheet` já existente com `canCreate`.
- Resultado na Central: todos continuam com o botão V1 intacto e veem ao lado o botão V2 do piloto. Nas outras orgs nada muda.

## 4. Remover depois do E2E
`enabled=false` na linha `signing.suvsign_v2_pilot`: o botão V2 some e o backend bloqueia. Sem deploy.

## Verificação
- Flags: global OFF, Central `suvsign_v2` OFF, pilot ON só na Central.
- Build OK.
- Nenhuma operação criada e nenhum documento enviado.
