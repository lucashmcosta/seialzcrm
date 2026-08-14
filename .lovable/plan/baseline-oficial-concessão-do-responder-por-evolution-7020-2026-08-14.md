# Baseline oficial + concessão do "Responder por" (Evolution 7020)

## Baseline documental (somente registro, nenhum dado alterado)

CENTRAL TRABALHISTA (`40ae935c-a7f7-4ad7-8ea4-91be6404a95f`)
- Meta ativo Comercial: **7067** — `bf04ce63-d310-4c16-a133-b373a40df340`
- Evolution 7020: `3ed219e0-b919-4a1f-b2f6-6806cfafe6f7` (provider `evolution_api`, vinculado à linha commercial, NÃO ativo)
- Meta histórico 7020: `407ff93d-4860-49cd-82ae-beda456c1774` (inativo, 19.398 mensagens / 1.436 threads preservadas)
- Atendimento: `c09bd713-0225-4533-afe8-20ac07bd3a7c` (7027)

VIAGI (`b246ef6f-6242-4011-a112-6d8783d2896a`)
- Meta 2890: `34d9ec9d-f084-41f4-aeb1-ea4de7b335e4`

Este baseline será gravado na memória do projeto para substituir o rótulo errado anterior.

## Único write proposto: 1 linha em `user_reply_endpoints`

Usuário piloto confirmado: **Junior Domingos** — `400ab2e2-5bfc-42fc-8c15-9e95ead6da6e` (njunior@centraltrabalhista.com.br, ativo na Central).

Estado atual das grants dele: já possui **Meta 7067** (`39ac1fe9-c03f-4f93-baf3-53ef560f6720`). Não possui grant do Evolution 7020 nem do Meta histórico 7020.

Ação: inserir **exatamente uma** linha:
- organization_id = Central
- user_id = Junior
- endpoint_id = `3ed219e0-b919-4a1f-b2f6-6806cfafe6f7` (Evolution 7020)
- granted_by_user_id = Junior (auto-concessão de piloto)

Guardas do insert: condicional (`WHERE NOT EXISTS`) para ser idempotente; nenhuma outra tabela tocada. Nada de `active_endpoint_id`, `messaging_lines`, `messaging_line_endpoints`, `messaging_line_rotations`, Meta 7067, Meta histórico 7020 ou Atendimento. Nenhum envio, nenhuma ativação.

## Auditoria imediatamente após a concessão

Relatório com os gates pedidos:
- JUNIOR_GRANT_META_7067
- JUNIOR_GRANT_EVOLUTION_7020
- JUNIOR_GRANT_META_HISTORICAL_7020 (deve ser NO)
- EVOLUTION_7020_AVAILABLE_FOR_MANUAL_REPLY
- META_7067_STILL_ACTIVE
- ACTIVE_ENDPOINT_CHANGED (NO)
- MESSAGING_LINE_ROTATIONS_NEW (0)
- ATENDIMENTO_CHANGED (NO)

Depois disso: **PARAR**.

## Pendência exclusivamente visual (identificada, não corrigida)

Card "Evolution WhatsApp" em Configurações > Integrações mostra o toggle cinza/desativado mesmo com instância Conectada + Vinculada + `open`.

Causa identificada (read-only):
- O `Switch` do card genérico em `src/components/settings/IntegrationsSettings.tsx` é ligado a `isConnected = !!connection?.is_enabled`, onde `connection` é a linha de `organization_integrations` daquela integração.
- A Central **não possui nenhuma linha** de `organization_integrations` para `evolution-whatsapp`. Logo `connection` é `undefined` e o toggle renderiza `checked=false` por ausência de registro — não por estado real.
- O estado real do Evolution vive em outras fontes: `evolution_instances` (`provisioning_status='linked'`, `last_known_state='open'`), `communication_endpoints` (endpoint `evolution_api` ativo) e a feature flag `evolution_api_enabled` (global ON).

Ou seja, o toggle representa "habilitação legada da integração por organização", e não "conexão/provisionamento do WhatsApp". São dois eixos distintos que hoje não se comunicam. Correção fica registrada como TODO visual de fase posterior (derivar o estado do card a partir de `evolution_instances`/endpoint, ou criar/refletir a linha de `organization_integrations` no provisionamento).

## Detalhes técnicos

- Write: `INSERT ... SELECT ... WHERE NOT EXISTS` em `public.user_reply_endpoints` (tabela de permissão usuário ↔ endpoint já usada pelo seletor "Responder por").
- Flag `sales_manual_reply_endpoint_v1`: já ON para Central e Viagi — não será alterada.
- Flag `conv_route_resolver_v2`: permanece somente Viagi — não será alterada.
- Auditoria via consultas de leitura em `user_reply_endpoints`, `messaging_lines`, `messaging_line_endpoints`, `messaging_line_rotations` e `communication_endpoints`.
