# Corrigir crash na inicialização do dispositivo de voz

## Diagnóstico (confirmado no código e nos breadcrumbs)

O Sentry aponta `TypeError: undefined is not an object (evaluating 'oe.message')` em `initializeDevice` (`src/contexts/OutboundCallContext.tsx`, linha 900).

Sequência observada nos breadcrumbs:

```text
18:32:47  initializeDevice START  -> device.register()
18:41:24  [OutboundCall] Device registration timeout   (timeout de 10s já havia estourado)
18:41:24  Twilio Device unregistered
18:41:24  Device initialization error: undefined   <-- rejeição com valor nulo
18:41:24  TransportError (31009): No transport available
18:41:24  TypeError: undefined is not an object
```

O log `Device initialization error: null` prova que `device.register()` rejeitou com `null`/`undefined` (falha de transporte WebSocket do Twilio). O `catch` faz `error.message` diretamente, então a leitura da propriedade estoura antes de qualquer tratamento — o erro real (transporte indisponível) é substituído por um TypeError.

Existe o mesmo padrão frágil no handler `device.on('error')` (linha 844) e em outros pontos do arquivo que assumem `error.message`.

## O que fazer

1. Em `src/contexts/OutboundCallContext.tsx`, usar o helper já existente `toErrorMessageString` de `src/lib/errorMessage.ts` nos pontos que hoje leem `error.message` sem guarda:
   - `catch` de `initializeDevice` (linha ~900) — fallback "Erro ao inicializar chamada".
   - handler `device.on('error')` (linha ~844) — fallback "Erro no dispositivo de áudio".
   - handlers de chamada nas linhas ~683 e ~694 (mesmo padrão, `error?.message` / `error.message`).
2. Nesse mesmo `catch`, quando a rejeição for vazia mas o Twilio já tiver reportado transporte indisponível (código 31009), exibir mensagem de rede em vez de mensagem genérica, para o usuário entender que é conectividade e não falha do CRM.
3. Garantir limpeza do `initTimeoutRef` no caminho de falha, evitando que o timeout dispare depois e sobrescreva o estado de erro.

## Observação

Isto corrige apenas o crash de leitura e a mensagem exibida. A causa raiz da falha de conexão (WebSocket do Twilio Voice sem transporte por ~9 minutos naquela sessão) é de rede/ambiente e não é alterada por este ajuste; após a correção, o Sentry passará a registrar o `TransportError` real em vez do TypeError.
