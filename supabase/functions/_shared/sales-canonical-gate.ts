// ============================================================
// _shared/sales-canonical-gate.ts
//
// GATE ÚNICO para o caminho canônico de inbound Comercial (Fase 2 / Etapa A).
//
// Os webhooks (Twilio / Meta / Evolution) só podem chamar
// `resolveSalesWhatsappThread()` quando TODAS as condições abaixo forem
// verdadeiras:
//
//   1. isSalesEndpoint(endpoint)  → purpose sales/commercial (exceção datada)
//   2. Route Comercial V2 válida  → messaging_line_endpoints (is_active)
//                                   → messaging_lines (org, channel,
//                                     inbox_key='sales', is_active,
//                                     active_endpoint_id IS NOT NULL)
//   3. feature_flags 'conv_route_resolver_v2' habilitada PARA A ORGANIZAÇÃO
//
// Qualquer condição falsa ⇒ `allowed: false` ⇒ o webhook executa o caminho
// LEGADO exatamente como hoje (lookup por primary_endpoint_id, criação atual,
// sem reopen, sem rotação canônica). Atendimento nunca passa da condição 1.
//
// Fail-closed: qualquer erro de lookup ⇒ legado.
// Este módulo NÃO escreve em nenhuma tabela e NÃO altera outbound.
// ============================================================

import { isSalesEndpoint } from "./sales-thread.ts";

type Db = {
  from: (table: string) => any;
};

export const SALES_CANONICAL_FLAG = "conv_route_resolver_v2";

export type SalesCanonicalGateReason =
  | "missing_input"
  | "not_sales_endpoint"
  | "no_route_v2"
  | "flag_off"
  | "allowed";

export type SalesCanonicalGateResult = {
  allowed: boolean;
  reason: SalesCanonicalGateReason;
  lineId: string | null;
};

function deny(
  reason: SalesCanonicalGateReason,
  lineId: string | null = null,
): SalesCanonicalGateResult {
  return { allowed: false, reason, lineId };
}

/**
 * Condição 2 — o endpoint pertence a uma Route Comercial V2 válida da org?
 * Comprovado via messaging_line_endpoints + messaging_lines (nunca inferido
 * a partir de communication_endpoints.purpose).
 */
async function resolveActiveSalesRoute(
  service: Db,
  organizationId: string,
  endpointId: string,
  channel: string,
): Promise<string | null> {
  const { data: links, error: linkErr } = await service
    .from("messaging_line_endpoints")
    .select("line_id")
    .eq("endpoint_id", endpointId)
    .eq("is_active", true);

  if (linkErr) {
    console.error("[sales-gate] route_link_lookup_error", {
      endpoint_id: endpointId,
      error: linkErr,
    });
    return null;
  }

  const lineIds = ((links ?? []) as Array<{ line_id: string | null }>)
    .map((l) => l.line_id)
    .filter((id): id is string => !!id);

  if (lineIds.length === 0) return null;

  const { data: lines, error: lineErr } = await service
    .from("messaging_lines")
    .select("id, active_endpoint_id")
    .in("id", lineIds)
    .eq("organization_id", organizationId)
    .eq("channel", channel)
    .eq("inbox_key", "sales")
    .eq("is_active", true);

  if (lineErr) {
    console.error("[sales-gate] route_line_lookup_error", {
      endpoint_id: endpointId,
      error: lineErr,
    });
    return null;
  }

  const valid = ((lines ?? []) as Array<{ id: string; active_endpoint_id: string | null }>)
    .filter((l) => !!l.active_endpoint_id);

  return valid[0]?.id ?? null;
}

/**
 * Condição 3 — flag habilitada para ESTA organização.
 * Semântica idêntica aos demais gates do projeto: is_enabled = true e
 * (organization_ids vazio = global) ou organization_ids contém a org.
 */
async function flagEnabledForOrg(service: Db, organizationId: string): Promise<boolean> {
  const { data, error } = await service
    .from("feature_flags")
    .select("is_enabled, organization_ids")
    .eq("name", SALES_CANONICAL_FLAG)
    .maybeSingle();

  if (error) {
    console.error("[sales-gate] flag_lookup_error", { error });
    return false;
  }
  const row = data as { is_enabled?: boolean | null; organization_ids?: string[] | null } | null;
  if (!row || row.is_enabled !== true) return false;
  const orgs = (row.organization_ids ?? []) as string[];
  return orgs.length === 0 || orgs.includes(organizationId);
}

/**
 * Avalia o gate. Único ponto autorizado a liberar o caminho canônico.
 */
export async function salesCanonicalPathEnabled(
  service: Db,
  args: {
    organizationId: string | null | undefined;
    endpointId: string | null | undefined;
    channel?: string;
  },
): Promise<SalesCanonicalGateResult> {
  const organizationId = args.organizationId ?? null;
  const endpointId = args.endpointId ?? null;
  const channel = args.channel ?? "whatsapp";

  if (!organizationId || !endpointId) return deny("missing_input");

  // 1) Contexto Comercial (purpose NULL / Atendimento → legado)
  if (!(await isSalesEndpoint(service, endpointId))) {
    return deny("not_sales_endpoint");
  }

  // 2) Route Comercial V2 válida
  const lineId = await resolveActiveSalesRoute(service, organizationId, endpointId, channel);
  if (!lineId) return deny("no_route_v2");

  // 3) Flag habilitada para a organização
  if (!(await flagEnabledForOrg(service, organizationId))) {
    return deny("flag_off", lineId);
  }

  const result: SalesCanonicalGateResult = { allowed: true, reason: "allowed", lineId };
  console.log("[sales-gate] canonical_gate", JSON.stringify({
    organization_id: organizationId,
    endpoint_id: endpointId,
    channel,
    ...result,
  }));
  return result;
}
