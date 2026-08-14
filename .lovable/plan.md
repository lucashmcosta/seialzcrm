# Timeline única do Comercial (conceito Kommo)

Remodelação da renderização da timeline em `/commercial` (`src/pages/messages/MessagesList.tsx`) + `src/lib/messageGrouping.ts`. Nenhuma alteração de banco, envio, realtime, providers ou regra de negócio. Somente leitura de dados já existentes.

## Conceito

A conversa passa a ser uma linha do tempo contínua: mensagens em cartões de contexto empilhados e, entre eles, marcos históricos do CRM em separadores finos e discretos. As mensagens continuam o foco; eventos são apenas marcos.

## Eventos incluídos nesta fase

Confirmado como legível pelo app (RLS + grants verificados):

1. **Conversa criada** — `message_threads.created_at` da thread selecionada (dado já carregado, sem query nova).
2. **Atendimento** — `thread_assignment_history` da thread (leitura nova, somente `SELECT`, escopo por `thread_id`):
   - `manual_assignment` → "Atendente definido: — → Maria" / "Atendente alterado: Maria → João"
   - `take_over` → "Atendimento assumido por João"
   - `auto_reassign` → "Atendente alterado automaticamente: Maria → João"
   - `reopen` → "Atendimento reaberto"
   Nomes resolvidos via join em `users` (`from_user_id`, `to_user_id`, `performed_by_user_id`).
3. **Número de resposta alterado** — já existe hoje (derivado de `endpoint_id`), apenas ganha o novo estilo de separador (`7067 → 7020`).
4. **Migração de endpoint / mensagens de sistema** — já existem, passam a usar o mesmo estilo de separador.

Fora desta fase (decidido): etapa alterada, tags, sinais de IA (`sales_events`).

## Separador de evento (novo componente)

`src/components/messages/timeline/TimelineEventMarker.tsx`:

- linha horizontal fina de cada lado (`border-border/50`), rótulo central de baixa altura;
- rótulo: `text-[11px] text-muted-foreground`, ícone opcional 12px, valores `de → para` em `font-data`;
- altura total ~20px, margens `my-2`;
- sem balão, sem fundo colorido, sem sombra;
- horário do evento em `text-[10px]` ao lado do rótulo.

Nada de emoji: os ícones vêm do sistema de ícones já usado no projeto.

## Cartões de contexto (remodelados)

- Aparência de cartões empilhados: `rounded-lg border border-border/40 bg-card/40 shadow-sm`, com uma borda superior sutil deslocada (pseudo-empilhamento via `before:` de 1px, `border-border/25`) para dar a sensação de pilha do Kommo.
- Cabeçalho mínimo, sem competir com as mensagens: uma linha só — `WhatsApp • (11) 5026-2890` (+ provider quando não for o padrão) em `text-[10px] text-muted-foreground`, alinhado à esquerda.
- Padding `px-2 py-2`, `space-y-1` entre bolhas, `mt-3` entre cartões.

## Quebra de bloco

Em `computeContextBlocks()`, além das quebras atuais (endpoint, provider, mudança de dia, "Número alterado", nota interna, evento de sistema), **qualquer evento de CRM fecha o bloco** e a próxima mensagem abre um novo cartão. Isso é obtido tratando o novo tipo `kind: 'event'` como não-mensagem, igual às notas.

O agrupamento interno de bolhas (`computeMessageGroups`, janela de 5 min) não muda.

## Demais regras já atendidas

- Data só aparece na mudança de dia (comportamento atual, mantido); o separador de data passa a usar o mesmo estilo fino dos marcos, para leitura homogênea.
- Horário permanece dentro da bolha, na última mensagem do grupo.
- Agrupamento de mensagens consecutivas do mesmo remetente permanece: nome/identidade só no cabeçalho do cartão, horário/status só no fim do grupo.
- Hover, responder, copiar, encaminhar, menu contextual, seleção, áudio player e realtime: intactos.

## Técnico

- `src/pages/messages/MessagesList.tsx`
  - novo estado `timelineEvents` + carga no mesmo `fetchMessages` (um `SELECT` em `thread_assignment_history` por thread, `order by created_at`);
  - `ChatItem` ganha a variante `{ _type: 'event' }`; a ordenação cronológica existente passa a considerar `created_at` do evento;
  - o marco "Conversa criada" é injetado a partir do `created_at` da thread selecionada;
  - descritores do pré-passe recebem `kind: 'event'`;
  - eventos são renderizados como `loose` (fora dos cartões), como já ocorre com notas e sistema.
- `src/lib/messageGrouping.ts`: `GroupingItem.kind` aceita `'event'`; nenhuma outra regra alterada.
- `tests/message-grouping.test.ts`: casos novos — evento de CRM quebra bloco; mensagens antes/depois do evento ficam em cartões distintos; evento não entra em grupo de bolhas.

## Verificação

- `tsgo` limpo e suíte de testes.
- Validação visual sua no preview autenticado em `/commercial`: timeline contínua, marcos finos entre cartões, sem repetição de identidade dentro do cartão.
