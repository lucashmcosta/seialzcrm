// ============================================================================
// Route Resolver V2 — CAMINHO CANÔNICO DE RESPOSTA (Comercial / WhatsApp)
//
// Contrato (atrás da flag `conv_route_resolver_v2` por organização):
//
//   1. Atua SOMENTE em thread Comercial (business_context = 'sales') e
//      channel = 'whatsapp'. Qualquer outro contexto → { applicable: false,
//      reason: 'not_sales_context' } e o caller mantém 100% o caminho legado
//      (Atendimento nunca entra aqui).
//   2. Flag OFF para a organização → { applicable: false, reason: 'flag_off' }.
//   3. SELEÇÃO DERIVADA (fonte de verdade): a resposta sai pelo endpoint da
//      ÚLTIMA MENSAGEM VÁLIDA da thread — inbound OU outbound (ver
//      `reply-endpoint-selection.ts`). O endpoint da última mensagem é o
//      remetente; a Route serve apenas para provar elegibilidade:
//        messages(last valid).endpoint_id
//          → messaging_line_endpoints (is_active) → line_id
//          → messaging_lines (org, channel, inbox_key='sales', is_active)
//          → envio pelo PRÓPRIO endpoint da última mensagem
//   4. O endpoint precisa estar tecnicamente apto
//      (communication_endpoints.is_active = true, provider suportado, mesma org).
//   5. Thread SEM nenhuma mensagem válida com endpoint_id → fallback legado
//      `messaging_lines.active_endpoint_id` (reason 'resolved_by_route_default').
//   6. Existe contexto mas o endpoint está inelegível → REPLY_ROUTE_UNRESOLVED
//      (fail-closed: nunca troca de número em silêncio).
//
// PROIBIDO neste caminho (fail-closed, sem fallback silencioso):
//   • message_threads.primary_endpoint_id
//   • communication_endpoints.purpose
//   • provider default (twilio)
//   • active_endpoint_id quando existe contexto de conversa
//   • re-rota fixa por organização
// ============================================================================

import { fetchLastValidMessageEndpointId } from "./reply-endpoint-selection.ts";

// deno-lint-ignore no-explicit-any
type Db = { from: (table: string) => any };

export const ROUTE_RESOLVER_FLAG = "conv_route_resolver_v2";

export type SalesReplyProvider = "twilio" | "meta_cloud_api" | "evolution_api";

export type SalesReplyRouteReason =
  | "missing_input"
  | "not_sales_context"
  | "flag_off"
  | "resolved_by_last_message"
  | "resolved_by_route_default"
  | "REPLY_ROUTE_UNRESOLVED";

export interface SalesReplyRouteInput {
  organizationId?: string | null;
  threadId?: string | null;
  businessContext?: string | null;
  channel?: string | null;
  /** O contrato explícito `source=derived` independe da antiga flag de rollout. */
  requireFeatureFlag?: boolean;
}

export interface SalesReplyRouteResult {
  applicable: boolean;
  reason: SalesReplyRouteReason;
  lineId: string | null;
  routeSlug: string | null;
  sendEndpointId: string | null;
  provider: SalesReplyProvider | null;
  /** Endpoint da última mensagem válida que definiu a seleção (observabilidade). */
  discoveredByEndpointId: string | null;
  /** "derived" quando veio da última mensagem; "route_default" no fallback legado. */
  choice: "derived" | "route_default" | null;
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
    choice: null,
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

/** Routes Comerciais ativas às quais o endpoint está ativamente vinculado. */
async function salesRoutesForEndpoint(
  db: Db,
  organizationId: string,
  channel: string,
  endpointId: string,
): Promise<{
  routes: Array<{ id: string; route_slug: string | null; active_endpoint_id: string | null }>;
  error: boolean;
}> {
  const { data: links, error: linkErr } = await db
    .from("messaging_line_endpoints")
    .select("line_id")
    .eq("endpoint_id", endpointId)
    .eq("is_active", true);

  if (linkErr) {
    console.error("[route-resolver] route_link_lookup_error", { endpoint_id: endpointId, error: linkErr });
    return { routes: [], error: true };
  }

  const lineIds = ((links ?? []) as Array<{ line_id: string | null }>)
    .map((l) => l.line_id)
    .filter((id): id is string => !!id);
  if (lineIds.length === 0) return { routes: [], error: false };

  const { data: lines, error: lineErr } = await db
    .from("messaging_lines")
    .select("id, route_slug, active_endpoint_id")
    .in("id", lineIds)
    .eq("organization_id", organizationId)
    .eq("channel", channel)
    .eq("inbox_key", "sales")
    .eq("is_active", true);

  if (lineErr) {
    console.error("[route-resolver] route_line_lookup_error", { endpoint_id: endpointId, error: lineErr });
    return { routes: [], error: true };
  }
  return {
    routes: (lines ?? []) as Array<{
      id: string;
      route_slug: string | null;
      active_endpoint_id: string | null;
    }>,
    error: false,
  };
}

/** Endpoint tecnicamente apto: existe, mesma org, ativo e provider suportado. */
async function loadEligibleEndpoint(
  db: Db,
  organizationId: string,
  endpointId: string,
): Promise<{ id: string; provider: SalesReplyProvider } | null> {
  const { data, error } = await db
    .from("communication_endpoints")
    .select("id, is_active, provider, organization_id, channel")
    .eq("id", endpointId)
    .maybeSingle();
  if (error) {
    console.error("[route-resolver] endpoint_lookup_error", { endpoint_id: endpointId, error });
    return null;
  }
  const ep = data as
    | {
        id: string;
        is_active?: boolean | null;
        provider?: string | null;
        organization_id?: string | null;
        channel?: string | null;
      }
    | null;
  if (!ep) return null;
  const provider = normalizeProvider(ep.provider ?? null);
  if (
    ep.organization_id !== organizationId ||
    ep.channel !== "whatsapp" ||
    ep.is_active !== true ||
    !provider
  ) {
    return null;
  }
  return { id: ep.id, provider };
}

/**
 * Resolve o endpoint de envio canônico da resposta Comercial (seleção derivada).
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

  // 2) Flag por organização. O dispatcher server-side pode dispensar somente
  // esta flag quando recebeu o contrato explícito `source=derived`.
  if (input.requireFeatureFlag !== false && !(await flagEnabledForOrg(db, organizationId))) {
    return deny("flag_off");
  }

  // 3) Última mensagem válida da thread (inbound OU outbound) — fonte de verdade
  const last = await fetchLastValidMessageEndpointId(db, threadId);
  if (last.error) {
    console.error("[route-resolver] last_message_lookup_error", {
      thread_id: threadId,
      error: last.error,
    });
    return deny("REPLY_ROUTE_UNRESOLVED");
  }

  const contextEndpointId = last.endpointId;

  // 4) COM contexto: envia pelo próprio endpoint da última mensagem válida.
  if (contextEndpointId) {
    const { routes, error: routesErr } = await salesRoutesForEndpoint(
      db,
      organizationId,
      channel,
      contextEndpointId,
    );
    if (routesErr || routes.length === 0) {
      console.log("[route-resolver] REPLY_ROUTE_UNRESOLVED", JSON.stringify({
        thread_id: threadId,
        step: "context_endpoint_without_active_route_link",
        endpoint_id: contextEndpointId,
      }));
      return deny("REPLY_ROUTE_UNRESOLVED", { discoveredByEndpointId: contextEndpointId });
    }

    const eligible = await loadEligibleEndpoint(db, organizationId, contextEndpointId);
    if (!eligible) {
      console.log("[route-resolver] REPLY_ROUTE_UNRESOLVED", JSON.stringify({
        thread_id: threadId,
        step: "context_endpoint_not_eligible",
        endpoint_id: contextEndpointId,
      }));
      return deny("REPLY_ROUTE_UNRESOLVED", { discoveredByEndpointId: contextEndpointId });
    }

    const route = routes[0];
    const result: SalesReplyRouteResult = {
      applicable: true,
      reason: "resolved_by_last_message",
      lineId: route.id,
      routeSlug: route.route_slug ?? null,
      sendEndpointId: contextEndpointId,
      provider: eligible.provider,
      discoveredByEndpointId: contextEndpointId,
      choice: "derived",
    };
    console.log("[route-resolver] REPLY_ROUTE_RESOLVED", JSON.stringify({
      thread_id: threadId,
      organization_id: organizationId,
      ...result,
    }));
    return result;
  }

  // 5) SEM contexto: fallback legado pela Route Comercial ativa da organização.
  const { data: lines, error: lineErr } = await db
    .from("messaging_lines")
    .select("id, route_slug, active_endpoint_id")
    .eq("organization_id", organizationId)
    .eq("channel", channel)
    .eq("inbox_key", "sales")
    .eq("is_active", true);

  if (lineErr) {
    console.error("[route-resolver] default_route_lookup_error", { thread_id: threadId, error: lineErr });
    return deny("REPLY_ROUTE_UNRESOLVED");
  }

  const defaultRoute = ((lines ?? []) as Array<{
    id: string;
    route_slug: string | null;
    active_endpoint_id: string | null;
  }>).find((l) => !!l.active_endpoint_id);

  if (!defaultRoute?.active_endpoint_id) {
    console.log("[route-resolver] REPLY_ROUTE_UNRESOLVED", JSON.stringify({
      thread_id: threadId,
      step: "no_active_sales_route_for_empty_thread",
    }));
    return deny("REPLY_ROUTE_UNRESOLVED");
  }

  const defaultEligible = await loadEligibleEndpoint(
    db,
    organizationId,
    defaultRoute.active_endpoint_id,
  );
  if (!defaultEligible) {
    console.log("[route-resolver] REPLY_ROUTE_UNRESOLVED", JSON.stringify({
      thread_id: threadId,
      step: "route_default_endpoint_not_eligible",
      active_endpoint_id: defaultRoute.active_endpoint_id,
    }));
    return deny("REPLY_ROUTE_UNRESOLVED");
  }

  const fallback: SalesReplyRouteResult = {
    applicable: true,
    reason: "resolved_by_route_default",
    lineId: defaultRoute.id,
    routeSlug: defaultRoute.route_slug ?? null,
    sendEndpointId: defaultEligible.id,
    provider: defaultEligible.provider,
    discoveredByEndpointId: null,
    choice: "route_default",
  };
  console.log("[route-resolver] REPLY_ROUTE_RESOLVED", JSON.stringify({
    thread_id: threadId,
    organization_id: organizationId,
    ...fallback,
  }));
  return fallback;
}
