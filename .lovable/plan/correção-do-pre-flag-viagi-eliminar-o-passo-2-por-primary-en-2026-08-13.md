# Correção do PRE-FLAG Viagi — eliminar o "passo 2" por primary_endpoint_id

## Achado da auditoria read-only

Auditei o código real do caminho V2:

- `supabase/functions/_shared/route-resolver.ts` — sequência única: última inbound com `endpoint_id` → `messaging_line_endpoints` (link ativo) → `messaging_lines` (org, channel, `inbox_key='sales'`, ativa) → `active_endpoint_id` apto. Sem inbound roteável → `REPLY_ROUTE_UNRESOLVED`. **Nenhuma leitura de `primary_endpoint_id`.**
- `src/lib/salesReplyRoute.ts` — espelho cliente, idêntico, também sem `primary_endpoint_id`.
- Dispatchers (`supabase/functions/_shared/dispatch-whatsapp-send.ts`, `src/lib/dispatchWhatsAppSend.ts`) — chamam o resolver ANTES de qualquer resolução legada; `REPLY_ROUTE_UNRESOLVED` aborta o envio. O bloco por linha/`primary_endpoint_id`/`purpose`/default `twilio` que existe abaixo só é alcançado quando o resolver responde `flag_off` / `not_sales_context` (caminho legado, Atendimento e orgs sem flag).

Conclusão: os 3.089 "resolvidos via primary_endpoint_id" **não vêm do código V2**. Vêm da minha consulta de shadow do PRE-FLAG, que media dois passos (inbound roteável + primary com link ativo) — a medição divergiu do contrato, não o resolver. Isso é uma correção de instrumentação, não de runtime.

## O que será feito

1. **Endurecer a medição (shadow)** — reescrever a consulta de PRE-FLAG para espelhar exatamente o contrato: um único caminho por última inbound roteável; ausência de inbound roteável classifica obrigatoriamente como `REPLY_ROUTE_UNRESOLVED`. A contagem `FALLBACK_PRIMARY_ENDPOINT` passa a ser derivada explicitamente (deve dar 0 por construção do resolver).
2. **Barreira estática anti-fallback no caminho V2** — teste automatizado que falha se `route-resolver.ts` ou `salesReplyRoute.ts` mencionarem `primary_endpoint_id`, `purpose` ou provider default fora de comentários. Trava a regressão sem alterar comportamento.
3. **Rerodar a bateria do resolver** (Deno tests do resolver + gate canônico) e confirmar `REPLY_ROUTE_UNRESOLVED` para thread sales sem inbound roteável, inclusive quando `primary_endpoint_id` está preenchido.
4. **Refazer o PRE-FLAG da Viagi** (read-only) com a consulta corrigida, medindo por endpoint histórico: 5098 → 8439, 2890 → 8439, 8439 → 8439, e regressão de Atendimento.

## Fora de escopo

- Não ligar `conv_route_resolver_v2` (flag permanece OFF durante toda a correção).
- Não criar índice unique, não tocar Atendimento, não iniciar Fase 3.
- Não alterar o caminho legado (que legitimamente usa linha/primary quando a flag está OFF).

## Entrega final

Somente o bloco:

```text
RESOLVEM=<n>
UNRESOLVED=<n>
FALLBACK_PRIMARY_ENDPOINT=0
5098_TO_8439=PASS/FAIL
2890_TO_8439=PASS/FAIL
ATENDIMENTO_REGRESSION=PASS/FAIL
FLAG=OFF
```

## Nota técnica

Se a nova medição confirmar ~3.089 threads sales sem nenhuma inbound com `endpoint_id`, essas conversas ficarão sem resposta possível quando a flag for ligada (fail-closed, por contrato). Ao entregar os números vou explicitar esse impacto operacional para você decidir o ON da Viagi.
