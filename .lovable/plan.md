# Fase 2.5.1 — Refinamento visual da UI Comercial (UX only)

Somente frontend/apresentação. Nenhuma alteração em SQL, Supabase, Edge Functions, triggers, feature flags, resolver, queries, hooks de dados, Atendimento, Mobile ou lógica de negócio. Nenhuma mudança de comportamento.

## 1. Cabeçalho da conversa (3 linhas, zero duplicidade)

Substituir o bloco de cabeçalho atual em `src/pages/messages/MessagesList.tsx` (~linhas 1851–1926), onde Route, provider, número e status de endpoint aparecem duas vezes (badge + linha textual).

```text
Linha 1  [avatar]  Nome do contato (semibold, maior)   Status   [ⓘ Detalhes da rota]  [Ações]
Linha 2  telefone  •  Responsável
Linha 3  [Comercial]  [8439]  [● Online|Offline]  [Janela 24h]
```

- Removidos: a linha textual "Route · número · provider", o `EndpointStatusChip` solto e o bloco "Histórico de endpoints utilizados" (que passa para o painel/modal).
- Provider deixa de aparecer no cabeçalho: fica só no painel/modal técnico.
- Nome do contato é o elemento de maior destaque (`text-[15px] font-semibold text-foreground`).

## 2. RouteBadge — duas variantes

Em `src/components/messages/route/RouteIndicators.tsx`:

- `variant="compact"` (somente lista lateral): apenas ícone de telefone + últimos 4 dígitos (`📱 8439`). Provider apenas no `title`/tooltip. Sem siglas `[E]`/`[M]`/`[T]` e sem texto longo.
- `variant="split"` (somente cabeçalho): badges separados — `Comercial`, `8439`, `Online`/`Offline`.

## 3. Linguagem do resolver

- UI pública: "Rota Comercial" (flag ON) / "Modo legado" (flag OFF). Nunca "Route Resolver V2" nem `conv_route_resolver_v2`.
- Termos técnicos ficam restritos a `SalesRoutePanel` e `SalesRouteDetailsDialog`.
- `useSalesRouteView` (`SalesRoutePanel.tsx`) passa a expor `resolverLabelPublic` (público) e `resolverLabel` (técnico). Nenhuma query alterada.

## 4. Botão "Detalhes da rota"

O link `Detalhes` de 10px vira `Button variant="outline" size="sm"` com ícone ⓘ e texto "Detalhes da rota", na Linha 1 ao lado de Ações. Abre o mesmo `SalesRouteDetailsDialog`.

## 5. Estado sem rota

- Nunca "Sem Route" isolado. Passa a: `⚠ Conversa legada` + linha secundária "Sem inbound para determinar o número de resposta." em tom âmbar.
- Tooltip: "Esta conversa ainda não possui uma mensagem inbound roteável."
- No painel técnico o estado bruto do resolver (`REPLY_ROUTE_UNRESOLVED`, etc.) continua visível.

## 6. Badge da lista

Em `ChatListItem` (`MessagesList.tsx` ~236): `RouteBadge variant="compact"` → `📱 8439`, sem provider no texto. Sem rota: apenas ícone de alerta discreto com tooltip. Lista fica visualmente limpa.

## 7. Composer

Novo componente `SalesComposerStatus` renderizado acima do input (substitui o texto em `MessagesList.tsx` ~2427):

- Janela fechada: `⚠ Sem inbound recente` + "Somente template disponível."
- Sem rota: `⚠ Conversa legada` + "Responder somente após nova mensagem do cliente."

Sem linguagem técnica ("24h fechada", "Sem Route", "REPLY_ROUTE_UNRESOLVED"). A lógica de gate (`outOfWindow`, `composerBypassesWindow`, `serviceWindow`) permanece intacta; só o texto/estilo muda.

## 8. Hierarquia visual

Cliente > Responsável > Status > Número. Nome semibold em `foreground`; telefone e responsável em `muted-foreground`; badges em `text-xs`/`text-[10px]` com fundo neutro. O número nunca supera o cliente em destaque.

## 9. Painel lateral / modal — "CRM Card"

`SalesRoutePanel` é reorganizado visualmente (mesmos dados, mesmas fontes) em uma leitura tipo card, nesta ordem: Rota Comercial · Número ativo · Provider · Status · Resolver · Histórico de endpoints (trilha `2890 ↓ 5098 ↓ 8439`) · Última inbound · Responsável · Thread ID · Business Context · Canal · Linha · Feature Flag · Motivo da resolução. Recebe o bloco "Histórico de endpoints utilizados" removido do cabeçalho. Termos técnicos (incluindo `Route Resolver V2` / `conv_route_resolver_v2` / `REPLY_ROUTE_UNRESOLVED`) continuam visíveis apenas aqui e no modal.


## 10. Timeline

Não alterada nesta etapa. O divisor "Número alterado" permanece exatamente como está; melhorias ficam adiadas para a Fase 2.5.2.

## 11. Organização do código

Sem inflar `MessagesList.tsx`. A UI sai para componentes dedicados em `src/components/messages/route/`:

- `SalesConversationHeader.tsx` (já existe) — refatorado para a estrutura de 3 linhas e passa a ser usado pelo `MessagesList`, recebendo status, chips de janela e ações via props.
- `SalesConversationMeta.tsx` (novo) — Linha 2 e Linha 3 (telefone/responsável e badges).
- `SalesComposerStatus.tsx` (novo) — avisos do composer.

`MessagesList.tsx` fica responsável apenas pela composição, com remoção líquida de código do cabeçalho/rodapé.

## 12. Comercial ≠ Atendimento

Confirmado por inspeção: `EndpointBadge` é usado apenas por `src/components/inbox/InboxThreadList.tsx` e telas de Atendimento; `RouteBadge` apenas pelo Comercial. Nenhum arquivo em `src/components/inbox/`, `src/components/mobile/` ou `MobileInbox` será tocado.

## 13. Validação

- `tsgo --noEmit`, lint e build.
- Screenshots via Playwright no preview: lista Comercial, conversa, modal "Detalhes da rota", painel de detalhes e Configurações > Integrações > WhatsApp Comercial, com comparação antes/depois. Caso a sessão autenticada não esteja disponível no preview, informo explicitamente e entrego as telas acessíveis.

## Arquivos previstos

Alterados:
- `src/pages/messages/MessagesList.tsx`
- `src/components/messages/route/RouteIndicators.tsx`
- `src/components/messages/route/SalesConversationHeader.tsx`
- `src/components/messages/route/SalesRoutePanel.tsx`
- `src/components/messages/route/SalesRouteDetailsDialog.tsx` (apenas rótulos técnicos)

Novos:
- `src/components/messages/route/SalesConversationMeta.tsx`
- `src/components/messages/route/SalesComposerStatus.tsx`

Nada em `supabase/`, hooks de dados, Atendimento ou Mobile.
