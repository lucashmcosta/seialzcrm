## Objetivo

Eliminar o "refetch storm" da Inbox que está sobrecarregando o banco — a query mais cara do sistema (126.000s totais em `pg_stat_statements`, 65 mil chamadas) é a listagem da Inbox, que hoje refaz a busca inteira a cada UPDATE de qualquer thread do org.

Mudanças **só de frontend**. Sem migrations, sem mexer em trigger, sem mexer no dashboard.

## Diagnóstico curto

`src/hooks/inbox/useInboxThreads.ts` faz:

```ts
.on('postgres_changes', { event: '*', schema: 'public', table: 'message_threads' }, () => {
  fetchThreads();
})
```

Sem filtro de organização e sem debounce. Como `fn_update_thread_last_message` dispara um UPDATE em `message_threads` a cada mensagem nova (inbound ou outbound), em horário de pico isso pode disparar dezenas de refetches por minuto **por usuário** com a Inbox aberta — cada refetch é a query mais pesada do banco.

`useInboxQueueCounts.ts` tem o mesmo padrão indireto via `refresh`.

## Mudanças

### 1. `src/hooks/inbox/useInboxThreads.ts`
- Adicionar **debounce de 1500ms** no `fetchThreads` disparado pelo realtime (mantém refetch manual imediato).
- Restringir o filtro do canal ao `organization_id` do usuário (passar `organizationId` como parâmetro novo do hook, vindo de `InboxPage`) usando a opção `filter: 'organization_id=eq.<id>'` do Supabase Realtime.
- Restringir `event` a `'UPDATE'` e `'INSERT'` (ignorar DELETE que praticamente não ocorre).

### 2. `src/hooks/inbox/useInboxQueueCounts.ts`
- O `InboxPage` chama `refreshCounts()` junto com `refreshThreads()` no `onThreadStatusChanged`. Adicionar debounce de 1500ms também nesse `refresh` para evitar enxurrada quando o usuário muda status em sequência.

### 3. `src/pages/inbox/InboxPage.tsx`
- Passar `organization?.id` para `useInboxThreads` (novo parâmetro).
- Sem mais nenhuma mudança visual ou funcional.

## O que NÃO vai mudar agora

- Trigger `fn_calc_message_response_time` — está correto e barato.
- Dashboard de Atendimento (`useServiceStats`) — caro mas só pesa quando alguém abre. Fica para uma segunda rodada se necessário.
- Crons (`integration-worker`, `intelligence-worker`) — não tocam em response time online.
- Nenhuma migration, nenhum índice nesta rodada.

## Como medir o ganho

Depois de aplicar:
1. Inbox continua atualizando praticamente em tempo real (atraso máximo 1,5s em vez de instantâneo — imperceptível pro usuário).
2. Em 24h, voltar em `pg_stat_statements` e conferir se a contagem de chamadas da query da Inbox caiu de ~65k para algo próximo de 1k–5k.

## Risco

Baixo. Tudo é reversível removendo o debounce. Não há mudança de schema, RLS, ou trigger.
