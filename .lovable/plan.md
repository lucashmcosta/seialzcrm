# Push: empilhar notificações por conversa (remover collapseId)

Hoje cada nova mensagem da mesma conversa substitui a notificação anterior no iPhone, porque o envio manda um identificador de "colapso" junto com o de agrupamento. O de colapso troca a notificação já exibida; o de agrupamento apenas empilha. Com os dois juntos, só sobra a última.

## O que muda

- Remover o campo de colapso do envio, mantendo apenas o agrupamento por conversa.
- Efeito: 3 mensagens seguidas do mesmo cliente geram 3 notificações, empilhadas por conversa, como no WhatsApp.

## O que não muda

- Fila, novas tentativas, cadência de 30s, autenticação do worker e desativação de tokens inválidos.
- Título, texto, som, prioridade, canal Android e o link de abertura da conversa (Comercial e Atendimento).

## Detalhes técnicos

- `supabase/functions/push-dispatch/index.ts`, no `messages.map` (~linha 138): remover `collapseId: job.thread_id`; manter `threadId: job.thread_id`.
- Republicar apenas a função `push-dispatch`.
- Validação: enviar duas mensagens seguidas na mesma conversa atribuída e confirmar duas notificações empilhadas no iPhone; conferir na fila que os dois jobs ficaram `sent`.
