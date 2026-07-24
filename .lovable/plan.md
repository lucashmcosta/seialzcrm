## Diagnóstico

Erro: `cannot add postgres_changes callbacks for realtime:inbox-threads-active-<orgId> after subscribe()`.

Em `src/hooks/inbox/useInboxThreads.ts` o canal Realtime usa um nome determinístico (`inbox-threads-${tab}-${organizationId}`). Sob StrictMode em dev ou remounts rápidos (troca de aba/onlyMine que muda deps do effect), o `supabase.removeChannel` da limpeza anterior ainda está em voo quando o novo effect roda `supabase.channel(nomeIgual)`. O supabase-js reaproveita a instância já existente para o mesmo `topic` — e essa instância já teve `.subscribe()` chamado, então os `.on('postgres_changes', ...)` do segundo mount estouram exatamente com a mensagem acima. Como o hook está dentro do `InboxPage`, o erro sobe até o `ErrorBoundary` e derruba a tela do Atendimento.

O mesmo padrão de nome determinístico existe em `src/hooks/useMessageThreads.ts` (`rpc-thread-updates-${orgId}`), mas ali só há um effect por org e sem `tab`/`onlyMine` mudando as deps, então não reproduz na prática. Mantemos o foco no ponto que está quebrando.

## Correção

Tornar o `topic` do canal único por instância do hook, de forma que um remount nunca colida com um canal ainda pendente de remoção.

### Alterações em `src/hooks/inbox/useInboxThreads.ts`

- Gerar um sufixo único por montagem do effect (ex.: `crypto.randomUUID()` calculado dentro do próprio `useEffect`, guardado em variável local).
- Compor o nome como `inbox-threads-${tab}-${organizationId}-${uid}`.
- Manter o restante do effect igual: os dois `.on('postgres_changes', ...)` continuam sendo chamados **antes** do `.subscribe()`, e a cleanup segue chamando `supabase.removeChannel(channel)` + `clearTimeout` do debounce.

Nenhuma mudança de comportamento funcional: o debounce de 1500 ms, os filtros por `organization_id` e o refetch permanecem idênticos. A única diferença é que cada ciclo de subscribe usa um `topic` novo, evitando o reuse interno do supabase-js.

## Fora de escopo

- Não mexer em `useMessageThreads.ts` (não há sintoma e o risco de regressão no Comercial não se justifica).
- Não alterar lógica de fetch, filtros de aba, contagem de filas ou UI da Inbox.
- Sem migrations, sem edge functions, sem docs.

## Verificação

1. Build passa.
2. Abrir `/inbox`, alternar entre abas (`active` / `waiting` / etc.) e o toggle "Somente meus" várias vezes seguidas — não deve mais aparecer o erro no console nem tela branca via ErrorBoundary.
3. Ao chegar uma nova mensagem, a lista continua atualizando após o debounce de 1,5s.