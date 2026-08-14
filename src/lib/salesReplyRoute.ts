// ============================================================================
// Route Resolver V2 (lado cliente) — espelho de
// `supabase/functions/_shared/route-resolver.ts`.
//
// Atua SOMENTE em thread Comercial (business_context='sales') + WhatsApp e
// SOMENTE quando a flag `conv_route_resolver_v2` estiver habilitada para a
// organização. Fora disso: `applicable: false` e o dispatcher mantém o
// caminho legado (Atendimento nunca entra aqui).
//
// Sem fallbacks: primary_endpoint_id, purpose, provider default e "única Route
// sales da org" são PROIBIDOS. Sem Route resolvível → REPLY_ROUTE_UNRESOLVED.
// ============================================================================

import { supabase } from "@/integrations/supabase/client";

export const ROUTE_RESOLVER_FLAG = "conv_route_resolver_v2";

export type SalesReplyProvider = "twilio" | "meta_cloud_api" | "evolution_api";

export type SalesReplyRouteReason =
  | "missing_input"
  | "not_sales_context"
  | "flag_off"
  | "resolved_by_last_message"
  | "resolved_by_route_default"
  | "REPLY_ROUTE_UNRESOLVED";

export interface SalesReplyRouteResult {
  applicable: boolean;
  reason: SalesReplyRouteReason;
  lineId: string | null;
  sendEndpointId: string | null;
  provider: SalesReplyProvider | null;
  discoveredByEndpointId: string | null;
}

function deny(
  reason: SalesReplyRouteReason,
  discoveredByEndpointId: string | null = null,
): SalesReplyRouteResult {
  return {
    applicable: false,
    reason,
    lineId: null,
    sendEndpointId: null,
    provider: null,
    discoveredByEndpointId,
  };
}

function normalizeProvider(raw: string | null | undefined): SalesReplyProvider | null {
  if (raw === "meta_cloud_api") return "meta_cloud_api";
  if (raw === "evolution_api") return "evolution_api";
  if (raw === "twilio") return "twilio";
  return null;
}

async function flagEnabledForOrg(organizationId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from("feature_flags")
    .select("is_enabled, organization_ids")
    .eq("name", ROUTE_RESOLVER_FLAG)
    .maybeSingle();
  if (error) return false;
  const row = data as { is_enabled?: boolean | null; organization_ids?: string[] | null } | null;
  if (!row || row.is_enabled !== true) return false;
  const orgs = (row.organization_ids ?? []) as string[];
  return orgs.length === 0 || orgs.includes(organizationId);
}

export async function resolveSalesReplyRoute(input: {
  organizationId?: string | null;
  threadId?: string | null;
  businessContext?: string | null;
  channel?: string | null;
}): Promise<SalesReplyRouteResult> {
  const threadId = input.threadId ?? null;
  if (!threadId) return deny("missing_input");

  let organizationId = input.organizationId ?? null;
  let businessContext = input.businessContext ?? null;
  let channel = input.channel ?? null;

  if (!organizationId || !businessContext || !channel) {
    const { data, error } = await supabase
      .from("message_threads")
      .select("organization_id, business_context, channel")
      .eq("id", threadId)
      .maybeSingle();
    if (error || !data) return deny("missing_input");
    const t = data as { organization_id: string | null; business_context: string | null; channel: string | null };
    organizationId = organizationId ?? t.organization_id;
    businessContext = businessContext ?? t.business_context;
    channel = channel ?? t.channel;
  }

  channel = channel ?? "whatsapp";
  if (businessContext !== "sales" || channel !== "whatsapp") return deny("not_sales_context");
  if (!organizationId) return deny("missing_input");

  if (!(await flagEnabledForOrg(organizationId))) return deny("flag_off");

  // Seleção DERIVADA: última mensagem válida da thread (inbound OU outbound).
  const { data: lastMsg, error: msgErr } = await supabase
    .from("messages")
    .select("endpoint_id")
    .eq("thread_id", threadId)
    .in("direction", ["inbound", "outbound"])
    .is("deleted_at", null)
    .not("is_internal_note", "is", true)
    .not("endpoint_id", "is", null)
    .order("sent_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (msgErr) return deny("REPLY_ROUTE_UNRESOLVED");

  const contextEndpointId =
    (lastMsg as { endpoint_id: string | null } | null)?.endpoint_id ?? null;

  async function eligibleEndpoint(endpointId: string) {
    const { data, error } = await supabase
      .from("communication_endpoints")
      .select("id, is_active, provider, organization_id, channel")
      .eq("id", endpointId)
      .maybeSingle();
    if (error) return null;
    const ep = data as
      | {
          id: string;
          is_active: boolean | null;
          provider: string | null;
          organization_id: string | null;
          channel: string | null;
        }
      | null;
    const provider = normalizeProvider(ep?.provider ?? null);
    if (
      !ep ||
      ep.is_active !== true ||
      !provider ||
      ep.channel !== "whatsapp" ||
      ep.organization_id !== organizationId
    ) {
      return null;
    }
    return { id: ep.id, provider };
  }

  async function salesRoutesFor(endpointId: string) {
    const { data: links, error: linkErr } = await supabase
      .from("messaging_line_endpoints")
      .select("line_id")
      .eq("endpoint_id", endpointId)
      .eq("is_active", true);
    if (linkErr) return null;
    const lineIds = ((links ?? []) as Array<{ line_id: string | null }>)
      .map((l) => l.line_id)
      .filter((id): id is string => !!id);
    if (lineIds.length === 0) return [];
    const { data: lines, error: lineErr } = await supabase
      .from("messaging_lines")
      .select("id, active_endpoint_id")
      .in("id", lineIds)
      .eq("organization_id", organizationId!)
      .eq("channel", channel!)
      .eq("inbox_key", "sales")
      .eq("is_active", true);
    if (lineErr) return null;
    return (lines ?? []) as Array<{ id: string; active_endpoint_id: string | null }>;
  }

  // COM contexto: responde pelo PRÓPRIO endpoint da última mensagem válida.
  if (contextEndpointId) {
    const routes = await salesRoutesFor(contextEndpointId);
    if (!routes || routes.length === 0) return deny("REPLY_ROUTE_UNRESOLVED", contextEndpointId);
    const ep = await eligibleEndpoint(contextEndpointId);
    if (!ep) return deny("REPLY_ROUTE_UNRESOLVED", contextEndpointId);
    return {
      applicable: true,
      reason: "resolved_by_last_message",
      lineId: routes[0].id,
      sendEndpointId: ep.id,
      provider: ep.provider,
      discoveredByEndpointId: contextEndpointId,
    };
  }

  // SEM contexto: fallback legado pela Route Comercial ativa da organização.
  const { data: defLines, error: defErr } = await supabase
    .from("messaging_lines")
    .select("id, active_endpoint_id")
    .eq("organization_id", organizationId)
    .eq("channel", channel)
    .eq("inbox_key", "sales")
    .eq("is_active", true);
  if (defErr) return deny("REPLY_ROUTE_UNRESOLVED");

  const defaultRoute = ((defLines ?? []) as Array<{ id: string; active_endpoint_id: string | null }>)
    .find((l) => !!l.active_endpoint_id);
  if (!defaultRoute?.active_endpoint_id) return deny("REPLY_ROUTE_UNRESOLVED");

  const defEp = await eligibleEndpoint(defaultRoute.active_endpoint_id);
  if (!defEp) return deny("REPLY_ROUTE_UNRESOLVED");

  return {
    applicable: true,
    reason: "resolved_by_route_default",
    lineId: defaultRoute.id,
    sendEndpointId: defEp.id,
    provider: defEp.provider,
    discoveredByEndpointId: null,
  };
}
