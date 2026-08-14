# Liberar o card Evolution para a Central Trabalhista (flag only)

Objetivo: habilitar `evolution_api_enabled` apenas para a Central Trabalhista, sem tocar em rota, endpoints, rotações ou Atendimento, e parar no QR para você escanear.

## Estado atual confirmado (read-only, agora)

- `public.feature_flags` (`evolution_api_enabled`): `is_enabled = true`, `organization_ids = {b246ef6f…}` (Viagi) — Central ausente.
- `public.integration_feature_flags` (`evolution_api_enabled`): linha Viagi `enabled = true`; linha GLOBAL `enabled = false`; **não existe linha para a Central**.
- Central Trabalhista (`40ae935c…`): Route Comercial ativa em `+55 11 5028-7067` (Meta Cloud), Atendimento em `+55 11 5028-7027` (Meta Cloud), `0` instâncias Evolution.
- Viagi (`b246ef6f…`): 1 instância Evolution, linhas inalteradas.

Conclusão: a única mudança necessária é de flag; nenhuma migração de schema e nenhum write em endpoints.

## O que será alterado

1. `feature_flags.organization_ids`: adicionar `40ae935c…` (Central) ao array existente, preservando `b246ef6f…` (Viagi) e sem tocar em nenhuma outra org.
2. `integration_feature_flags`: inserir uma linha nova `('evolution_api_enabled', 40ae935c…, true)`. A linha da Viagi e a GLOBAL (`false`) ficam intactas — nenhuma outra org é liberada.

Nada além dessas duas linhas de flag é escrito. Explicitamente **não** serão tocados: `active_endpoint_id`, `messaging_lines`, `messaging_line_rotations`, endpoints Meta/Twilio, webhooks Meta, Route Comercial e Atendimento.

## Validação imediatamente após a ativação (read-only)

Um único bloco de checagem devolve, para você conferir antes do QR:

- CENTRAL_EVOLUTION_FLAG (esperado ON nas duas tabelas)
- VIAGI_EVOLUTION_FLAG (esperado PRESERVED)
- OTHER_ORGS_FLAGGED (esperado 0 além de Central + Viagi)
- META_ACTIVE_ENDPOINT (esperado 7067)
- ACTIVE_ENDPOINT_CHANGED (esperado NO)
- MESSAGING_LINE_ROTATIONS_NEW (esperado 0)
- ATENDIMENTO_CHANGED (esperado NO)
- READY_FOR_QR

Se qualquer condição divergir, eu paro e reporto — sem correção automática.

## Depois: fluxo real que você executa na UI

1. Configurações › Integrações › Evolution WhatsApp.
2. "Adicionar número" → instância criada automaticamente (nome técnico server-side, webhook configurado) e QR exibido.
3. Você escaneia; eu confirmo sessão conectada e leio `owner_jid` / `owner_number_digits`.
4. Vinculação do endpoint Evolution ao WhatsApp Comercial **sem** torná-lo ativo (`provision_sales_endpoint` cria o vínculo inativo).
5. Reconfirmação de que `active_endpoint_id` da Route Comercial segue no Meta 7067 e `MESSAGING_LINE_ROTATIONS_NEW = 0`.

Eu paro após o passo 2 e aguardo você escanear.
