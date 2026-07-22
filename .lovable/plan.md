# Corrigir `endpoint_not_evolution` no envio via linha ativa

## Diagnóstico

O envio da thread da Yasmin falha com `{"error":"endpoint_not_evolution"}` retornado por `supabase/functions/evolution-whatsapp-send/index.ts:305`.

Fluxo real observado no código:

1. `MessagesList` chama `dispatchWhatsAppSend` sem `endpointId` explícito.
2. `src/lib/dispatchWhatsAppSend.ts` (bloco "Roteamento por LINHA", linhas 254‑338) resolve corretamente:
   - lê `thread.primary_endpoint_id` = Meta 2890, `business_context` = sales
   - deriva `lineKey = "commercial"`
   - lê `messaging_lines.active_endpoint_id` da Viagi para `commercial` = Evolution 8439
   - injeta `payload.endpointId = 8439` e roteia para `evolution-whatsapp-send`
3. Dentro de `evolution-whatsapp-send`, o bloco "defense-in-depth" (linhas 228‑252) sobrescreve `effectiveEndpointId` pelo `thread.primary_endpoint_id` = Meta 2890, ignorando o endpointId explícito e logando `endpoint_override_ignored`.
4. Carrega o endpoint Meta 2890 → `endpoint.provider !== 'evolution_api'` → retorna 400 `endpoint_not_evolution`.

A rotação por linha interna da função (linhas 264‑282) só dispara quando `endpoint.is_active === false`. O Meta 2890 continua ativo, então esse caminho de rescue não ajuda.

O mesmo padrão existe em `meta-whatsapp-send/index.ts` (linhas 217‑241) e `twilio-whatsapp-send/index.ts` (bloco `endpoint_override_ignored` em ~510‑530). Qualquer envio cross‑provider disparado pela linha ativa hoje é abortado pela função destino — o bug não é específico da Evolution, é sistêmico.

## Causa raiz

A regra "thread.primary sempre vence" nos três send functions foi escrita antes da restauração do roteamento por `messaging_lines`. Ela contradiz a arquitetura atual, em que a **thread guarda histórico** e a **linha ativa** define o número/provider de envio. O dispatcher já cumpre esse contrato; as edge functions destino precisam confiar no `endpointId` que ele resolveu.

## Correção proposta (a implementar quando aprovada)

Nas três functions `*-whatsapp-send`:

- Quando o caller enviar `endpointId` explícito, tratá‑lo como fonte de verdade após validar:
  - endpoint existe;
  - `organization_id` bate com o `organizationId` do payload;
  - `provider` bate com o provider da própria função;
  - `is_active = true`.
- Só cair no `thread.primary_endpoint_id` quando `endpointId` não vier no payload (comportamento legado preservado para chamadas antigas).
- Manter o log `endpoint_override_ignored`, mas trocá‑lo por `line_routing_honored` (info) quando o endpoint explícito diferir do primary, para preservar auditoria.
- Não mexer em `message_threads.primary_endpoint_id`. A thread continua sendo o histórico; a linha ativa continua definindo o envio; o "divisor de número trocado" na timeline já resolve a leitura visual.

Isso encerra o erro atual e restaura o comportamento pedido: trocar a linha ativa comercial da Viagi para Evolution 8439 faz toda thread comercial (incluindo as com primary Meta antigo) enviar pelo 8439 sem migração manual, sem perder histórico.

## Fora do escopo

- Não alterar dispatcher client‑side (já correto).
- Não alterar `thread-migrate-endpoint-send` nem `MessagesList`.
- Não mexer em `requires_template_outside_window` (independente).
- Nenhuma migration.
