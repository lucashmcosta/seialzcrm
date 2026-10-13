# Ligação para celular salvo sem o 9

## Diagnóstico (confirmado no código)
- Contato salvo como +55 79 8107-7198 (sem o 9).
- **WhatsApp funciona** sem nenhum desvio nosso: o próprio WhatsApp identifica muitas contas brasileiras antigas pelo número sem o 9 e entrega a mensagem igual. O Seialz só repassa o número.
- **Ligação falha** porque a preparação do número antes de discar (`normalizeE164BR`, em `_shared/telephony/twilio.ts`) só coloca "+55" e não acrescenta o 9. A operadora recusa celular brasileiro com 8 dígitos.

## O que muda
- Só na hora de **ligar**: se o número for brasileiro de celular sem o 9 (+55 + DDD + 8 dígitos começando com 6, 7, 8 ou 9), o sistema disca já com o 9 (+55 79 98107-7198).
- Fixos (começando com 2 a 5) continuam como estão.
- O cadastro do contato **não é alterado**, e o envio de WhatsApp continua exatamente igual (mexer nele poderia quebrar a entrega para contas antigas).

## Detalhe técnico
- `normalizeE164BR`: após montar `+55...`, se tiver 12 dígitos e o 5º dígito (primeiro após o DDD) estiver em 6–9, inserir `9` após o DDD.
- Aplica-se a `telephony-call-intent` (que já usa essa função) e conferir `twilio-call` para usar a mesma regra.
- Teste Deno cobrindo: celular sem 9, celular com 9, fixo, número estrangeiro.
- Republicar as duas funções de ligação. Sem mudança no banco.
