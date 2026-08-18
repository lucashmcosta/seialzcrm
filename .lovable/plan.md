# Card "Evolution WhatsApp": badge de estado real (sem toggle enganoso)

## Auditoria read-only (confirmada)

1. **Origem do `checked`**: `src/components/settings/IntegrationsSettings.tsx` — o card Evolution cai no card genérico (linha ~531). O toggle usa `checked={isConnected}` e `isConnected = !!connection?.is_enabled` (linha 506), onde `connection` vem de `organization_integrations`.
2. **Depende de `organization_integrations.is_enabled`?** Sim, exclusivamente.
3. **Estado real da Evolution** não é lido por esse card. As fontes reais são `evolution_instances.provisioning_status` + `evolution_instances.last_known_state` (hoje há 1 instância: `linked` / `open`, com `endpoint_id` vinculado). Endpoint `evolution_api` e vínculo com a Route Comercial existem, mas são configuração de roteamento, não estado da integração.
4. **O toggle faz algo real?** É o toggle genérico: apenas `UPDATE organization_integrations SET is_enabled` (`toggleMutation`, linha ~177). Não conecta, não desconecta instância, não afeta webhook/envio. Ou seja: enganoso.

## Mudança proposta (somente apresentação)

Um branch dedicado no card Evolution (`integration.slug === 'evolution-whatsapp'`), reaproveitando o layout do card genérico:

- **Sem `Switch`** nesse card.
- **Badge derivado das instâncias da organização** (via hook `useEvolutionInstances`, já existente e filtrado por RLS + filtro em memória por `organization.id`):
  - alguma instância `provisioning_status='linked'` e `last_known_state='open'` -> `Conectado` (verde)
  - alguma instância pendente/aguardando QR -> `Aguardando conexão` (âmbar/outline)
  - existem instâncias mas nenhuma `open` -> `Desconectado` (secondary)
  - nenhuma instância -> `Não configurado` (outline)
- **CTA mantido**: `Ver integração`, abrindo o `EvolutionWhatsAppDialog` atual (instâncias, QR, webhook, health check, delete) — sem alteração.

## Detalhes técnicos

- Arquivo alterado: `src/components/settings/IntegrationsSettings.tsx`.
- Novo componente de apresentação: `src/components/integrations/evolution-whatsapp/EvolutionIntegrationCard.tsx` (recebe `integration` e `onOpen`; consome `useEvolutionInstances` + `useOrganization`).
- Nenhuma escrita em `organization_integrations`, nenhuma chamada a Edge Function, nenhum toque em backend, endpoints, Route Comercial, flags ou outras integrações.
- Estados de carregamento: enquanto a query resolve, badge neutro (`Verificando…`) para não piscar "Não configurado".

## Validação

- Central (instância 7020 `linked`/`open`) -> `Conectado`.
- Organização sem instância -> `Não configurado`.
- Instância aguardando QR -> `Aguardando conexão`.
- Demais cards (Meta, Kommo, IA, Nammux, SuvSign, telefonia) intactos.
- `tsgo` limpo.
