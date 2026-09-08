# Peça 2 — recusa terminal do envio deixa de travar a mensagem em "enviando"

## Diagnóstico (verificado no código)
- `supabase/functions/meta-whatsapp-send/index.ts:772-839` insere a mensagem com `whatsapp_status: "sending"` **antes** de baixar/validar a mídia.
- O `catch` final (linhas 1105-1119) já faz o certo: marca `whatsapp_status = "failed"`, grava `error_code`, `error_message` e o detalhe em `metadata.meta_cloud.error`.
- O problema está nos dois `return new Response(... 415 ...)` do guard de áudio (linhas 920-927 e 941-948): eles saem **antes** do `catch`, então a mensagem já criada fica em `sending` para sempre, sem motivo salvo. Foi exatamente o caso do áudio do celular às 19:28.
- Auditoria dos outros provedores: `evolution-whatsapp-send` (falha marcada nas linhas 557 e 599) e `twilio-whatsapp-send` (linha 1075) **não** têm saída antecipada entre o insert e o tratamento de falha — nada a corrigir neles.
- A UI já sabe exibir: `MessageStatusIndicator.tsx` mostra ícone de falha com o motivo legível quando `whatsapp_status = 'failed'`, e as duas listas (`src/pages/messages/MessagesList.tsx`, `src/components/mobile/MobileMessagesList.tsx`) já leem `error_message`.

## Correção proposta (mínima, isolada do codec)
1. Criar no `meta-whatsapp-send` um helper único de encerramento terminal — algo como `finishTerminal(messageId, { status, code, reason, details })` — que:
   - atualiza a mensagem para `failed` com `error_code`, `error_message` e o detalhe em `metadata`, no mesmo formato que o `catch` já usa (nenhum campo novo, nenhuma migração);
   - devolve a resposta HTTP com o status original (415), preservando o corpo atual (`error`, `message`, `details`).
2. Trocar apenas os dois `return new Response(...)` do guard de áudio por esse helper. **A decisão de aceitar ou recusar codec não muda em nada** — o parser MP4/M4A, a normalização de alias e o caminho OGG/Opus do Web ficam idênticos.
3. Reaproveitar o mesmo helper no `catch` final, para que exista um único ponto que persiste falha (mesmo comportamento de hoje, sem mudança de semântica).

## O que explicitamente não muda
- Caminho de sucesso: `sending` → `sent` (linha 1028) e a evolução para `delivered`/`read` pelo webhook continuam intactos.
- Nenhuma recusa transitória passa a ser marcada antes da hora: só as saídas que **já hoje** encerram a requisição definitivamente passam a gravar `failed`. Erros da Graph (rate limit, 5xx) seguem exatamente pelo `catch` atual, sem alteração — não existe mecanismo de retry automático nesse envio que possa ser marcado prematuramente.
- Sem mudança em `audio/webm`, no sanitizador OGG do Web, na Peça 1 ou nos outros provedores.

## Testes antes de concluir
| Caso | Esperado |
|---|---|
| Envio de áudio recusado pelo guard (MP4 com Opus / arquivo truncado) | resposta 415 e mensagem gravada como `failed` |
| Mesma mensagem no banco | `error_code`/`error_message` preenchidos e motivo visível na conversa |
| Envio válido (OGG/Opus do Web) | `sending` → `sent` → `delivered`, sem regressão |
| Falha transitória da Graph | continua no comportamento atual, sem marcação antecipada |

Verificação em produção com envio real controlado: um áudio recusado (mostrando a mensagem com falha e o motivo na conversa) e um áudio válido em seguida (mostrando entrega normal).

## Detalhes técnicos
- Arquivo alterado: `supabase/functions/meta-whatsapp-send/index.ts` (helper novo + substituição dos dois `return` do guard e reuso no `catch`).
- Sem migração de banco, sem alteração de frontend, sem novo campo.
- Deploy explícito da função e registro no drift do dia.
