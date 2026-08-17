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

Canal/provider em `text-[11px] font-medium text-foreground`, número em `font-data text-[11px] text-muted-foreground`, separadores `•` em `text-muted-foreground/50`, `pb-1` no lugar do bloco de duas linhas. Menos ~13px de altura por container.

## 3. Eventos da timeline sempre como separador discreto

Hoje o texto "Contato auto-atribuído via round-robin" chega pela query de `activities` (`activity_type = 'note'`, criado por trigger sem usuário) e é renderizado no card amarelo de nota interna.

Ajuste puramente visual: notas sem autor (`created_by_user_id === null`) são classificadas como evento de sistema e renderizadas com `TimelineEventMarker` (`──── Evento ────`), igual a "Conversa criada" e "Ver mais mensagens". Notas escritas por pessoas continuam no card amarelo, inalteradas.

Também padronizo a pílula de migração de endpoint (`bg-muted/70 rounded-full shadow-sm`, ~2418) para o mesmo `TimelineEventMarker`, com a linha de auditoria como `value`. Nenhum evento é adicionado, removido ou reordenado.

## 4. Acabamento dos containers (mais Kommo)

No `TimelineBlock` (`className` passado em `MessagesList.tsx` ~2715):

- borda mais discreta: `border-border/70` → `border-border/40`
- fundo levemente mais sutil e uniforme: `bg-muted/50` → `bg-muted/40`
- sombra suave em vez de borda dura: acrescenta `shadow-sm`
- padding equilibrado: `px-2 py-2` → `px-3 py-2.5`
- menos espaço entre containers: `mt-4` → `mt-2.5`
- cantos: `rounded-lg` → `rounded-xl`, reforçando a sensação de cartões empilhados

Espaçamento interno entre bolhas (`space-y-3` / agrupamento) permanece exatamente como está.

## 5. Lista de conversas — refinos

Em `ChatListItem`:

- linha 2 (status · responsável) ganha `mt-1` e ícones/pontos alinhados por `items-center` consistente
- badges (`RouteBadge`, ponto de não lidas, "Atenção") passam a compartilhar a mesma altura visual e `gap-1.5`
- "Atenção" vira chip discreto na mesma linha do status, evitando a terceira linha e o pulo de altura entre itens
- padding do item `py-3 pr-4 pl-3` → `py-2.5 px-3`, borda `border-border` → `border-border/60`
- horário relativo em `text-[11px] text-muted-foreground` para não competir com o nome

Nenhuma mudança de clique, seleção, filtro, ordenação ou queries da lista.

## Verificação

`tsgo --noEmit` + build. Conferência visual em `/commercial`: badge presente em conversas 7067 e 7020, cabeçalho de container em uma linha, evento de round-robin como separador, containers mais próximos e com sombra suave.
