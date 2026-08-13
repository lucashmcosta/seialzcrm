// ============================================================================
// Edge Function: sales-route-operations (Fase 3)
//
// Manager provider-agnostic do WhatsApp Comercial. Separa:
//   INTEGRAÇÃO   → status técnico real lido da fonte do provedor.
//   CONFIGURAÇÃO → endpoints e vínculo com a Route (via RPC atômica).
//   REGRA        → Route ativa (rotate_messaging_line_endpoint) e resolver V2.
//
// Garantias obrigatórias:
//   1. JWT do chamador obrigatório (verify_jwt default = true).
//   2. Toda mutação exige `can_manage_integrations_in_org(org)` — validado
//      no banco, com o JWT do chamador (RPC + RLS), nunca no cliente.
//   3. Atomicidade real: nenhuma escrita composta acontece aqui. Provisionar
//      usa `public.provision_sales_endpoint`; trocar número ativo usa
//      `public.rotate_messaging_line_endpoint`. Falha = rollback integral.
//   4. Evolution: `owner_jid` / `owner_number_digits` são gravados SOMENTE a
//      partir da resposta REAL do servidor Evolution (fetchInstances), obtida
//      server-side. Proibido derivar de input, instance_name, display_name,
//      endpoints ou qualquer inferência.
//   5. Nenhuma credencial é duplicada ou retornada. Zero impacto em
//      Atendimento, Mobile, resolver V2 e trigger de canonicidade.
// ============================================================================

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { featureFlagEnabled } from "../_shared/feature-flags.ts";
import { readEvolutionEnv } from "../_shared/evolution/client.ts";
import { makeEvolutionProvider } from "../_shared/evolution/provider.ts";
import { logEvolution, newRequestId } from "../_shared/evolution/logger.ts";
import { callerKey, rateLimit } from "../_shared/evolution/rate-limit.ts";
import {
  CAPABILITIES,
  digitsOf,
  normalizeProvider,
  providerFromEndpoint,
  SalesProvider,
} from "../_shared/whatsapp-provider/capabilities.ts";

const FN = "sales-route-operations" as const;
const EVOLUTION_FLAG = "evolution_api_enabled";
const RESOLVER_FLAG = "conv_route_resolver_v2";
const INSTANCE_NAME_RE = /^[A-Za-z0-9_-]{3,64}$/;

type Op =
  | "status"
  | "refreshEvolutionIdentity"
  | "provisionEndpoint"
  | "setActiveEndpoint"
  | "restartInstance";

interface Body {
  op: Op;
  organizationId?: string;
  lineId?: string;
  endpointId?: string;
  provider?: string;
  address?: string;
  displayName?: string;
  instanceName?: string;
  reason?: string;
}

function json(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "content-type": "application/json" },
  });
}

function mask(address: string | null | undefined): string | null {
  const d = digitsOf(address);
  return d.length >= 4 ? `****${d.slice(-4)}` : null;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") return json(405, { error: "METHOD_NOT_ALLOWED" });

  const requestId = newRequestId();

  const rl = rateLimit(callerKey(req, "sales-route-ops"), 40, 60_000);
  if (!rl.allowed) {
    return new Response(JSON.stringify({ error: "RATE_LIMITED" }), {
      status: 429,
      headers: {
        ...corsHeaders,
        "content-type": "application/json",
        "retry-after": String(rl.retryAfterSec),
      },
    });
  }

  // ---- 1. Auth do chamador ----
  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) return json(401, { error: "UNAUTHORIZED" });

  const caller = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } },
  );
  const { data: claims, error: claimsErr } = await caller.auth.getClaims(
    authHeader.replace("Bearer ", ""),
  );
  if (claimsErr || !claims?.claims?.sub) return json(401, { error: "UNAUTHORIZED" });

  let body: Body;
  try {
    body = await req.json();
  } catch {
    return json(400, { error: "INVALID_INPUT", message: "invalid JSON" });
  }
  if (!body || typeof body.op !== "string") {
    return json(400, { error: "INVALID_INPUT", message: "missing op" });
  }
  const orgId = typeof body.organizationId === "string" ? body.organizationId : null;
  if (!orgId) return json(400, { error: "INVALID_INPUT", message: "organizationId" });

  const service = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // ---- 2. Autorização administrativa (mutações) ----
  const isMutation = body.op !== "status";
  if (isMutation) {
    const { data: allowed, error } = await caller.rpc(
      "can_manage_integrations_in_org",
      { _org_id: orgId },
    );
    if (error || allowed !== true) {
      logEvolution("warn", { fn: FN, requestId, orgId, code: "FORBIDDEN", op: body.op });
      return json(403, { error: "FORBIDDEN", message: "admin de integrações requerido" });
    }
  }

  const evolutionEnabled = await featureFlagEnabled(service, EVOLUTION_FLAG, orgId);

  // Provider Evolution só é instanciado quando realmente necessário.
  const evolution = () => {
    const env = readEvolutionEnv();
    if ("code" in env) return env;
    return makeEvolutionProvider(env, requestId);
  };

  /**
   * Lê a identidade REAL da instância no servidor Evolution e persiste
   * owner_jid / owner_number_digits. Nunca infere nada.
   */
  async function syncEvolutionIdentity(instanceName: string) {
    if (!INSTANCE_NAME_RE.test(instanceName)) {
      return { error: "INVALID_INPUT", message: "instanceName" } as const;
    }
    if (!evolutionEnabled) {
      return { error: "FEATURE_DISABLED", message: EVOLUTION_FLAG } as const;
    }
    const { data: row } = await service
      .from("evolution_instances")
      .select("id, organization_id, instance_name")
      .eq("instance_name", instanceName)
      .maybeSingle();
    if (!row) return { error: "INSTANCE_NOT_FOUND" } as const;
    if (row.organization_id !== orgId) return { error: "INSTANCE_FOREIGN_ORG" } as const;

    const provider = evolution();
    if ("code" in provider) return { error: provider.code, message: provider.message } as const;

    const state = await provider.connectionState(instanceName);
    if (typeof state !== "string") {
      return { error: state.code, message: state.message } as const;
    }

    // Fonte canônica da identidade: resposta real de fetchInstances.
    const list = await provider.fetch(instanceName);
    if (!Array.isArray(list)) {
      return { error: list.code, message: list.message } as const;
    }
    const found = list.find((i) => i.instanceName === instanceName) ?? list[0] ?? null;
    const ownerJid = found?.ownerJid ?? null;
    const realNumber = found?.number ?? null;
    const ownerDigits = digitsOf(realNumber ?? (ownerJid ? ownerJid.split("@")[0] : ""));

    const patch: Record<string, unknown> = {
      last_known_state: state,
      last_state_checked_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    // Só grava identidade quando o provedor realmente a informou.
    if (ownerJid) patch.owner_jid = ownerJid;
    if (ownerDigits.length >= 8) patch.owner_number_digits = ownerDigits;

    await service.from("evolution_instances").update(patch).eq("id", row.id);

    return {
      instanceName,
      state,
      connected: state === "open",
      ownerIdentity: ownerJid ? { masked: mask(ownerDigits), known: true } : { known: false },
    } as const;
  }

  try {
    switch (body.op) {
      // ---------------------------------------------------------------- STATUS
      // Compara a CONFIGURAÇÃO do tenant (banco) com a fonte técnica real.
      case "status": {
        const { data: lines } = await caller
          .from("messaging_lines")
          .select("id, name, key, inbox_key, channel, route_slug, is_active, active_endpoint_id")
          .eq("organization_id", orgId)
          .eq("inbox_key", "sales")
          .eq("channel", "whatsapp");

        const lineIds = (lines ?? []).map((l: { id: string }) => l.id);
        const { data: links } = lineIds.length
          ? await caller
            .from("messaging_line_endpoints")
            .select("line_id, endpoint_id, is_active")
            .in("line_id", lineIds)
          : { data: [] as unknown[] };

        const endpointIds = Array.from(new Set([
          ...((links ?? []) as { endpoint_id: string | null }[])
            .map((l) => l.endpoint_id).filter((x): x is string => !!x),
          ...((lines ?? []) as { active_endpoint_id: string | null }[])
            .map((l) => l.active_endpoint_id).filter((x): x is string => !!x),
        ]));

        const { data: eps } = endpointIds.length
          ? await caller
            .from("communication_endpoints")
            .select("id, external_address, display_name, provider, status, is_active")
            .in("id", endpointIds)
          : { data: [] as unknown[] };

        const { data: instances } = await service
          .from("evolution_instances")
          .select(
            "id, instance_name, endpoint_id, last_known_state, last_state_checked_at, owner_number_digits",
          )
          .eq("organization_id", orgId);

        // Divergência técnica: identidade real da instância x endereço do endpoint.
        const epById = new Map(
          ((eps ?? []) as { id: string; external_address: string | null }[])
            .map((e) => [e.id, e]),
        );
        const instanceReport = ((instances ?? []) as {
          instance_name: string;
          endpoint_id: string | null;
          last_known_state: string | null;
          last_state_checked_at: string | null;
          owner_number_digits: string | null;
        }[]).map((i) => {
          const ep = i.endpoint_id ? epById.get(i.endpoint_id) : null;
          const epDigits = digitsOf(ep?.external_address);
          return {
            instanceName: i.instance_name,
            endpointId: i.endpoint_id,
            technicalState: i.last_known_state ?? "unknown",
            connected: i.last_known_state === "open",
            checkedAt: i.last_state_checked_at,
            identityKnown: !!i.owner_number_digits,
            identityMatchesEndpoint: !!i.owner_number_digits && !!epDigits
              ? i.owner_number_digits === epDigits
              : null,
          };
        });

        return json(200, {
          organizationId: orgId,
          rules: {
            resolverV2: await featureFlagEnabled(service, RESOLVER_FLAG, orgId),
            evolutionIntegration: evolutionEnabled,
          },
          capabilities: CAPABILITIES,
          routes: (lines ?? []).map((l: Record<string, unknown>) => ({
            lineId: l.id,
            name: l.name,
            routeSlug: l.route_slug,
            isActive: l.is_active,
            activeEndpointId: l.active_endpoint_id,
            endpoints: ((links ?? []) as {
              line_id: string;
              endpoint_id: string;
              is_active: boolean | null;
            }[])
              .filter((k) => k.line_id === l.id)
              .map((k) => {
                const ep = ((eps ?? []) as Record<string, unknown>[])
                  .find((e) => e.id === k.endpoint_id) ?? null;
                const logical = providerFromEndpoint(ep?.provider as string | null);
                return {
                  endpointId: k.endpoint_id,
                  linkActive: k.is_active === true,
                  isRouteActive: l.active_endpoint_id === k.endpoint_id,
                  addressMasked: mask(ep?.external_address as string | null),
                  displayName: (ep?.display_name as string | null) ?? null,
                  provider: logical,
                  providerRaw: (ep?.provider as string | null) ?? null,
                  technicalStatus: (ep?.status as string | null) ?? "unknown",
                  enabled: ep?.is_active === true,
                };
              }),
          })),
          evolutionInstances: instanceReport,
        });
      }

      // -------------------------------------------- REFRESH EVOLUTION IDENTITY
      case "refreshEvolutionIdentity": {
        const name = typeof body.instanceName === "string" ? body.instanceName : "";
        const r = await syncEvolutionIdentity(name);
        if ("error" in r) return json(400, r as Record<string, unknown>);
        return json(200, r as unknown as Record<string, unknown>);
      }

      // ----------------------------------------------------- PROVISION (ATÔMICO)
      case "provisionEndpoint": {
        const provider = normalizeProvider(body.provider) as SalesProvider | null;
        if (!provider) return json(400, { error: "PROVISION_PROVIDER_UNSUPPORTED" });
        if (typeof body.lineId !== "string" || typeof body.address !== "string") {
          return json(400, { error: "INVALID_INPUT", message: "lineId/address" });
        }

        // Evolution: identidade real ANTES da RPC — a RPC exige
        // owner_number_digits e falha (rollback total) em divergência.
        if (provider === "evolution") {
          const name = typeof body.instanceName === "string" ? body.instanceName : "";
          const sync = await syncEvolutionIdentity(name);
          if ("error" in sync) return json(400, sync as Record<string, unknown>);
          if (!sync.connected) return json(409, { error: "PROVISION_EVOLUTION_NOT_CONNECTED" });
        }

        const { data, error } = await caller.rpc("provision_sales_endpoint", {
          p_organization_id: orgId,
          p_line_id: body.lineId,
          p_provider: provider,
          p_address: body.address,
          p_display_name: typeof body.displayName === "string" ? body.displayName : null,
          p_instance_name: typeof body.instanceName === "string" ? body.instanceName : null,
        });
        if (error) {
          logEvolution("warn", { fn: FN, requestId, orgId, code: "PROVISION_FAILED", message: error.message });
          return json(400, { error: "PROVISION_FAILED", message: error.message });
        }
        return json(200, { result: data });
      }

      // --------------------------------------- REGRA: número ativo da Route
      case "setActiveEndpoint": {
        if (typeof body.lineId !== "string" || typeof body.endpointId !== "string") {
          return json(400, { error: "INVALID_INPUT", message: "lineId/endpointId" });
        }
        const { data, error } = await caller.rpc("rotate_messaging_line_endpoint", {
          p_line_id: body.lineId,
          p_endpoint_id: body.endpointId,
          p_reason: typeof body.reason === "string" && body.reason.trim()
            ? body.reason.trim()
            : "sales_route_manager",
        });
        if (error) return json(400, { error: "ROTATE_FAILED", message: error.message });
        return json(200, { result: data });
      }

      // ------------------------------- INTEGRAÇÃO: reinício técnico (Evolution)
      case "restartInstance": {
        const name = typeof body.instanceName === "string" ? body.instanceName : "";
        if (!INSTANCE_NAME_RE.test(name)) {
          return json(400, { error: "INVALID_INPUT", message: "instanceName" });
        }
        if (!evolutionEnabled) return json(403, { error: "FEATURE_DISABLED", message: EVOLUTION_FLAG });

        const { data: row } = await service
          .from("evolution_instances")
          .select("id, organization_id")
          .eq("instance_name", name)
          .maybeSingle();
        if (!row) return json(404, { error: "INSTANCE_NOT_FOUND" });
        if (row.organization_id !== orgId) return json(403, { error: "INSTANCE_FOREIGN_ORG" });

        const provider = evolution();
        if (isEvolutionError(provider)) return json(provider.status ?? 502, { error: provider.code });

        const out = await provider.connect(name);
        // ATENÇÃO: EvolutionQrCode também possui `code` (string do QR). A detecção
        // de erro precisa usar o discriminador completo, nunca só a chave `code`.
        if (isEvolutionError(out)) {
          return json(out.status ?? 502, { error: out.code, message: out.message });
        }

        const sync = await syncEvolutionIdentity(name);
        return json(200, {
          restarted: true,
          pairing: out
            ? { pairingCode: out.pairingCode ?? null, hasQrCode: !!(out.code || out.base64) }
            : null,
          state: "error" in sync ? null : sync.state,
        });
      }

      default:
        return json(400, { error: "INVALID_INPUT", message: "unknown op" });
    }
  } catch (e) {
    logEvolution("error", { fn: FN, requestId, orgId, code: "UNEXPECTED", message: String(e) });
    return json(500, { error: "UNEXPECTED" });
  }
});
