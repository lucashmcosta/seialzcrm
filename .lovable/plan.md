# Fase 2.5.1 — Refinamento visual da UI Comercial (UX only)

Somente frontend/apresentação. Nenhuma alteração em SQL, Supabase, Edge Functions, triggers, feature flags, resolver, queries ou hooks de dados. Nenhum componente de Atendimento (`EndpointBadge`, `InboxThreadList`, `src/components/inbox/*`, `src/components/mobile/MobileInbox.tsx`) será tocado.

## 1. Cabeçalho da conversa (3 linhas, sem duplicidade)

Reescrever o bloco de cabeçalho em `src/pages/messages/MessagesList.tsx` (hoje entre as linhas ~1851 e 1926), onde a Route aparece duas vezes: uma no `RouteBadge` e outra na linha textual "Route · número · provider".

Nova estrutura:

```text
Linha 1  [avatar] Nome do contato (semibold, maior)   • Status   [ⓘ Detalhes da rota] [Ações]
Linha 2  telefone · Responsável: Nome
Linha 3  [Comercial] [Meta|Evolution|Twilio] [8439] [● Online|Offline]  [janela 24h]
```

- A linha textual redundante e o `EndpointStatusChip` solto são removidos; provider, número e status de endpoint passam a existir só nos badges da Linha 3.
- Nome do contato ganha `text-[15px]`/`font-semibold`; número usa `font-data text-[10px]` em badge neutro — nunca com mais peso visual que o nome.
- O trilho "Histórico de endpoints utilizados" sai do cabeçalho e permanece apenas no painel/modal de detalhes.

`RouteBadge` em `src/components/messages/route/RouteIndicators.tsx` ganha variantes de composição para não repetir informação:
- `variant="compact"` (somente lista): `Evolution • 8439` / `Meta • 2890`. Sem siglas tipo `[E]`/`[M]`.
- `variant="split"` (somente cabeçalho): badges separados — Comercial, Provider, Número, Online/Offline.

## 2. Linguagem do resolver

- Tela principal: nunca "Route Resolver V2". Exibe "Rota Comercial" quando a flag está ON e "Modo legado" quando OFF.
- O termo técnico `Route Resolver V2` / `conv_route_resolver_v2` fica restrito a `SalesRoutePanel` e `SalesRouteDetailsDialog`.
- Ajuste em `useSalesRouteView` (`SalesRoutePanel.tsx`): expor dois rótulos — `resolverLabelPublic` ("Rota Comercial"/"Modo legado") e `resolverLabel` (técnico, usado no painel/modal). Nenhuma query alterada.


## 3. Botão "Detalhes da rota"

O link `Detalhes` de 10px vira botão real (`Button variant="outline" size="sm"` com ícone de informação), posicionado na Linha 1 ao lado de Ações. Continua abrindo o `SalesRouteDetailsDialog` existente.

## 4. Estado sem Route

- Substituir "Sem Route" isolado por `⚠ Sem rota disponível` em tom de alerta (âmbar).
- Tooltip fixo: "Esta conversa ainda não possui uma mensagem inbound roteável."
- Aplicado em `RouteBadge` (estado `no_route`) e no rótulo de Route do cabeçalho. No painel técnico o estado bruto do resolver continua visível.

## 5. Badge da lista de conversas

Em `ChatListItem` (`MessagesList.tsx` ~236), trocar o badge longo por `RouteBadge variant="compact"`: `Evolution • 8439` / `Meta • 2890`, com `title` completo no hover. Sem rota: apenas ícone de alerta discreto com tooltip explicativo, sem texto.

## 6. Rodapé / composer

Substituir a frase "Sem inbound recente — envio livre pelo número ••••8439" por avisos com hierarquia clara (`MessagesList.tsx` ~2427), sem linguagem técnica como "24h fechada":

- Janela fechada: `⚠ Sem inbound recente` + linha secundária "Somente template disponível".
- Sem rota (`no_route`): `⚠ Sem rota disponível` + "Responder somente após nova mensagem do cliente."

Apenas texto/estilo — a lógica de gate (`outOfWindow`, `composerBypassesWindow`) permanece exatamente como está.


## 7. Hierarquia visual

Ordem de peso: Cliente > Responsável > Status > Provider > Número. Aplicado via tamanho/peso/cor: nome em `foreground` semibold, responsável e telefone em `muted-foreground`, badges técnicos em `text-[10px]` com fundo neutro.

## 8. Painel lateral / modal

`SalesRoutePanel` mantém todos os campos técnicos atuais (Thread ID, Route, Linha, Provider, Endpoint ativo, Histórico, Última inbound roteável, Resolver, Feature flag, Business Context, Status, Assignee, Canal, Motivo) e recebe o trilho de histórico removido do cabeçalho.

## 9. Timeline — divisor "Número alterado"

Trocar o chip de uma linha por um divisor com réguas laterais e bloco central em duas linhas:

```text
──────────  Número alterado  ──────────
        2890  ↓  8439
        13/08 09:42
```

A data/hora vem do `sent_at` da própria mensagem que inaugura o novo endpoint (já disponível no item da timeline) — sem nova consulta.

## 10. Separação Comercial × Atendimento

Confirmação por inspeção: `EndpointBadge` é usado apenas por `src/components/inbox/InboxThreadList.tsx` e telas de Atendimento; `RouteBadge` apenas pelo Comercial (`MessagesList.tsx` + `route/*`). Nada de Atendimento será editado.

## 11. Validação

- `tsgo --noEmit` (typecheck), lint e build.
- Screenshots via Playwright no preview autenticado: lista Comercial, conversa aberta, modal Detalhes da rota, painel de detalhes e Configurações > Integrações > WhatsApp Comercial. Se a sessão não estiver injetada, informo e entrego as telas acessíveis.

## Arquivos que serão alterados

- `src/pages/messages/MessagesList.tsx` (cabeçalho, item da lista, rodapé, divisor da timeline)
- `src/components/messages/route/RouteIndicators.tsx` (variantes do `RouteBadge`, estado sem rota, tooltip)
- `src/components/messages/route/SalesConversationHeader.tsx` (mesma reorganização em 3 linhas)
- `src/components/messages/route/SalesRoutePanel.tsx` (rótulo público vs técnico, histórico)
- `src/components/messages/route/SalesRouteDetailsDialog.tsx` (mantém termos técnicos)

Nenhum arquivo em `supabase/`, `src/hooks/messages/*` (lógica de dados), `src/components/inbox/*` ou mobile de Atendimento será modificado.
