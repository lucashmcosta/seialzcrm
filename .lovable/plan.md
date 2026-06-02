## Objetivo
Melhorar visual da lista de conversas em `InboxThreadList.tsx`:
1. Adicionar avatar circular com iniciais (cor derivada do nome) à esquerda de cada item.
2. Indicador claro de "não lido" (badge + nome em negrito + fundo destacado).
3. **Não marcar como lido ao clicar** — só fica lido depois que o operador responder.

## Definição de "não lido" (sem nova tabela)
Como o módulo Inbox ainda não tem tracking de read por usuário, vamos derivar do estado já existente: **`last_message_direction === 'inbound'`** significa que a última mensagem é do cliente e ainda não foi respondida → conversa não lida.

Vantagens:
- Não precisa de schema, RLS, migration nem backend.
- Satisfaz automaticamente o requisito #3: clicar não altera nada; só quando o operador envia uma resposta, `last_message_direction` vira `outbound` (via trigger existente) e a conversa some do estado "não lido".
- Funciona igual para múltiplos operadores na mesma fila.

## Mudanças em `InboxThreadList.tsx`

### 1. Avatar com iniciais
- Helper `initials(name)` (mesma lógica de `InboxThreadDetail`) + `colorFromName(name)` que hasheia para uma paleta fixa de 6 cores semânticas (sky, emerald, amber, rose, violet, orange) usando classes Tailwind com opacidade (ex.: `bg-emerald-500/15 text-emerald-700 dark:text-emerald-300`).
- Renderizar `<div className="h-10 w-10 rounded-full flex items-center justify-center text-xs font-semibold flex-shrink-0">` à esquerda do bloco de texto. Layout vira `flex gap-3`.

### 2. Indicador de não lido
Quando `isUnread = t.last_message_direction === 'inbound'`:
- **Nome em `font-semibold text-foreground`** (vs `font-medium` quando lido); preview da mensagem em `text-foreground` em vez de `text-muted-foreground`.
- **Badge numérico verde** à direita do timestamp: `<span className="min-w-[18px] h-[18px] px-1 rounded-full bg-emerald-500 text-white text-[10px] font-semibold flex items-center justify-center">●</span>` — como não temos contagem real de mensagens não respondidas, mostra apenas um dot/ponto verde sólido (estilo WhatsApp Web).
- **Borda esquerda mais grossa** (`border-l-4 border-l-emerald-500`) quando não lido e não selecionado, para destaque periférico.
- Remover o `isFresh` antigo (5min) — substituído pela lógica nova mais consistente.

### 3. Não marcar como lido no clique
- Nada a fazer: como o "não lido" é derivado de `last_message_direction`, clicar na conversa não altera nada no banco. O estado só muda quando o operador envia uma resposta (`InboxComposer` já atualiza a thread e dispara realtime).

## Fora do escopo
- `useInboxThreads.ts`, `inboxScope.ts`, backend, RLS, migrations.
- `InboxThreadDetail`, composer, timeline.
- Mobile.
- Tracking real per-user (não pedido; e o derivado já satisfaz o requisito).

## Arquivo afetado
- `src/components/inbox/InboxThreadList.tsx` (apenas).
