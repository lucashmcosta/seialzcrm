# Atalho fixado ainda abre como Drawer com fundo escuro

## O que o código faz hoje (lido agora)
- Handler do atalho fixado, em `WidgetsTrigger.tsx:51`: `onClick={() => (panel ? panel.toggle(def.key) : setOpenKey(def.key))}`.
- Ele ainda pode chamar o WidgetHost. Se `usePinnedWidget()` devolver `null`, o clique cai em `setOpenKey`. Aí `active` passa a ter valor e o `<WidgetHost>` da linha 84 abre o Sheet/Dialog no modo do admin, com fundo escuro e bloqueando o resto da tela.
- Onde o painel é renderizado:
  - /commercial: o provider envolve `DesktopMessagesList` (`MessagesList.tsx:3416`), o painel está na linha 3164 e o trigger no header na linha 2142, então os dois ficam dentro do provider.
  - /inbox: o provider está em `InboxPage.tsx:87`, o painel na linha 109 e o trigger em `InboxThreadDetail.tsx:269`, também dentro do provider.
- Por que o fundo escuro aparece: a árvore está correta. A única forma de o fundo aparecer pelo atalho fixado é o fallback descrito acima, e ele dispara quando o contexto do painel chega como `null`. Uma causa possível é a prévia ter recarregado o arquivo do contexto e criado uma segunda instância dele, o que já aconteceu nesta sessão com a prévia desatualizada. Outra possibilidade é o clique ter sido no item do menu Widgets, que abre o Drawer de propósito. **[Não confirmado]** O passo 1 confirma qual das duas foi.

## Passo 1: reproduzir antes de corrigir
Uso o Playwright autenticado, em 1080 px e em 1600 px, no /commercial e no /inbox:
- clico no atalho fixado e registro se aparece `[data-widget-host="drawer"|"modal"]` ou `[data-widget-host="pinned-panel"]`;
- registro se o contexto do painel chega `null` no momento do clique, com um log temporário só no script de teste.

## Passo 2: correção mínima, só no fluxo do atalho fixado
Em `WidgetsTrigger.tsx`:
- o atalho fixado chama só `panel?.toggle(def.key)`. O fallback para `setOpenKey`/WidgetHost sai. Sem provider, o atalho não aparece em vez de abrir um Drawer;
- `WidgetHost` e `openKey` locais continuam só para o item do menu Widgets, que segue no Modal/Drawer do admin.

Se o passo 1 mostrar o contexto `null` por duplicação do módulo: reinicio a prévia e confirmo que o contexto volta, sem mudar a árvore. Se mostrar que o clique foi no menu: não mudo nada no menu e informo você.

Não mexo em: `PinnedWidgetPanel` (que já é um `aside`, sem portal e sem fundo escuro), banco/RLS, Realtime, composer, WhatsApp, dispatcher nem na configuração de Modal/Drawer.

## Passo 3: validação visual (capturas em /commercial e /inbox)
- Widget fixado aberto, sem fundo escuro e sem nenhum `data-widget-host` modal ou drawer na página.
- Clique numa mensagem e no botão de detalhes funcionando.
- Digitar no campo de mensagem funcionando. Não envio mensagem real.
- Trocar de conversa com o painel aberto: ele continua aberto.
- X fecha e o atalho continua fixado. Clicar de novo no atalho abre ou troca o widget.
- O item do menu Widgets ainda abre o Modal/Drawer como antes.
