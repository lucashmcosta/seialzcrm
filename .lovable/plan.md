# Resolver / Reabrir conversa na Inbox

## Objetivo
Permitir que o atendente finalize (ou reabra) oficialmente um atendimento direto pela tela `/inbox`, reaproveitando exatamente a mesma mutação que já existe em `/messages` (`MessagesList.handleResolve` / `handleReopen`).

## Escopo (apenas frontend)

### 1. `src/components/inbox/InboxThreadDetail.tsx`
- Adicionar dois handlers locais:
  - `handleResolve()` → `UPDATE message_threads SET status='resolved', resolved_at=now() WHERE id = thread.id`
  - `handleReopen()` → `UPDATE message_threads SET status='open', resolved_at=null WHERE id = thread.id`
- Ambos usam `supabase` client direto (mesmo padrão do `handleAssign` que já existe no arquivo) e chamam `refresh()` ao fim + `toast` (sonner) de sucesso/erro.
- Estado `resolving` para desabilitar botão durante a request.
- Confirmação via `ConfirmDialog` (`@/components/ui/confirm-dialog`) antes de resolver — reabrir pode ser direto.

### 2. UI do botão (mesmo header já existente)
No bloco direito do header (onde estão `WhatsAppWindowChip`, `InboxSlaChip` e o chip de status), adicionar um botão à direita do chip de status:

- Se `thread.status === 'resolved' | 'closed'` → botão **"Reabrir"** (ghost, ícone `ArrowCounterClockwise` do phosphor).
- Caso contrário → botão **"Resolver"** (primary discreto, ícone `Check` do phosphor, size `xs`).

Estilo: usar `Button` de `@/components/ui/button` com `size="sm"` e `variant="outline"` (resolver) / `variant="ghost"` (reabrir), em linha com os chips, sem quebrar layout.

### 3. Refresh de contadores e lista
- `InboxThreadDetail` já chama `refresh()` do `useInboxThread` após a mutação, o que atualiza o thread local.
- Para atualizar a lista lateral e os contadores ("Ativos", "Aguardando", "Concluídos hoje") do `InboxMetricsBar`, expor um callback opcional `onThreadStatusChanged` em `InboxThreadDetail` e ligar em `InboxPage.tsx` para chamar `refresh` de `useInboxQueueCounts` e `useInboxThreads` (ambos já expõem refresh internamente — adicionar exposição se necessário).
- Realtime de `message_threads` UPDATE já existe em `useInboxThread`, então o chip de status atualiza sozinho.

## Fora de escopo
- Nenhuma mudança em SQL, RLS, triggers ou edge functions.
- Nenhuma mudança em `/messages` (segue funcionando igual).
- Nenhuma mudança em `InboxComposer` (ele já bloqueia envio quando `status='resolved'`).
- Mobile (`InboxPage` mobile é placeholder).

## Arquivos tocados
- `src/components/inbox/InboxThreadDetail.tsx` (handlers + botão)
- `src/pages/inbox/InboxPage.tsx` (passar callback de refresh para lista/contadores)
- Possivelmente `src/hooks/inbox/useInboxThreads.ts` (expor `refresh` se ainda não exposto)

## Validação
- Resolver uma conversa "Aberta" → some de "Ativos", aparece em "Concluídos hoje", composer bloqueia envio, chip vira "Resolvida".
- Reabrir → volta para "Ativos", composer libera, chip volta para "Aberta".
- Toast de sucesso em ambos os casos.
