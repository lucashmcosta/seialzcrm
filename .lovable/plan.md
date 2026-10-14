# Widget Workspace V2 — auditoria read-only e plano

Esta etapa é só auditoria. Nada foi alterado. A implementação depende de aprovação explícita.

## 1. Arquitetura atual (código lido)
- `src/widgets/registry.ts`: catálogo global (1 item: `overtime_calculator`, telas commercial/inbox, modos modal/drawer).
- `src/widgets/useOrgWidgets.ts`: `useOrgWidgetConfig` lê `organization_widgets` e `organization_widget_screens` via React Query (`['org-widgets', orgId]`). **Cada instância do hook abre um canal Realtime próprio**, com nome aleatório. Essa foi a correção da regressão, mas com N consumidores ficam N canais abertos. `resolveEffectiveWidgets` cruza o registry com o widget ligado e a tela ligada.
- `src/widgets/useWidgetPins.ts`: `user_widget_preferences(organization_id, user_id, screen, pinned_widget_keys)`, upsert otimista.
- `WidgetsTrigger`: atalhos fixados e menu Popover. O menu abre o `WidgetHost` (Dialog/Sheet com backdrop). O atalho alterna o `PinnedWidgetPanel`.
- `PinnedWidgetContext` e `PinnedWidgetPanel`: estado só da sessão, montado dentro de `MessagesList.tsx` e `InboxPage.tsx`. Por isso o widget se perde ao trocar de tela, e em telas a partir de 1536px ele comprime a conversa.
- Ordem dos providers em `App.tsx`: `QueryClient > Tooltip > BrowserRouter > Auth > Organization > Telephony > Theme > Routes`. `ProtectedRoute` envolve cada rota do CRM, e o `Layout`/`MobileLayout` é montado por página.
- Dependências: `framer-motion` já está instalada. Não há biblioteca de arrastar/redimensionar.

## 2. Reutilizados
Registry, `WidgetDefinition` (com campos novos), `OvertimeCalculatorWidget`, `organization_widgets`, `organization_widget_screens`, RLS, `can_manage_settings`, a tela Configurações > Widgets e `resolveEffectiveWidgets`.

## 3. Substituídos ou removidos
`WidgetHost` (Dialog/Sheet), `PinnedWidgetProvider`, `PinnedWidgetPanel`, a coluna lateral em `MessagesList`/`InboxPage` e o estado `openKey` local do `WidgetsTrigger`. O `WidgetsTrigger` passa a ser apenas um lançador.

## 4. Arquitetura proposta
```text
App > ... > OrganizationProvider > Theme > Routes
                                  └─ WidgetWorkspaceProvider (key = userId:orgId)
                                       ├─ 1 canal Realtime de config (singleton)
                                       ├─ store do layout (por usuário e organização)
                                       └─ WidgetWorkspaceLayer (portal fixo, pointer-events:none)
                                            └─ WidgetWindow xN (pointer-events:auto)
Telas publicam contexto -> WidgetContextBridge (só leitura)
```
- **Camada**: um `div` fixo em tela cheia, sem backdrop e com `pointer-events:none`. Só as janelas capturam cliques, então o CRM continua clicável.
- **Janela**: título, minimizar, fechar e menu (...) com "Remover do espaço de trabalho". Clicar na janela traz ela para frente. Minimizadas aparecem como "chips" num dock no canto inferior direito.
- **Uma instância por widget**, identificada pela `widget_key`.
- **Lançadores**: o menu Widgets e os atalhos fixados abrem ou focam a janela. A partir daqui, "fixar" significa só ter um atalho no cabeçalho.
- **Visibilidade**: a janela continua aberta em qualquer tela interna. Se o administrador desligar o widget na organização, a janela some na hora (via Realtime). [INCERTO] A habilitação "por tela" passa a controlar só onde o lançador aparece, não se a janela continua aberta. Isso precisa de decisão sua.

## 5. Biblioteca
**react-rnd** (react-draggable + re-resizable). É madura, tem tipagem TypeScript, funciona com React 18, oferece `bounds="parent"`, `minWidth`/`maxWidth`, `dragHandleClassName` e os eventos `onDragStop`/`onResizeStop`. O z-index fica num contador próprio, que é simples. Alternativa considerada: `@dnd-kit`, descartada porque não faz redimensionamento e é voltada para listas.

## 6. Persistência
Nova tabela `user_widget_workspace`, com uma linha por `(organization_id, user_id)`:
- `layout jsonb`: `{ version:1, windows: { [key]: { state:'open'|'minimized', x, y, w, h, z } } }`
- `updated_at`
- RLS: SELECT, INSERT e UPDATE somente quando `user_id = current_user_id()` e `organization_id = ANY(current_user_org_ids())`. DELETE pelo próprio usuário. Grants explícitos para `authenticated` e nenhum para `anon`.
- Fechar remove a entrada do mapa. Remover também remove e limpa o layout salvo. Na V2 os dois têm o mesmo efeito no banco. [INCERTO] Fechar pode guardar a última posição para reabrir no mesmo lugar, e Remover apagaria tudo.
- Escrita: o estado vive localmente durante o arraste, sem gravar nada. A gravação acontece em `onDragStop`/`onResizeStop`/abrir/fechar, com debounce de 800 ms e um único upsert com o layout inteiro, mais um flush em `beforeunload`/`visibilitychange`. Isso dá no máximo cerca de 1 UPDATE por gesto.
- A tabela não entra no Realtime: o layout é pessoal e não precisa sincronizar entre abas nesta etapa.
- `user_widget_preferences.pinned_widget_keys` continua servindo para os atalhos.

## 7. Montagem global
- O provider fica dentro de `OrganizationProvider` e `BrowserRouter`, fora de `Routes`. Assim ele não é desmontado ao navegar.
- Ele só renderiza quando há usuário autenticado, `organization` e `userProfile`, e a rota não é `/admin/*`, `/auth/*`, pública, nem mobile (`useIsMobile`).
- `key={userId:orgId}`: trocar de organização ou fazer logout desmonta tudo, limpa o estado e fecha o canal. Isso impede vazamento entre organizações. O cache do React Query também já é separado por `orgId`.
- **Realtime**: o canal passa a ser único, aberto pelo provider. `useOrgWidgetConfig` passa a só ler o cache, sem abrir canal. Isso elimina canais duplicados.

## 8. Contexto
- `WidgetDefinition.contextMode: 'none' | 'contact' | 'thread'`.
- As telas publicam o contexto com `useWidgetContextSource({ screen, contactId, threadId })`. Ao desmontar, a tela limpa o contexto. A publicação usa comparação por campos, o que evita loops.
- O contexto sempre carrega `organizationId`. A janela confere se ele é igual à organização ativa; se não for, mostra estado vazio.
- Widgets `none` (calculadora) ignoram o contexto. Widgets `contact`/`thread` mostram estado vazio quando não há contexto. A troca de contato remonta o corpo do widget com `key=contactId`, então nunca aparecem dados do contato anterior.

## 9. Responsividade
- Limites: as janelas ficam dentro da área visível, com pelo menos 48 px da barra de título sempre visíveis. Tamanho mínimo 280x200, máximo 90% da tela.
- Ao redimensionar o navegador, as posições são reajustadas para dentro da tela (com throttle de 150 ms).
- Abaixo de 768 px, ou no mobile, a camada não é montada e o lançador usa o modo antigo, apenas como fallback. [INCERTO] Para o mobile nesta etapa: esconder os widgets ou manter um Sheet simples?
- A camada fica abaixo de modais e toasts do sistema e acima do conteúdo, para nunca cobrir diálogos críticos. A posição inicial é em cascata, longe do composer.

## 10. Riscos de regressão
| Risco | Mitigação |
|---|---|
| Canais Realtime duplicados | Canal singleton no provider |
| Provider no nível errado ou desmontado ao navegar | Fora de `Routes`, com `key` por usuário e organização |
| Loops de contexto | Comparação por campos e `useMemo` nas telas |
| Gravações excessivas no banco | Debounce e gravação só ao terminar o gesto |
| Vazamento entre organizações | `key`, checagem de `organizationId` e RLS por usuário e organização |
| Cliques bloqueados | `pointer-events:none` na camada |
| Conflito V1/V2 | Remover `WidgetHost` e o `PinnedWidgetPanel` no mesmo passo |
| Composer, WhatsApp, rotas | Nenhum arquivo dessas áreas é tocado. Em `MessagesList` e `InboxPage` só sai o wrapper do painel e entra uma chamada ao hook de contexto |

## 11. Etapas
1. Migration de `user_widget_workspace` + RLS + grants, com rollback salvo em `docs/`.
2. `bun add react-rnd`. Criação de `WidgetWorkspaceProvider`, store, `WidgetWorkspaceLayer`, `WidgetWindow`, dock e `useWidgetContextSource`. Canal Realtime singleton.
3. Montagem global em `App.tsx` com os guards de rota e organização.
4. `WidgetsTrigger` vira lançador. Remoção de `WidgetHost`, `PinnedWidget*` e dos wrappers em `MessagesList`/`InboxPage`.
5. Inclusão de `contextMode` no registry (calculadora = `none`).
6. Atualização de `docs/modules/widgets/README.md`, de um ADR e da regra de widgets no `AGENTS.md`.
7. Verificação: typecheck, build e testes unitários do store (clamp, z-order, serialização).

## 12. Critérios de aceitação
- Abrir 2 ou mais widgets: arrastar, redimensionar, minimizar, restaurar, fechar e remover funcionam. O CRM continua clicável e não há escurecimento.
- Navegar entre Comercial, Atendimento, Contatos e Oportunidades: as janelas continuam nas mesmas posições. Após recarregar a página, o layout é restaurado.
- Trocar de organização: as janelas somem e voltam conforme o layout salvo daquela organização. Logout limpa tudo.
- O administrador desliga o widget: a janela fecha na hora para todos.
- Arrastar uma janela gera no máximo 1 gravação. Existe só 1 canal `org-widgets` ativo.
- A conversa não muda de largura. O composer e o envio continuam iguais.
- Teste manual com sessão real, porque o Playwright não consegue autenticar neste projeto.

## Pontos para sua decisão
1. A habilitação "por tela" passa a controlar só onde o lançador aparece? (proposto: sim)
2. Fechar deve guardar a última posição? (proposto: sim; Remover apaga)
3. Mobile e telas abaixo de 768 px: esconder os widgets ou usar o Sheet antigo?
