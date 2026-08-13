// ============================================================================
// Route Resolver V2 — CAMINHO CANÔNICO DE RESPOSTA (Comercial / WhatsApp)
//
// Contrato (Fase 2, atrás da flag `conv_route_resolver_v2` por organização):
//
//   1. Atua SOMENTE em thread Comercial (business_context = 'sales') e
//      channel = 'whatsapp'. Qualquer outro contexto → { applicable: false,
//      reason: 'not_sales_context' } e o caller mantém 100% o caminho legado
//      (Atendimento nunca entra aqui).
//   2. Flag OFF para a organização → { applicable: false, reason: 'flag_off' }.
//   3. A resposta parte da THREAD. A Route é descoberta pela ÚLTIMA MENSAGEM
//      INBOUND ROTEÁVEL da thread (messages.endpoint_id != null):
//        messages(last inbound).endpoint_id
//          → messaging_line_endpoints (is_active) → line_id
//          → messaging_lines (org, channel, inbox_key='sales', is_active)
//          → envio por messaging_lines.active_endpoint_id
//      O endpoint histórico serve APENAS para descobrir a Route; ele pode
//      estar inativo.
//   4. O endpoint ativo da Route precisa estar tecnicamente apto
//      (communication_endpoints.is_active = true, provider suportado).
//   5. Qualquer etapa sem resultado → REPLY_ROUTE_UNRESOLVED.
//
// PROIBIDO neste caminho (fail-closed, sem fallback silencioso):
//   • message_threads.primary_endpoint_id
//   • communication_endpoints.purpose
//   • provider default (twilio)
//   • "Route sales ativa única da organização"
//   • re-rota fixa por organização
// ============================================================================

// deno-lint-ignore no-explicit-any
type Db = { from: (table: string) => any };

export const ROUTE_RESOLVER_FLAG = "conv_route_resolver_v2";

export type SalesReplyProvider = "twilio" | "meta_cloud_api" | "evolution_api";

export type SalesReplyRouteReason =
  | "missing_input"
  | "not_sales_context"
  | "flag_off"
  | "resolved_by_last_inbound_endpoint"
  | "REPLY_ROUTE_UNRESOLVED";

export interface SalesReplyRouteInput {
  organizationId?: string | null;
  threadId?: string | null;
  businessContext?: string | null;
  channel?: string | null;
}

export interface SalesReplyRouteResult {
  applicable: boolean;
  reason: SalesReplyRouteReason;
  lineId: string | null;
  routeSlug: string | null;
  sendEndpointId: string | null;
  provider: SalesReplyProvider | null;
  /** Endpoint histórico da última inbound que descobriu a Route (observabilidade). */
  discoveredByEndpointId: string | null;
}

function deny(
  reason: SalesReplyRouteReason,
  extra: Partial<SalesReplyRouteResult> = {},
): SalesReplyRouteResult {
  return {
    applicable: false,
    reason,
    lineId: null,
    routeSlug: null,
    sendEndpointId: null,
    provider: null,
    discoveredByEndpointId: null,
    ...extra,
  };
}

function normalizeProvider(raw: string | null | undefined): SalesReplyProvider | null {
  if (raw === "meta_cloud_api") return "meta_cloud_api";
  if (raw === "evolution_api") return "evolution_api";
  if (raw === "twilio") return "twilio";
  return null;
}

async function flagEnabledForOrg(db: Db, organizationId: string): Promise<boolean> {
  const { data, error } = await db
    .from("feature_flags")
    .select("is_enabled, organization_ids")
    .eq("name", ROUTE_RESOLVER_FLAG)
    .maybeSingle();
  if (error) {
    console.error("[route-resolver] flag_lookup_error", { error });
    return false;
  }
  const row = data as { is_enabled?: boolean | null; organization_ids?: string[] | null } | null;
  if (!row || row.is_enabled !== true) return false;
  const orgs = (row.organization_ids ?? []) as string[];
  return orgs.length === 0 || orgs.includes(organizationId);
}

/**
 * Resolve o endpoint de envio canônico da resposta Comercial.
 * `applicable: true` ⇒ o caller DEVE enviar por `sendEndpointId`.
 * `reason: 'REPLY_ROUTE_UNRESOLVED'` ⇒ o caller DEVE abortar o envio.
 */
export async function resolveSalesReplyRoute(
  db: Db,
  input: SalesReplyRouteInput,
): Promise<SalesReplyRouteResult> {
  const threadId = input.threadId ?? null;
  let organizationId = input.organizationId ?? null;
  let businessContext = input.businessContext ?? null;
  let channel = input.channel ?? null;

  if (!threadId) return deny("missing_input");

  if (!organizationId || !businessContext || !channel) {
    const { data, error } = await db
      .from("message_threads")
      .select("organization_id, business_context, channel")
      .eq("id", threadId)
      .maybeSingle();
    if (error) {
      console.error("[route-resolver] thread_lookup_error", { thread_id: threadId, error });
      return deny("missing_input");
    }
    const t = data as
      | { organization_id?: string | null; business_context?: string | null; channel?: string | null }
      | null;
    if (!t) return deny("missing_input");
    organizationId = organizationId ?? t.organization_id ?? null;
    businessContext = businessContext ?? t.business_context ?? null;
    channel = channel ?? t.channel ?? null;
  }

  channel = channel ?? "whatsapp";

  // 1) Isolamento absoluto: só Comercial/WhatsApp
  if (businessContext !== "sales" || channel !== "whatsapp") {
    return deny("not_sales_context");
  }
  if (!organizationId) return deny("missing_input");

  // 2) Flag por organização
  if (!(await flagEnabledForOrg(db, organizationId))) {
    return deny("flag_off");
  }

  // 3) Última mensagem inbound roteável da thread
  const { data: lastInbound, error: msgErr } = await db
    .from("messages")
    .select("endpoint_id")
    .eq("thread_id", threadId)
    .eq("direction", "inbound")
    .not("endpoint_id", "is", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (msgErr) {
    console.error("[route-resolver] last_inbound_lookup_error", { thread_id: threadId, error: msgErr });
    return deny("REPLY_ROUTE_UNRESOLVED");
  }

  const inboundEndpointId =
    ((lastInbound as { endpoint_id?: string | null } | null)?.endpoint_id) ?? null;
  if (!inboundEndpointId) {
    console.log("[route-resolver] REPLY_ROUTE_UNRESOLVED", JSON.stringify({
      thread_id: threadId,
      step: "no_routable_inbound",
    }));
    return deny("REPLY_ROUTE_UNRESOLVED");
  }

  // 4) messaging_line_endpoints (link ativo) → Route
  const { data: links, error: linkErr } = await db
    .from("messaging_line_endpoints")
    .select("line_id")
    .eq("endpoint_id", inboundEndpointId)
    .eq("is_active", true);

  if (linkErr) {
    console.error("[route-resolver] route_link_lookup_error", { endpoint_id: inboundEndpointId, error: linkErr });
    return deny("REPLY_ROUTE_UNRESOLVED", { discoveredByEndpointId: inboundEndpointId });
  }

  const lineIds = ((links ?? []) as Array<{ line_id: string | null }>)
    .map((l) => l.line_id)
    .filter((id): id is string => !!id);

  if (lineIds.length === 0) {
    console.log("[route-resolver] REPLY_ROUTE_UNRESOLVED", JSON.stringify({
      thread_id: threadId,
      step: "endpoint_without_active_route_link",
      endpoint_id: inboundEndpointId,
    }));
    return deny("REPLY_ROUTE_UNRESOLVED", { discoveredByEndpointId: inboundEndpointId });
  }

  // 5) Route Comercial ativa da organização/canal
  const { data: lines, error: lineErr } = await db
    .from("messaging_lines")
    .select("id, route_slug, active_endpoint_id")
    .in("id", lineIds)
    .eq("organization_id", organizationId)
    .eq("channel", channel)
    .eq("inbox_key", "sales")
    .eq("is_active", true);

  if (lineErr) {
    console.error("[route-resolver] route_line_lookup_error", { endpoint_id: inboundEndpointId, error: lineErr });
    return deny("REPLY_ROUTE_UNRESOLVED", { discoveredByEndpointId: inboundEndpointId });
  }

  const route = ((lines ?? []) as Array<{
    id: string;
    route_slug: string | null;
    active_endpoint_id: string | null;
  }>).find((l) => !!l.active_endpoint_id);

  if (!route || !route.active_endpoint_id) {
    console.log("[route-resolver] REPLY_ROUTE_UNRESOLVED", JSON.stringify({
      thread_id: threadId,
      step: "no_active_sales_route",
      endpoint_id: inboundEndpointId,
    }));
    return deny("REPLY_ROUTE_UNRESOLVED", { discoveredByEndpointId: inboundEndpointId });
  }

  // 6) Endpoint ativo tecnicamente apto
  const { data: activeEp, error: epErr } = await db
    .from("communication_endpoints")
    .select("id, is_active, provider, organization_id")
    .eq("id", route.active_endpoint_id)
    .maybeSingle();

  if (epErr) {
    console.error("[route-resolver] active_endpoint_lookup_error", {
      endpoint_id: route.active_endpoint_id,
      error: epErr,
    });
    return deny("REPLY_ROUTE_UNRESOLVED", { discoveredByEndpointId: inboundEndpointId });
  }

  const ep = activeEp as
    | { id: string; is_active?: boolean | null; provider?: string | null; organization_id?: string | null }
    | null;
  const provider = normalizeProvider(ep?.provider ?? null);

  if (!ep || ep.is_active !== true || !provider || ep.organization_id !== organizationId) {
    console.log("[route-resolver] REPLY_ROUTE_UNRESOLVED", JSON.stringify({
      thread_id: threadId,
      step: "active_endpoint_not_eligible",
      line_id: route.id,
      active_endpoint_id: route.active_endpoint_id,
      is_active: ep?.is_active ?? null,
      provider: ep?.provider ?? null,
    }));
    return deny("REPLY_ROUTE_UNRESOLVED", { discoveredByEndpointId: inboundEndpointId });
  }

  const result: SalesReplyRouteResult = {
    applicable: true,
    reason: "resolved_by_last_inbound_endpoint",
    lineId: route.id,
    routeSlug: route.route_slug ?? null,
    sendEndpointId: ep.id,
    provider,
    discoveredByEndpointId: inboundEndpointId,
  };

  console.log("[route-resolver] REPLY_ROUTE_RESOLVED", JSON.stringify({
    thread_id: threadId,
    organization_id: organizationId,
    ...result,
  }));

  return result;
}
