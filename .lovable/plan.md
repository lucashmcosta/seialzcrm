# Atendimento: mensagens novas não aparecem (Rosemeire / Luyza)

## Diagnóstico (confirmado no banco)

A thread de Atendimento da Rosemeire Bispo de Andrade
(`fc2d708f-…`, endpoint 7027) tem **509 mensagens** vivas.

O carregamento da conversa no Inbox busca as mensagens assim
(`src/hooks/inbox/useInboxThreadMessages.ts:47-48`):

```text
.order('sent_at', { ascending: true })
.limit(500)
```

Ordem crescente + limite 500 = o banco devolve as **500 mais antigas** e
descarta as 9 mais recentes. Por isso a tela para exatamente em
"Ele mandou" (01/09 11:52) e não mostra:

- as respostas da Luyza de 01/09 (11:56, 12:02, 12:08) — todas `delivered`;
- as mensagens da cliente de 02/09 (07:15 "Bom dia", 07:50 "Demora a resposta");
- a nota interna da Luyza de 02/09 10:35.

Nada foi perdido: as mensagens existem, estão entregues e não estão
apagadas. É só a janela de leitura da UI. Qualquer conversa que passe de
500 mensagens vai apresentar o mesmo sintoma (o painel lateral mostra
"Última msg 02/09 07:50" porque lê outra fonte, o que expõe a divergência).

## Correção proposta (mínima)

1. `src/hooks/inbox/useInboxThreadMessages.ts`: buscar as mensagens **mais
   recentes** e inverter no cliente — `.order('sent_at', { ascending: false })`
   com limite, e `data.reverse()` antes do `setMessages`. Assim a conversa
   sempre termina na última mensagem real.
2. Elevar a janela de 500 para 800 mensagens, mantendo o custo baixo e
   cobrindo com folga as conversas longas atuais.
3. Manter o realtime como está (INSERT já faz append no fim, UPDATE já
   atualiza no lugar).

Sem mudança de schema, de RLS, de Edge Function ou de regra de negócio.
Sem mexer em Messages (Comercial), que usa outro hook.

## Validação

- Abrir a thread da Rosemeire no Atendimento e conferir que as respostas da
  Luyza, o "Bom dia"/"Demora a resposta" e a nota interna aparecem, com a
  timeline terminando na última mensagem.
- Conferir uma thread curta para garantir que a ordem cronológica
  (mais antiga no topo) continua correta.
- Enviar uma mensagem nova e confirmar que ela entra no fim via realtime.

## Observação (fora deste escopo)

Se você quiser, num passo seguinte dá para trocar a janela fixa por
paginação "carregar mensagens anteriores" ao rolar para o topo — resolve
de forma definitiva para threads muito longas.
