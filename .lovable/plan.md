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

## Diff lógico do gate

Novo módulo `supabase/functions/_shared/sales-canonical-gate.ts` (gate único, sem lógica duplicada nos webhooks):

```ts
export const SALES_CANONICAL_FLAG = "conv_route_resolver_v2";

export type SalesCanonicalGateReason =
  | "missing_input" | "not_sales_endpoint" | "no_route_v2" | "flag_off" | "allowed";

export async function salesCanonicalPathEnabled(
  service, { organizationId, endpointId, channel = "whatsapp" }
): Promise<{ allowed: boolean; reason: SalesCanonicalGateReason; lineId: string | null }>
```

Ordem de avaliação: input → `isSalesEndpoint` → Route V2 → flag. `allowed` só é `true` com as três condições verdadeiras; qualquer negativa devolve o controle ao caminho legado. Log `[sales-gate] canonical_gate` quando liberado, e logs de erro em falha de lookup (fail-closed: erro ⇒ legado).

Cada webhook troca exatamente uma condição:

```diff
- if (await isSalesEndpoint(supabase, endpoint.id)) {
+ const gate = await salesCanonicalPathEnabled(supabase, {
+   organizationId: endpoint.organization_id, endpointId: endpoint.id });
+ if (gate.allowed) {
```

Call sites a alterar (mapeados):
- `meta-whatsapp-webhook/index.ts` (~842, passo 6)
- `twilio-whatsapp-webhook/index.ts` (~875, bloco `canonicalHandled`)
- `evolution-webhook/index.ts` (~644, `findOrCreateThread`)

`isSalesEndpoint` deixa de ser chamada diretamente pelos webhooks (passa a ser interna ao gate). `resolveSalesWhatsappThread` e todo o restante de `_shared/sales-thread.ts` ficam inalterados. Nada em outbound/dispatcher/templates/frontend é tocado.

## Como a flag por organização é consultada

Somente dentro do gate: `feature_flags` where `name = 'conv_route_resolver_v2'`, exigindo `is_enabled = true` e (`organization_ids` vazio = global **ou** contém a org). Mesma semântica de `_shared/route-resolver.ts` e `_shared/telephony/feature-flag.ts`. Estado real hoje (leitura já feita): `is_enabled = false`, `organization_ids = []` → **0 organizações habilitadas**, logo o gate reprova 100% dos inbounds mesmo após o deploy.

## Como a Route V2 é validada

Nunca por `purpose`. Duas leituras:
1. `messaging_line_endpoints` where `endpoint_id = <endpoint> AND is_active = true` → `line_id`s.
2. `messaging_lines` where `id IN (...) AND organization_id = <org> AND channel = <canal> AND inbox_key = 'sales' AND is_active = true AND active_endpoint_id IS NOT NULL`.

Sem linha válida ⇒ `no_route_v2` ⇒ legado.

## Testes T1–T10 (controlados, sem deploy)

Suíte Deno (`_shared/sales-canonical-gate.test.ts` + `sales-thread.test.ts`) com stub de banco em memória — nenhuma escrita em produção:

- **T1** Comercial + Route V2 + flag OFF ⇒ `flag_off`, legado.
- **T2** Comercial + Route V2 + flag ON para org controlada ⇒ `allowed`, canônico.
- **T3** Comercial sem Route V2 (sem vínculo ativo / line inativa / sem `active_endpoint_id`) + flag ON ⇒ `no_route_v2`, legado.
- **T4** endpoint Atendimento + flag ON ⇒ `not_sales_endpoint`, legado.
- **T5** `purpose` NULL ⇒ `not_sales_endpoint`, legado.
- **T6** thread sales canônica existente + flag ON ⇒ reutiliza a viva mais antiga; losers com `merged_into_thread_id` jamais selecionados.
- **T7** thread `resolved`/`closed` + flag ON ⇒ reopen (`status='open'`, `resolved_at=NULL`) + log `SALES_THREAD_REOPENED`.
- **T8** inbound por outro endpoint da mesma Route + flag ON ⇒ mesma thread + rotação de `primary_endpoint_id` + log `SALES_THREAD_ENDPOINT_ROTATED`.
- **T9** flag OFF ⇒ zero `SALES_THREAD_REOPENED`, zero `SALES_THREAD_ENDPOINT_ROTATED`, zero reuso/criação canônica; `resolveSalesWhatsappThread` não é invocada.
- **T10** Atendimento idêntico nos três providers (o gate reprova antes de qualquer desvio; verificação por asserção de que o helper canônico não é chamado).

Validação de código: `deno check` nos três webhooks; `rg` de todos os call sites de `resolveSalesWhatsappThread` e de `salesCanonicalPathEnabled` provando que não existe chamada ao helper canônico fora do gate; `rg` confirmando zero alteração em dispatchers/outbound.

## Fora de escopo nesta etapa

Sem deploy, sem trigger, sem índice unique, sem ligar a flag, sem habilitar organização, sem merge, sem Fase 3, sem alteração de outbound ou de banco.

