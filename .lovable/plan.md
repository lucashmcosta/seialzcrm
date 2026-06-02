## Remover coluna "Atendimento" e realocar controles

A coluna esquerda (220px com título "Atendimento", toggle "Apenas minhas" e abas Ativos/Aguardando/Concluídos hoje) está duplicando o que já existe na barra superior (ATIVOS 35 · AGUARDANDO 34 · CONCLUÍDOS HOJE 4) e tomando espaço da conversa. Vou removê-la inteiramente e transformar a barra superior no seletor de filas, com o toggle "Apenas minhas" ao lado.

### Mudanças

**1. `src/pages/inbox/InboxPage.tsx`**
- Remover `<InboxQueues />` do layout.
- A linha de colunas vira: `Lista de conversas` · `Conversa` · `Painel`.
- Passar `tab`, `onChange`, `onlyMine`, `onOnlyMineChange` para o `InboxMetricsBar` em vez de para o `InboxQueues`.

**2. `src/components/inbox/InboxMetricsBar.tsx` (rework)**
- Vira a barra de filas oficial — mesma altura (h-12), mesmo lugar.
- Cada item (Ativos / Aguardando / Concluídos hoje) vira um botão clicável:
  - inativo: `text-muted-foreground hover:text-foreground`
  - ativo: `text-foreground font-medium` com underline inferior `border-b-2 border-primary -mb-px` (encosta no border da barra)
- Layout: label maiúscula + número em `font-data` (mantém o que já existe), só adiciona estado ativo + clique.
- À direita da barra: toggle compacto `Apenas minhas` (Switch + label `text-[11px]`), separado por `ml-auto`.
- Padding lateral alinha com o conteúdo (`px-6`).

**3. `src/components/inbox/InboxThreadList.tsx`**
- Header da coluna fica enxuto: só "Conversas" + count (já está assim, sem alteração de estrutura).
- Aumentar largura `w-[300px]` → `w-[320px]` para aproveitar o espaço liberado.

**4. `src/components/inbox/InboxQueues.tsx`**
- Deixar o arquivo, mas não é mais importado em lugar nenhum (pode ser deletado em fase futura — não vou deletar agora para não quebrar nada externo).

### Fora de escopo
- Sem mudanças no composer, timeline, painel lateral, hooks, queries.
- Sem migration, edge functions.

### Resultado visual
- Conversa ganha ~220px de largura horizontal.
- Filtro de fila continua a um clique de distância na barra superior, agora destacando a fila atual.
- Toggle "Apenas minhas" continua acessível, no canto direito da barra superior.
