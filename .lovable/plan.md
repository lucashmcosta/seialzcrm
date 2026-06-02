## Objetivo

Substituir o placeholder "Atendimento mobile em breve" por uma experiência mobile real em `/inbox`, no mesmo padrão visual e de navegação do `/messages` mobile (lista de conversas em tela cheia → toque abre o chat em tela cheia com botão voltar).

## Escopo

- Apenas UI mobile do Atendimento (`InboxPage` quando `isMobile`).
- Reutilizar 100% dos hooks já existentes: `useInboxThreads`, `useInboxQueueCounts`, `useInboxThread`, `useInboxThreadMessages`.
- Reutilizar `InboxComposer`, `InboxConversationTimeline`, `InboxSlaChip`, `WhatsAppWindowChip` (já são responsivos o suficiente).
- Sem mudanças em backend, RLS, `inboxScope.ts`, schema ou regras de negócio.
- Sem alterar a versão desktop (`InboxThreadList` + `InboxThreadDetail`).

## Arquivo novo

`src/components/mobile/MobileInbox.tsx` — componente único com duas "views":

1. **Lista** (default)
   - Header sticky: título "Atendimento" + contador, sem sidebar (o `MobileLayout` já cuida).
   - Barra de busca (`Input` controlado, filtra por nome/telefone/preview localmente sobre `threads`).
   - Chips horizontais scrolláveis para `tab`: Ativos / Aguardando / Concluídos hoje (com counts de `useInboxQueueCounts`).
   - Toggle "Apenas minhas" como chip toggleável ao lado dos tabs.
   - Lista de cards usando o mesmo padrão visual do `InboxThreadList` desktop adaptado a mobile:
     - Avatar com iniciais + cor derivada do nome (mesmas helpers `initials` + `colorFromName`).
     - Nome + horário relativo, **bold + dot verde** quando `last_message_direction === 'inbound'` (não lida), igual ao desktop.
     - Preview da última mensagem (line-clamp-2).
     - Pills: status, `InboxSlaChip`, "Cliente" se lifecycle, "Sem dono" se não atribuída.
     - Borda esquerda verde grossa quando unread.
   - Empty state e loading consistentes com o padrão mobile (SpinnerGap).
   - Toque no card → seta `selectedId` → renderiza view de chat.

2. **Chat** (quando `selectedId != null`)
   - Header fixo com botão voltar (`CaretLeft`), avatar pequeno, nome, `WhatsAppWindowChip`, `InboxSlaChip`.
   - Botão "Resolver"/"Reabrir" no header (icon-only).
   - Menu `DropdownMenu` (3 pontos) com: Reatribuir (abre `OwnerSelector` em `Dialog`/Sheet), Ver detalhes (abre `Sheet` lateral com o mesmo conteúdo do painel `Atendimento` do desktop — Tipo/Origem/Atribuída/SLAs/Histórico).
   - `InboxConversationTimeline` ocupa o middle (`flex-1 min-h-0`).
   - `InboxComposer` no rodapé.
   - Sem painel lateral fixo (vira Sheet sob demanda).

## Mudança em `src/pages/inbox/InboxPage.tsx`

Substituir o bloco `if (isMobile)` placeholder por `return <MobileInbox />;` (envolto em `MobileLayout`, igual `MobileMessagesList` faz). O fluxo desktop fica intacto.

## Detalhes técnicos

- `MobileInbox` orquestra estado local: `tab`, `onlyMine`, `selectedId`, `searchQuery`, `showDetailsSheet`.
- Resolução de `internalUserId` (de `auth.uid → users.id`) replicada como em `InboxPage` (Core rule).
- Hooks chamados com os mesmos args do desktop.
- `h-screen overflow-hidden` no container raiz seguindo a memória `fixed-viewport-layout`; lista e chat usam `flex-1 min-h-0`.
- Tokens semânticos (sem cores diretas Tailwind tipo `bg-white`).
- Sheet de detalhes via `@/components/ui/sheet` lado direito.

## Fora de escopo

- Notificações push, swipe-to-resolve, drag handles, atalhos.
- Mudanças em `InboxThreadList`/`InboxThreadDetail`.
- Real read tracking (mantém heurística `last_message_direction === 'inbound'`).
