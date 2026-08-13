# Modal "Detalhes da rota" — modo legado não deve mostrar "Sem rota"

Correção exclusivamente de apresentação no painel/modal. Nenhuma mudança em resolver, webhooks, banco ou feature flag.

## Situação atual (verificada no código)

- `SalesRoutePanel.tsx` linha 102: o título do card usa `route.line?.name ?? route.line?.route_slug ?? 'Sem rota'`. Com o resolver desligado (`reason = 'flag_off'`), `route.line` é sempre `null`, então o card exibe "Sem rota" mesmo quando existe inbound roteável e histórico de endpoint.
- Linha 106: o endpoint exibido é apenas `route.activeEndpoint`, também `null` em modo legado — mostra "—".
- Linha 154: a linha "Status do endpoint" imprime "Sem rota" apenas para `unresolved`; em `unknown` já mostra "—" (correto).
- Já existem duas fontes de endpoint efetivo disponíveis no painel, independentes do resolver: `route.discoveredByEndpoint` (última inbound roteável) e `history` (de `messages.endpoint_id`).

## O que muda

No painel (usado também pelo modal), introduzir a noção de **endpoint efetivo** com esta precedência:

1. `route.activeEndpoint` (quando o resolver está ativo e resolveu)
2. `route.discoveredByEndpoint` (última inbound roteável)
3. último item de `history` (endpoint mais recente usado na thread)

Aplicações:

- **Título do card**: usar `route.line?.name ?? route.line?.route_slug`; se ausente e existir endpoint efetivo, mostrar "Modo legado" (rótulo `resolverLabelPublic`) em vez de "Sem rota". "Sem rota" fica reservado para o caso em que não há linha, não há endpoint efetivo e não há inbound roteável.
- **Número do card / linha "Endpoint ativo"**: mostrar o endereço do endpoint efetivo (ex.: 7067) em vez de "—". Quando o valor vier do caminho legado (itens 2 ou 3), acrescentar a indicação de origem legada no texto de apoio.
- **Chip de provider**: usar o provider do endpoint efetivo (ex.: Meta).
- **Status do endpoint**: manter o contrato atual — "Sem rota" só quando `endpointState === 'unresolved'`; em modo legado permanece "—" com "Roteamento: Modo legado".
- **Linha "Última inbound roteável"**: sem alteração de lógica.

Nada muda quando o resolver V2 está ligado e resolve: o comportamento hoje já correto é preservado.

## Detalhes técnicos

- Arquivo: `src/components/messages/route/SalesRoutePanel.tsx` — expor `effectiveEndpoint` e `effectiveEndpointSource` (`resolver | inbound | history | none`) em `useSalesRouteView` e consumi-los no `SalesRoutePanel`.
- `src/components/messages/route/SalesRouteDetailsDialog.tsx` continua consumindo `useSalesRouteView`; nenhuma query nova.
- `RouteIndicators.tsx` inalterado (o rótulo "Sem rota" do chip continua ligado a `unresolved`).
- Verificação: typecheck e conferência visual do modal em uma thread de organização com a flag OFF que tenha inbound recente.
