## Acabamento da tela de Atendimento — pacote enxuto

Três ajustes visuais, sem mudanças de lógica, dados ou consultas.

### 1. Chips de status nas conversas (lista da esquerda)

Em `src/components/inbox/InboxThreadList.tsx`, substituir os chips monocromáticos atuais (`open`, `customer`, `não atribuída`, `CS endpoint`) por pílulas coloridas, traduzidas e com pontinho indicador:

- `open` → **Aberta** — verde (`bg-emerald-500/15 text-emerald-700 dark:text-emerald-300`) + dot pulsante
- `pending` → **Aguardando** — âmbar
- `resolved` → **Resolvida** — slate
- `closed` → **Fechada** — slate
- `customer` (lifecycle) → **Cliente** — azul suave (`bg-sky-500/15 text-sky-700`)
- não atribuída → **Sem dono** — amarelo
- `CS endpoint` → removido daqui (já aparece no header da conversa); reduz ruído visual

Formato unificado: `rounded-full px-2 py-0.5 text-[10px] font-medium` com dot `w-1.5 h-1.5 rounded-full` à esquerda. Mesmas cores reaproveitadas no chip `Cliente` do header (`InboxThreadDetail.tsx`) para consistência.

### 2. Balão de Nota Interna em largura total

Em `src/components/inbox/InboxConversationTimeline.tsx`, separar o estilo da nota interna do estilo das mensagens normais:

- Hoje a nota usa `max-w-[78%]` centralizada → fica um quadrado estreito e descolado.
- Passar a renderizar a nota como **faixa horizontal de largura total** dentro do `max-w-3xl` do timeline: `w-full`, padding `px-4 py-2.5`, borda lateral esquerda âmbar de 3px (`border-l-[3px] border-amber-400`), fundo `bg-amber-50/70 dark:bg-amber-950/30`, cantos `rounded-lg`, label "NOTA INTERNA · {autor}" inline à esquerda com o conteúdo ao lado e horário à direita.
- Tira o `items-center` no wrapper da nota → usa `items-stretch` para ocupar a coluna toda.
- Mantém ícone `Note` discreto no início para diferenciar de uma mensagem comum.

### 3. Toques de vida (escopo curto)

- Lista de conversas: dot verde pulsante (`animate-pulse`) ao lado do nome quando `last_message_direction === 'inbound'` e mensagem foi nos últimos 5 min (sinal de "novo").
- Item selecionado: barra vertical primária de 2px à esquerda (`border-l-2 border-primary`) em vez de só mudar o fundo — dá hierarquia.
- Hover dos chips: leve `transition-colors` para suavizar.
- Avatar do header: gradiente sutil em vez de cor chapada (`bg-gradient-to-br from-primary/20 to-primary/5`).

### Fora de escopo

Composer, hooks, queries, RLS, migrations, edge functions, sidebar direita. Nada de novas dependências.

### Arquivos tocados

- `src/components/inbox/InboxThreadList.tsx`
- `src/components/inbox/InboxConversationTimeline.tsx`
- `src/components/inbox/InboxThreadDetail.tsx` (apenas chip "Cliente" + avatar gradient)
