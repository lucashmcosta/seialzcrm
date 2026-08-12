# Fase 2 — Etapa A.1: gate de 3 condições antes do caminho canônico Comercial

Hoje os três webhooks entram no caminho canônico apenas com `isSalesEndpoint()` (purpose do endpoint). Isso é insuficiente: se deployado assim, produção mudaria de comportamento imediatamente (reuso por org+contact, reopen, rotação de `primary_endpoint_id`) mesmo com a flag OFF.

Esta etapa adiciona um único gate compartilhado que exige as três condições e, quando qualquer uma falha, devolve o controle ao caminho legado inalterado.

## Contrato do gate

Entra no caminho canônico somente se TODAS forem verdadeiras:

1. **Contexto Comercial** — `communication_endpoints.purpose` do endpoint do inbound ∈ {`sales`, `commercial`} (mantém a exceção datada do endpoint legado já existente em `isSalesEndpoint`).
2. **Route Comercial V2 válida** — existe `messaging_line_endpoints (endpoint_id = <endpoint>, is_active = true)` ligado a `messaging_lines` com `organization_id = <org>`, `channel = 'whatsapp'`, `inbox_key = 'sales'`, `is_active = true` e `active_endpoint_id IS NOT NULL`.
3. **Flag habilitada para a org** — `feature_flags.name = 'conv_route_resolver_v2'` com `is_enabled = true` E (`organization_ids` vazio OU contém a org).

Estado atual verificado (read-only): flag `is_enabled = false`, `organization_ids = []` → **nenhuma organização habilitada**, logo o gate reprova em 100% dos inbounds após o deploy.

Falha em qualquer condição ⇒ caminho legado byte-a-byte: lookup atual por `primary_endpoint_id`, criação atual, sem reopen, sem rotação canônica, sem reuso por org+contact. Atendimento nunca passa pela condição 1.

## Diff lógico

Novo helper em `supabase/functions/_shared/sales-thread.ts` (mesma unidade, sem duplicar nos webhooks):

```ts
export type SalesCanonicalGateReason =
  | "not_sales_endpoint" | "no_route_v2" | "flag_off" | "allowed";

export async function salesCanonicalPathEnabled(
  service, { organizationId, endpointId }
): Promise<{ allowed: boolean; reason: SalesCanonicalGateReason; lineId: string | null }>
```

Ordem de avaliação (mais barata/decisiva primeiro): purpose → route V2 → flag. Loga uma linha `[sales-thread] canonical_gate` com `reason`, org, endpoint e `line_id` — permitindo medir na Etapa B quantos inbounds *entrariam* no caminho novo sem que nada mude.

Cada webhook troca exatamente uma condição:

```diff
- if (await isSalesEndpoint(supabase, endpoint.id)) {
+ const gate = await salesCanonicalPathEnabled(supabase, {
+   organizationId: endpoint.organization_id, endpointId: endpoint.id });
+ if (gate.allowed) {
```

Call sites a alterar (todos já mapeados):
- `meta-whatsapp-webhook/index.ts` (~linha 842, passo 6)
- `twilio-whatsapp-webhook/index.ts` (~linha 875, bloco `canonicalHandled`)
- `evolution-webhook/index.ts` (~linha 644, `findOrCreateThread`)

`isSalesEndpoint` permanece exportada e passa a ser usada internamente pelo gate. Nenhuma alteração em envio/outbound, `dispatch-whatsapp-send`, templates ou frontend.

## Onde a flag é consultada

Somente dentro de `salesCanonicalPathEnabled`, via leitura direta de `feature_flags` (mesma semântica já usada por `_shared/route-resolver.ts` e `_shared/telephony/feature-flag.ts`: `is_enabled` + `organization_ids` vazio = global). Nenhum webhook lê a flag diretamente.

## Testes (controlados, sem deploy)

`deno check` nos três webhooks + `rg` de call sites (garantir zero chamada direta a `resolveSalesWhatsappThread` fora do gate).

Bateria em transação com **ROLLBACK** (dados sintéticos), avaliando o gate por consulta ao mesmo predicado SQL e simulando o inbound:

- **a)** flag OFF (estado real de produção) ⇒ `reason = flag_off`, caminho legado.
- **b)** flag ON para org sintética (`organization_ids = [orgSint]`) + endpoint sales com Route V2 ⇒ `reason = allowed`, caminho canônico (reuso/reopen/rotação).
- **c)** endpoint `customer_service` com flag ON ⇒ `reason = not_sales_endpoint`, legado.
- **d)** endpoint sales sem vínculo ativo em `messaging_line_endpoints` (ou line inativa) com flag ON ⇒ `reason = no_route_v2`, legado.
- **e)** nenhuma tabela/coluna de outbound tocada — prova por inspeção do diff (0 chamadas a funções de envio) e por ausência de escrita em `messages` outbound na bateria.

Ao final: ROLLBACK, zero dado sintético persistido, flag restaurada a `is_enabled = false, organization_ids = []`.

## Fora de escopo nesta etapa

Sem deploy, sem trigger `trg_zz_guard_sales_thread_canonical`, sem índice unique parcial, sem ligar `conv_route_resolver_v2`, sem Fase 3.
