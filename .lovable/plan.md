# Fase Final — Concluir o módulo Comercial + QA

Frontend/apresentação apenas. Atendimento, Mobile, banco, Edge Functions, triggers, resolver e feature flags permanecem intocados. Nenhuma flag nova, nenhuma escrita nova.

## Lacunas confirmadas por inspeção

1. `SalesConversationHeader` existe mas **não é usado** em nenhuma tela: o cabeçalho está duplicado inline em `MessagesList.tsx` (avatar + nome + status + `SalesConversationMeta`). Duas fontes de verdade para o mesmo cabeçalho.
2. `SalesRoutePanel` só é renderizado **dentro do modal**. Não existe painel lateral de rota na conversa.
3. O `RouteBadge` da lista lateral recebe `state={endpointAddress ? 'online' : 'no_route'}` — derivado do endpoint da mensagem, não do estado real da rota. Conversas com endpoint inativo aparecem como "online".
4. Divisor de troca de número na timeline (previsto na Fase 2.5) não existe.
5. Estados da lista: existe skeleton de loading e um vazio mínimo ("Nenhuma conversa"); **não há estado de erro** e o vazio não distingue "sem conversas" de "busca/filtro sem resultado".
6. `SalesRouteDetailsDialog` é montado sempre que há thread selecionada e já dispara query de último outbound mesmo fechado.

## O que será feito

### Consolidação de componentes
- Adotar `SalesConversationHeader` como cabeçalho único da conversa Comercial em `MessagesList.tsx`, passando `statusLabel`/`statusClassName`, `windowChips`, `actions` e `onOpenDetails`. Remover o cabeçalho inline duplicado.
- `SalesRouteDetailsDialog`: montar apenas quando `open` (evita query desnecessária) e remover linhas repetidas em relação ao `SalesRoutePanel`.
- `SalesRoutePanel`: manter como CRM Card, revisar espaçamentos/alinhamento das linhas e o rótulo técnico apenas nesse contexto.

### Painel lateral da rota
- Adicionar na conversa Comercial um painel lateral colapsável (desktop ≥ `xl`) com `SalesRoutePanel`, alternado pelo mesmo botão "Detalhes da rota" (modal em telas menores). Sem novas queries: reutiliza os hooks existentes.

### Estado real na lista
- Derivar o estado do `RouteBadge` da lista a partir do endpoint já carregado (`is_active`) em vez de "tem endereço = online", mantendo `no_route` quando não há endereço. Sem alterar a query da lista.

### Timeline
- Divisor discreto "Número alterado 2890 → 8439" entre mensagens quando o `endpoint_id` muda, usando o histórico já disponível em `useThreadEndpointHistory`.

### Estados de UI
- Estado de erro na lista (mensagem + botão "Tentar novamente" usando o refetch existente).
- Vazio contextual: "Nenhuma conversa encontrada" quando há busca/filtro ativo, com ação de limpar; texto neutro caso contrário.
- Estado vazio da área de conversa e estados sem rota/template-only revisados para tom âmbar consistente.

### Polimento visual (varredura)
- Espaçamentos, alinhamento e hierarquia do cabeçalho, lista, chips e composer; tipografia dentro do design system (peso máx. 600, `font-data` para números); tooltips em todos os chips; botões secundários discretos; tokens semânticos apenas.
- Configurações → Integrações → WhatsApp Comercial: revisar apresentação de Route, número ativo, provider, status, endpoints vinculados e modo de roteamento; alinhar `Field`/`Row` com o padrão do painel; manter somente leitura.
- Conferência visual de cada estado: normal, resolvida, reaberta, sem rota, template-only, online, offline e providers Meta/Evolution/Twilio (rótulos e chips).

## QA final
Playwright no preview autenticado + `tsgo` + build + suíte de testes. Checklist com PASS/FAIL para: abertura do Comercial, lista, filtros, pesquisa, seleção de conversa, painel, modal, composer, templates, badges, chips, status, route, provider, endpoint, timeline, configurações, navegação, console do navegador, erros React, typecheck, build. Qualquer FAIL é corrigido e o item reexecutado até PASS.

## Notas técnicas
- Arquivos alvo: `src/pages/messages/MessagesList.tsx`, `src/components/messages/route/*`, `src/components/settings/SalesWhatsAppSettingsSection.tsx`.
- Nenhum hook de dados novo; nenhuma alteração em `useSalesRoute`, `useThreadEndpointHistory`, `useRouteResolverFlag`, `useSalesRouteConfig`, `useConsolidatedThreadIds`.
- `EndpointBadge`, `InboxThreadList` e componentes mobile não são tocados; `WhatsAppWindowChip` continua com `tone="soft"` só no Comercial.
- Caso algum bug de backend apareça durante o QA, ele é reportado antes de qualquer correção fora do frontend.

## Entrega
Arquivos alterados, resumo das melhorias, checklist QA com PASS/FAIL, bugs encontrados/corrigidos e confirmação final de prontidão para a operação.
