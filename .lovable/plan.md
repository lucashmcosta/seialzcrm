# Widgets como módulo global (catálogo + Workspace V2)

## O que muda para o usuário
- Menu lateral: "Central de Ajuda" vira "Widgets", que abre a página `/widgets`.
- `/widgets`: grade de cartões (ícone, nome, descrição, botão "Abrir") com os widgets ligados na organização. "Abrir" usa o Workspace V2 atual. Se a janela já existe, ela é restaurada e trazida para frente, sem duplicar.
- Configurações → Widgets: fica só o interruptor por widget. Saem os botões Modal/Drawer e os interruptores por tela.
- Comercial e Atendimento: o botão de widgets e os atalhos fixados continuam no mesmo lugar e abrem as mesmas janelas.

## Auditoria (estado atual)
- O item "Central de Ajuda" (`/docs`) aparece em 3 lugares: `Layout.tsx` (barra lateral Seialz, linha 111), `Layout.tsx` (rodapé legado, linha 199) e `MobileLayout.tsx` (linha 93).
- `ws.open(key)` já faz abrir/restaurar/focar com uma instância por widget (`openWindow` em `layout.ts`). O catálogo pode usar isso direto.
- O Workspace já usa só a habilitação global (`enabledKeys`); `organization_widget_screens` só filtra os lançadores (`resolveEffectiveWidgets` → `WidgetsTrigger`) e a tela de Configurações.
- Desligar um widget na org já fecha as janelas pelo Realtime (`WidgetWorkspaceLayer` filtra por `enabledKeys`). Não muda nada nisso.
- `open_mode` já não tem efeito desde a V2.

## Regras de acesso
- Catálogo `/widgets`: qualquer membro ativo da org vê o que estiver ligado (a RLS de leitura de `organization_widgets` continua a mesma). Sem nova permissão.
- Ligar/desligar: continua exigindo `can_manage_settings` (RLS atual + checagem na tela).
- Rota protegida pelo `ProtectedRoute` (precisa de sessão). Não entra em `/admin`.
- Celular (abaixo de 768px): o Workspace não monta. `/widgets` mostra o aviso "Widgets disponíveis no computador", e o menu do celular troca o item do mesmo jeito para manter a consistência.

## Compatibilidade
- `organization_widget_screens`: passa a ser só de compatibilidade. Ninguém lê nem grava mais nela; tabela, dados, RLS e FK ficam como estão. Remover só numa etapa futura.
- O canal Realtime deixa de ouvir `organization_widget_screens`. Continua um canal por org, só com `organization_widgets`.
- Lançadores do Comercial e do Atendimento mostram: widget ligado na org ∩ tela listada no `def.screens` do registry (que hoje inclui as duas telas). Os atalhos fixados (`user_widget_preferences`) e os layouts (`user_widget_workspace`) não mudam.
- O campo `openModes`/`defaultOpenMode` sai do tipo e do registry. `WidgetOpenMode` e os campos lidos de screens também saem do hook.
- `/docs` continua acessível por URL; só o item do menu é trocado. [INCERTO] Diga se a Central de Ajuda precisa de outro ponto de acesso, por exemplo no perfil.

## Arquivos
- `src/components/Layout.tsx`: trocar os 2 itens para `{ label: 'Widgets', href: '/widgets', icon: PuzzlePiece }`.
- `src/components/mobile/MobileLayout.tsx`: mesma troca.
- `src/App.tsx`: rota `/widgets` (lazy, protegida, dentro de `Layout`).
- `src/pages/widgets/WidgetsCatalog.tsx` (novo): cartões, botão "Abrir" chamando `ws.open`, estado vazio ("Nenhum widget ligado nesta organização"), e link para Configurações para quem tem `canManageSettings`.
- `src/widgets/useOrgWidgets.ts`: buscar só `organization_widgets`, criar `useEnabledWidgets(screen?)` e remover `resolveEffectiveWidgets` por tela.
- `src/widgets/WidgetsTrigger.tsx`: usar o novo hook. A lógica de abrir e de pins fica igual.
- `src/widgets/workspace/WidgetWorkspaceProvider.tsx`: tirar a assinatura de `organization_widget_screens`.
- `src/pages/settings/WidgetsSettings.tsx`: ficar só com o interruptor global e trocar o texto ("aparecem no catálogo Widgets e nos atalhos do Comercial/Atendimento").
- `src/widgets/types.ts`, `src/widgets/registry.ts`: remover open modes. `ACTIVE_SCREENS`/`SCREEN_LABELS` só se ficarem sem uso.
- `docs/modules/widgets/README.md`, `docs/product/navigation-map.md`, `AGENTS.md` (regra do catálogo global) e `roadmap.md`.
- Sem migrations, sem mudança de RLS e sem Edge Functions.

## Riscos de regressão
- Lançadores passam a aparecer nas duas telas para qualquer widget ligado, mesmo que antes a tela estivesse desligada. Hoje só existe a calculadora, então o efeito é pequeno. Isso é intencional, conforme o pedido.
- Os 3 menus precisam mudar juntos, ou a navegação fica diferente entre eles. O filtro `areaAllowed` precisa aceitar `/widgets`, ou o item some (vou conferir em `RequirePerm`/areas).
- Abrir pelo catálogo sem contexto: widgets `contact`/`thread` mostram o estado vazio que já existe. A calculadora (`none`) não é afetada.
- Conversas, composer, envio e roteamento não são tocados: nenhum arquivo de Messages/Inbox muda além do import já existente do `WidgetsTrigger`.

## Verificação
- Build/typecheck e testes de layout existentes.
- Playwright logado: menu → `/widgets` → Abrir (janela abre) → Abrir de novo (foca, sem duplicar) → minimizar → Abrir (restaura). Desligar em Configurações faz o widget sumir do catálogo e fecha a janela. Conferir o atalho no Comercial e no Atendimento.
