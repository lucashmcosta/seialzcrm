# Fase Final — Conclusão do módulo Comercial + QA (Go-Live)

Frontend/apresentação apenas. Nada de SQL, banco, Edge Functions, triggers, resolver, feature flags, hooks de dados, queries novas, Atendimento ou Mobile.

## Lacunas confirmadas por inspeção

1. `SalesConversationHeader` existe mas **não é usado**: o cabeçalho da conversa está duplicado inline em `MessagesList.tsx` (avatar + nome + status + `SalesConversationMeta` + botão de detalhes).
2. O `RouteBadge` da lista recebe `state={endpointAddress ? 'online' : 'no_route'}` — "tem endereço = online", ignorando endpoint inativo.
3. `SalesRouteDetailsDialog` é montado sempre que há thread selecionada e já dispara a query de último outbound mesmo fechado.
4. Lista: existe skeleton de loading e um vazio único ("Nenhuma conversa"); **não há estado de erro** nem vazio contextual para busca/filtro.

## 1. Consolidação do cabeçalho
- Adotar `SalesConversationHeader` como cabeçalho único do Comercial em `MessagesList.tsx`, recebendo `statusLabel`/`statusClassName`, `windowChips` (chip de janela com `tone="soft"`), `actions` (menu de ações existente) e `onOpenDetails`.
- Remover integralmente o bloco de cabeçalho inline duplicado.

## 2. RouteBadge com estado real
- Derivar o estado do badge da lista do endpoint já carregado (`is_active`): ativo → Online, inativo → Offline, sem endereço/rota → Conversa legada. Sem tocar nas queries; usa apenas dados já em memória.

## 3. Modal lazy
- `SalesRouteDetailsDialog` passa a ser montado somente quando `routeDetailsOpen === true`, eliminando a query de último outbound com o modal fechado.

## 4. Estados da lista
- Estado de erro com mensagem e botão "Tentar novamente" ligado ao refetch já existente.
- Vazio contextual: sem filtros/busca → "Nenhuma conversa."; com busca ou filtro ativo → "Nenhuma conversa encontrada." + botão "Limpar filtros" (reseta busca e filtro para o padrão).

## 5. Polimento visual (somente correções de inconsistência)
Corrigir apenas inconsistências visuais identificadas durante o QA (alinhamentos, espaçamentos, tipografia, cores e badges). Não introduzir novos estilos, novas hierarquias visuais, novos componentes ou redesign. O objetivo é estabilizar a interface para produção.

## 6. Configurações → Integrações → WhatsApp Comercial
- Somente layout: alinhar `Field` com o padrão de `Row`, revisar densidade, chips e apresentação de Route, número ativo, provider, status, endpoints vinculados e modo de roteamento. Continua somente leitura, sem toggle.

## 7. QA final
`tsgo --noEmit`, build, suíte de testes e QA manual via Playwright no preview autenticado, registrando PASS/FAIL para: abertura do Comercial, lista, pesquisa, filtros, seleção de conversa, cabeçalho, badges, RouteBadge, modal "Detalhes da rota", composer, templates, estados (loading/vazio/erro/sem rota/template-only), mensagens, timeline, Configurações, console do navegador e erros React.
- Durante o QA corrigir apenas bugs funcionais, regressões e inconsistências visuais evidentes; melhorias não bloqueantes só são registradas.

## 7.1 QA funcional do Comercial

Executar o fluxo completo como operador:

✓ abrir lista Comercial

✓ abrir conversa

✓ responder mensagem

✓ enviar template

✓ reabrir conversa

✓ trocar responsável

✓ alterar status

✓ abrir Detalhes da rota

✓ navegar entre várias conversas

✓ atualizar página

✓ confirmar que a conversa permanece selecionada

✓ confirmar ausência de erros no console

✓ confirmar ausência de requisições falhadas

## Notas técnicas
- Arquivos alvo: `src/pages/messages/MessagesList.tsx`, `src/components/messages/route/{SalesConversationHeader,SalesConversationMeta,RouteIndicators,SalesRouteDetailsDialog,SalesRoutePanel,SalesComposerStatus}.tsx`, `src/components/settings/SalesWhatsAppSettingsSection.tsx`.
- Nenhuma alteração em `useSalesRoute`, `useThreadEndpointHistory`, `useRouteResolverFlag`, `useSalesRouteConfig`, `useConsolidatedThreadIds`.
- `EndpointBadge`, `InboxThreadList` e componentes mobile não são tocados.
- Se surgir bug de backend, ele é reportado antes de qualquer ação fora do frontend.

## Entrega
Arquivos alterados, resumo das melhorias, checklist QA PASS/FAIL, bugs encontrados e corrigidos, e confirmação explícita de backend/trigger/Edge Function/flag/query/Atendimento/Mobile intactos e do Comercial pronto para produção.
