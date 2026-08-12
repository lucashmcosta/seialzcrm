// ============================================================================
// Route Resolver V2 — SHADOW MODE (Fase 1 / GMUD Conversas Multicanal)
//
// Estado: NÃO CONSUMIDO por nenhum dispatcher/webhook. Existe apenas para
// observabilidade (shadow log) e para os testes da Fase 1.
//
// Regras normativas implementadas:
//   - Atua SOMENTE no Comercial (business_context = 'sales').
//     Qualquer outro contexto retorna { applicable: false } — Atendimento
//     permanece 100% no caminho legado.
//   - Gate por feature flag `conv_route_resolver_v2` (OFF hoje). Com a flag
//     desligada o resolver apenas registra o que FARIA, sem decidir nada.
//   - Route = messaging_lines (inbox_key = 'sales', is_active = true).
//     Endpoint de envio = messaging_lines.active_endpoint_id.
//     Endpoints inbound da Route = messaging_line_endpoints (is_active).
//   - Regra de reply: "última mensagem inbound roteável" define a Route.
//     Se não houver Route resolvível → REPLY_ROUTE_UNRESOLVED (nunca fallback
//     silencioso para outro número).
// ============================================================================

import type { SupabaseClient } from "npm:@supabase/supabase-js@2";

export const ROUTE_RESOLVER_FLAG = "conv_route_resolver_v2";

export type RouteResolveReason =
  | "flag_off"
  | "not_sales_context"
  | "resolved_by_last_inbound_endpoint"
  | "resolved_by_thread_primary_endpoint"
  | "resolved_by_single_active_route"
  | "REPLY_ROUTE_UNRESOLVED";

export interface RouteResolveInput {
  organizationId: string;
  threadId?: string | null;
  businessContext?: string | null;
  channel?: string | null;
}

export interface RouteResolveResult {
  applicable: boolean;
  reason: RouteResolveReason;
  lineId: string | null;
  routeSlug: string | null;
  sendEndpointId: string | null;
  shadow: true;
}

function notApplicable(reason: RouteResolveReason): RouteResolveResult {
  return {
    applicable: false,
    reason,
    lineId: null,
    routeSlug: null,
    sendEndpointId: null,
    shadow: true,
  };
}

async function isFlagEnabled(
  supabase: SupabaseClient,
  organizationId: string,
): Promise<boolean> {
  const { data } = await supabase
    .from("feature_flags")
    .select("is_enabled, organization_ids")
    .eq("name", ROUTE_RESOLVER_FLAG)
    .maybeSingle();
  if (!data || (data as any).is_enabled !== true) return false;
  const orgs = ((data as any).organization_ids as string[] | null) ?? [];
  return orgs.length === 0 || orgs.includes(organizationId);
}

/**
 * Resolve a Route Comercial (shadow). NUNCA deve ser usado para decidir envio
 * enquanto a flag estiver OFF — nesse caso retorna `applicable: false`.
 */
export async function resolveSalesRoute(
  supabase: SupabaseClient,
  input: RouteResolveInput,
): Promise<RouteResolveResult> {
  // 1) Isolamento: somente Comercial
  if (input.businessContext !== "sales") {
    return notApplicable("not_sales_context");
  }

  const channel = input.channel ?? "whatsapp";

  // 2) Gate por flag (shadow enquanto OFF)
  const enabled = await isFlagEnabled(supabase, input.organizationId);

  // 3) Candidato por "última mensagem inbound roteável" da thread
  let lineId: string | null = null;
  let reason: RouteResolveReason = "REPLY_ROUTE_UNRESOLVED";

  if (input.threadId) {
    const { data: lastInbound } = await supabase
      .from("messages")
      .select("endpoint_id")
      .eq("thread_id", input.threadId)
      .eq("direction", "inbound")
      .not("endpoint_id", "is", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const inboundEndpointId = (lastInbound as any)?.endpoint_id as string | null | undefined;
    if (inboundEndpointId) {
      const { data: link } = await supabase
        .from("messaging_line_endpoints")
        .select("line_id")
        .eq("endpoint_id", inboundEndpointId)
        .eq("is_active", true)
        .maybeSingle();
      const candidate = (link as any)?.line_id as string | null | undefined;
      if (candidate) {
        lineId = candidate;
        reason = "resolved_by_last_inbound_endpoint";
      }
    }

    // 3b) Fallback: primary_endpoint_id da thread, se vinculado a uma Route
    if (!lineId) {
      const { data: thread } = await supabase
        .from("message_threads")
        .select("primary_endpoint_id")
        .eq("id", input.threadId)
        .maybeSingle();
      const primaryId = (thread as any)?.primary_endpoint_id as string | null | undefined;
      if (primaryId) {
        const { data: link } = await supabase
          .from("messaging_line_endpoints")
          .select("line_id")
          .eq("endpoint_id", primaryId)
          .eq("is_active", true)
          .maybeSingle();
        const candidate = (link as any)?.line_id as string | null | undefined;
        if (candidate) {
          lineId = candidate;
          reason = "resolved_by_thread_primary_endpoint";
        }
      }
    }
  }

  // 3c) Fallback: Route sales ativa única da org/canal
  if (!lineId) {
    const { data: routes } = await supabase
      .from("messaging_lines")
      .select("id")
      .eq("organization_id", input.organizationId)
      .eq("channel", channel)
      .eq("inbox_key", "sales")
      .eq("is_active", true);
    const list = (routes as any[]) ?? [];
    if (list.length === 1) {
      lineId = list[0].id as string;
      reason = "resolved_by_single_active_route";
    }
  }

  if (!lineId) {
    console.log("[route-resolver][shadow] REPLY_ROUTE_UNRESOLVED", {
      organizationId: input.organizationId,
      threadId: input.threadId ?? null,
      channel,
    });
    return notApplicable("REPLY_ROUTE_UNRESOLVED");
  }

  const { data: line } = await supabase
    .from("messaging_lines")
    .select("id, route_slug, active_endpoint_id, inbox_key, is_active")
    .eq("id", lineId)
    .maybeSingle();

  const result: RouteResolveResult = {
    // Fase 1: com a flag OFF o resolver é apenas observabilidade.
    applicable: enabled,
    reason: enabled ? reason : "flag_off",
    lineId,
    routeSlug: ((line as any)?.route_slug as string | null) ?? null,
    sendEndpointId: ((line as any)?.active_endpoint_id as string | null) ?? null,
    shadow: true,
  };

  console.log("[route-resolver][shadow] resolved", {
    organizationId: input.organizationId,
    threadId: input.threadId ?? null,
    channel,
    flagEnabled: enabled,
    ...result,
  });

  return result;
}
