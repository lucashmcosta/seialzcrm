# Widget fixado como painel lateral persistente (não modal)

## Comportamento
- Menu Widgets: continua abrindo no modo do admin (Modal/Drawer), como hoje.
- Atalho fixado no header: abre/troca o widget num painel lateral único, sem backdrop, sem bloquear cliques. O painel ocupa espaço no layout (a área da conversa encolhe), não sobrepõe.
- Clicar no atalho do widget já aberto fecha o painel; clicar em outro atalho troca o conteúdo.
- X do painel só fecha; não desafixa. Desafixar continua no menu.
- Estado aberto vive só na sessão (memória), por tela. Trocar de conversa mantém o painel aberto; o widget recebe o contexto da conversa atual.
- Se o widget for desligado ou desafixado com o painel aberto, o painel fecha.
- Sem conversa selecionada, o painel continua visível se aberto (o atalho só aparece no header da conversa).

## Componentes alterados
Novos:
- `src/widgets/PinnedWidgetContext.tsx` — provider por tela com `openKey`, `open(key)`, `toggle(key)`, `close()` e o último `context`.
- `src/widgets/PinnedWidgetPanel.tsx` — painel `aside` (largura fixa ~360px, borda esquerda, scroll próprio, header com nome + X), resolve o widget por `useEffectiveWidgets` + pins; renderiza nada se fechado/inválido.

Alterados:
- `src/widgets/WidgetsTrigger.tsx` — atalhos fixados chamam `toggle` do provider (em vez de `setOpenKey`); menu Widgets mantém `WidgetHost` modal/drawer; publica o `context` atual no provider.
- `src/pages/messages/MessagesList.tsx` — envolver a área de conteúdo com o provider `commercial` e inserir `PinnedWidgetPanel` como coluna irmã à direita da área de conversa (só wrapper de layout; nenhuma mudança em composer, envio, rota).
- `src/pages/inbox/InboxPage.tsx` — provider `inbox` e `PinnedWidgetPanel` como última coluna no `flex` ao lado de `InboxThreadDetail`.
- `src/components/inbox/InboxThreadDetail.tsx` — nenhuma mudança além do que já existe (consome o provider via `WidgetsTrigger`).

Não alterados: `WidgetHost`, `useOrgWidgets`, `useWidgetPins`, registry, banco/RLS, composer, dispatcher, WhatsApp.

## Validação
Playwright não consegue autenticar (Supabase próprio); validação por build/typecheck e roteiro manual: abrir calculadora fixada, trocar conversa, enviar mensagem, abrir detalhes, fechar por X e confirmar que o pin permanece.
