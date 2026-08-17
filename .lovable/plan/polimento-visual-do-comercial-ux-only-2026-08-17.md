# Polimento visual do Comercial (UX only)

Somente apresentação em `src/pages/messages/MessagesList.tsx`, `src/components/messages/route/RouteIndicators.tsx`, `src/components/messages/timeline/*` e `src/hooks/useThreadEndpointMap.ts` (leitura). Nada de SQL, RLS, Edge Function, envio, roteamento, realtime, agrupamento, colapso ou regras de negócio.

## 1. Badge do número na lista — consistência para todos os números

Causa verificada: o badge da lista vem de `useThreadEndpointMap`, que lê apenas `message_threads.primary_endpoint_id`. Quando essa coluna está nula na thread (caso de parte das conversas do 7020), `RouteBadge` recebe `address = null` e não renderiza nada — daí a diferença em relação ao 7067.

Correção (leitura adicional, sem escrita e sem mudar roteamento): em `useThreadEndpointMap`, para as threads em que `primary_endpoint_id` vier nulo, buscar o `endpoint_id` da última mensagem da thread (`message_threads.last_message_id` → `messages.endpoint_id`) e usar esse valor apenas para exibição. O `endpointFilter` da lista passa a se beneficiar do mesmo mapa, sem alteração de lógica.

Resultado: 7067, 7020, 7491 e qualquer outro número comercial exibem o mesmo chip `WhatsApp + últimos 4 dígitos`, com a mesma regra visual.

## 2. Cabeçalho do container em uma linha

No `blockHeader` (`MessagesList.tsx`, ~2340-2360): as duas linhas (`WhatsApp • Evolution` + `(11) 5028-7020`) passam a uma única linha centralizada:

```text
WhatsApp • Evolution • (11) 5028-7020
```

Canal/provider em `text-[11px] font-medium text-foreground`, `•` em `text-muted-foreground/50`, número em `font-data text-[11px] text-muted-foreground`. Abaixo do cabeçalho, uma régua extremamente sutil (`h-px bg-border/30 mt-1.5 mb-2`) separa cabeçalho e mensagens. Menos ~13px de altura por container.

## 3. Eventos da timeline sempre como separador discreto

Hoje "Contato auto-atribuído via round-robin" chega pela query de `activities` (`activity_type = 'note'`, `title = 'Atribuicao automatica'`, gravado por trigger) e cai no card amarelo de nota interna.

Classificação por TIPO do evento (nunca por autor): a mesma query de notas passa a ler também `title`, e uma lista de títulos/tipos sistêmicos conhecidos (`Atribuicao automatica`, distribuição/round-robin, automações) é renderizada como `TimelineEventMarker` (`──── Evento ────`). Notas internas escritas por pessoas continuam exatamente como hoje, no card amarelo.

Também padronizo a pílula de migração de endpoint (`bg-muted/70 rounded-full shadow-sm`, ~2418) para o mesmo `TimelineEventMarker`, com a linha de auditoria como `value`. Nenhum evento é adicionado, removido ou reordenado; nenhum filtro de query muda (mesma tabela, mesmos `eq`/`is`).

## 4. Acabamento dos containers (mais Kommo)

No `TimelineBlock` (`className` passado em `MessagesList.tsx` ~2715):

- borda mais discreta: `border-border/70` → `border-border/40`
- fundo levemente mais limpo: `bg-muted/50` → `bg-muted/30`
- sombra suave: acrescenta `shadow-sm`
- padding equilibrado: `px-2 py-2` → `px-3 py-2.5`
- menos espaço entre containers: `mt-4` → `mt-2.5`
- `rounded-lg` mantido (sem `rounded-xl`), para leitura mais corporativa

Espaçamento interno entre bolhas (`space-y-3` / agrupamento) permanece exatamente como está.

## 5. Lista de conversas — altura menor, uma linha de meta

Em `ChatListItem`:

- meta em linha única sempre que couber: `🟢 Aberta · ⚠ Atenção · Responsável`, com `truncate` no responsável — o bloco separado de "Atenção" (terceira linha) é removido e vira chip inline em `text-destructive`
- padding do item `py-3 pr-4 pl-3` → `py-2.5 px-3`, borda `border-border` → `border-border/60`
- badges (`RouteBadge`, ponto de não lidas, chip de atenção) com mesma altura visual e `gap-1.5`, todos `items-center`
- horário relativo em `text-[11px] text-muted-foreground`, alinhado ao topo da linha do nome
- ícones padronizados em 12px, mesmo peso e mesma cor `muted-foreground`


Nenhuma mudança de clique, seleção, filtro, ordenação ou queries da lista.

## Verificação

`tsgo --noEmit` + build. Conferência visual em `/commercial`: badge presente em conversas 7067 e 7020, cabeçalho de container em uma linha, evento de round-robin como separador, containers mais próximos e com sombra suave.
