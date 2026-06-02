## Objetivo
Tornar o painel lateral direito ("Atendimento" / "Dados da conversa") retrátil em `InboxThreadDetail.tsx`.

## Mudanças (apenas UI)

### 1. Estado local de colapso
- Adicionar `const [sideOpen, setSideOpen] = useState(true)` em `InboxThreadDetail`.
- Persistir preferência em `localStorage` (`inbox.sidePanel.open`) para manter entre navegações/reload.

### 2. Botão de toggle no header
No bloco de ações do header (onde estão "Aberta" + "Resolver"), adicionar um `Button` ghost size icon (`h-7 w-7`) à direita do botão Resolver/Reabrir:
- Ícone: `SidebarSimple` do `@phosphor-icons/react` (ou `CaretRight`/`CaretLeft` alternando conforme estado).
- `title`: "Ocultar painel" / "Mostrar painel".
- `onClick`: alterna `sideOpen` e grava no localStorage.

### 3. Renderização condicional do `<aside>`
- Manter o `<aside>` montado (sem desmontar para preservar scroll), mas animar largura:
  - Quando `sideOpen`: `w-[300px]`
  - Quando colapsado: `w-0 border-l-0 overflow-hidden`
- Aplicar `transition-[width] duration-200 ease-in-out` no `<aside>`.
- Conteúdo interno permanece, apenas fica recortado pelo `overflow-hidden` quando largura é 0.

### 4. Nada mais muda
- Sem alterar lógica de dados, hooks, RLS, scope, ou outros componentes.
- A coluna central (`flex-1`) naturalmente expande ao colapsar o aside.

## Arquivo afetado
- `src/components/inbox/InboxThreadDetail.tsx` (apenas).

## Fora do escopo
- Mobile (`MobileLayout`/`MobileMessagesList`) — Inbox é desktop only.
- Persistência server-side da preferência.
- Animação do conteúdo interno do aside.
