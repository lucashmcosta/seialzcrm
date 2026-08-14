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
  | "restartInstance"
  | "connectInstance"
  | "instanceState"
  | "listInstances"
  | "createInstance"
  | "syncWebhook"
  | "syncPendingInstanceIdentity"
  | "linkPendingInstance"
  | "deleteInstance";

interface Body {
  op: Op;
  organizationId?: string;
  lineId?: string;
  endpointId?: string;
  provider?: string;
  address?: string;
  displayName?: string;
  instanceName?: string;
  instanceId?: string;
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

  // Discriminador seguro de EvolutionError: alguns retornos legítimos
  // (EvolutionQrCode) também têm a chave `code`.
  function isEvolutionError(v: unknown): v is { code: string; message: string; status: number } {
    if (!v || typeof v !== "object") return false;
    const o = v as Record<string, unknown>;
    return typeof o.code === "string" && typeof o.message === "string" &&
      typeof o.status === "number";
  }

  // Provider Evolution só é instanciado quando realmente necessário.
  const evolution = () => {
    const env = readEvolutionEnv();
    if (isEvolutionError(env)) return env;
    return makeEvolutionProvider(env, requestId);
  };

  /**
   * Lê a identidade REAL da instância no servidor Evolution e persiste
   * owner_jid / owner_number_digits. Nunca infere nada.
   *
   * Retorna também `ownerDigits` (dígitos reais informados pelo provedor) e
   * `instanceId`, usados pelos gates de ativação.
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
      .select("id, organization_id, instance_name, endpoint_id, owner_number_digits")
      .eq("instance_name", instanceName)
      .maybeSingle();
    if (!row) return { error: "INSTANCE_NOT_FOUND" } as const;
    if (row.organization_id !== orgId) return { error: "INSTANCE_FOREIGN_ORG" } as const;

    const provider = evolution();
    if (isEvolutionError(provider)) {
      return { error: provider.code, message: provider.message } as const;
    }

    const state = await provider.connectionState(instanceName);
    if (typeof state !== "string") {
      return { error: state.code, message: state.message } as const;
    }

    // Fonte canônica da identidade: resposta real de fetchInstances.
    const list = await provider.fetch(instanceName);
    if (!Array.isArray(list)) {
      return { error: list.code, message: list.message } as const;
    }
    const found = list.find((i) => {
      const rec = i as unknown as Record<string, unknown>;
      return rec.instanceName === instanceName || rec.name === instanceName;
    }) ?? list[0] ?? null;
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

    const persistedDigits = ownerDigits.length >= 8
      ? ownerDigits
      : digitsOf(row.owner_number_digits);

    return {
      instanceId: row.id as string,
      instanceName,
      endpointId: (row.endpoint_id as string | null) ?? null,
      state,
      connected: state === "open",
      ownerDigits: persistedDigits,
      identityKnown: persistedDigits.length >= 8,
      ownerIdentity: persistedDigits.length >= 8
        ? { masked: mask(persistedDigits), known: true }
        : { masked: null, known: false },
    } as const;
  }

  /** Dígitos do endereço real de um endpoint (leitura service-role). */
  async function endpointDigits(endpointId: string): Promise<string | null> {
    const { data } = await service
      .from("communication_endpoints")
      .select("id, organization_id, external_address, provider")
      .eq("id", endpointId)
      .maybeSingle();
    if (!data || data.organization_id !== orgId) return null;
    return digitsOf(data.external_address);
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

        const instanceByEndpoint = new Map(
          ((instances ?? []) as {
            instance_name: string;
            endpoint_id: string | null;
            last_known_state: string | null;
            owner_number_digits: string | null;
          }[])
            .filter((i) => !!i.endpoint_id)
            .map((i) => [i.endpoint_id as string, i]),
        );

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
                const linkActive = k.is_active === true;

                // activationEligible é APENAS apresentação para a UI. A proteção
                // real acontece server-side em `setActiveEndpoint`, no clique.
                let activationEligible = linkActive;
                let activationBlockedReason: string | null = linkActive
                  ? null
                  : "LINK_INACTIVE";

                if (linkActive && logical === "evolution") {
                  const inst = instanceByEndpoint.get(k.endpoint_id) ?? null;
                  const epDigits = digitsOf(ep?.external_address as string | null);
                  const ownerDigits = digitsOf(inst?.owner_number_digits ?? "");
                  if (!inst) {
                    activationEligible = false;
                    activationBlockedReason = "INSTANCE_NOT_LINKED";
                  } else if (inst.last_known_state !== "open") {
                    activationEligible = false;
                    activationBlockedReason = "NOT_CONNECTED";
                  } else if (ownerDigits.length < 8) {
                    activationEligible = false;
                    activationBlockedReason = "IDENTITY_UNKNOWN";
                  } else if (!epDigits || ownerDigits !== epDigits) {
                    activationEligible = false;
                    activationBlockedReason = "IDENTITY_MISMATCH";
                  }
                }

                // ------------------------------------------------------------
                // Status técnico do endpoint.
                //
                // NUNCA derivado de `communication_endpoints.status` /
                // `is_active` nem de qualquer estado persistido do endpoint.
                // Para Evolution vem exclusivamente do estado real da sessão
                // (`evolution_instances.last_known_state` + identidade
                // confirmada, atualizados por webhook / health check).
                // Para Meta/Twilio não existe sessão a sondar → PROVIDER_MANAGED.
                // ------------------------------------------------------------
                let technicalStatus = "PROVIDER_MANAGED";
                if (logical === "evolution") {
                  const inst = instanceByEndpoint.get(k.endpoint_id) ?? null;
                  const epDigits = digitsOf(ep?.external_address as string | null);
                  const ownerDigits = digitsOf(inst?.owner_number_digits ?? "");
                  if (!inst) {
                    technicalStatus = "NOT_LINKED";
                  } else if (inst.last_known_state === "open") {
                    if (ownerDigits.length < 8) technicalStatus = "IDENTITY_UNCONFIRMED";
                    else if (!epDigits || ownerDigits !== epDigits) {
                      technicalStatus = "IDENTITY_MISMATCH";
                    } else technicalStatus = "CONNECTED";
                  } else if (inst.last_known_state === "connecting") {
                    technicalStatus = "CONNECTING";
                  } else if (inst.last_known_state === "close") {
                    technicalStatus = "QR_REQUIRED";
                  } else {
                    technicalStatus = "DISCONNECTED";
                  }
                }

                return {
                  endpointId: k.endpoint_id,
                  linkActive,
                  isRouteActive: l.active_endpoint_id === k.endpoint_id,
                  addressMasked: mask(ep?.external_address as string | null),
                  displayName: (ep?.display_name as string | null) ?? null,
                  provider: logical,
                  providerRaw: (ep?.provider as string | null) ?? null,
                  technicalStatus,
                  instanceName: logical === "evolution"
                    ? (instanceByEndpoint.get(k.endpoint_id)?.instance_name ?? null)
                    : null,
                  activationEligible,
                  activationBlockedReason,
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
      //
      // Revalidação FRESCA server-side no momento do clique (Evolution):
      // o `activationEligible` do `status` é apenas informativo para a UI e
      // pode estar segundos desatualizado. Antes de chamar a RPC de rotação
      // consultamos o estado REAL na Evolution e ressincronizamos a
      // identidade. Qualquer falha aborta ANTES da RPC — logo nem
      // `messaging_lines.active_endpoint_id` nem `messaging_line_rotations`
      // são tocados.
      case "setActiveEndpoint": {
        if (typeof body.lineId !== "string" || typeof body.endpointId !== "string") {
          return json(400, { error: "INVALID_INPUT", message: "lineId/endpointId" });
        }

        const { data: epRow } = await service
          .from("communication_endpoints")
          .select("id, organization_id, external_address, provider")
          .eq("id", body.endpointId)
          .maybeSingle();
        if (!epRow || epRow.organization_id !== orgId) {
          return json(404, { error: "ENDPOINT_NOT_FOUND" });
        }

        if (providerFromEndpoint(epRow.provider) === "evolution") {
          // 1-2. instância vinculada, mesma organização.
          const { data: inst } = await service
            .from("evolution_instances")
            .select("id, instance_name, organization_id")
            .eq("endpoint_id", body.endpointId)
            .eq("organization_id", orgId)
            .maybeSingle();
          if (!inst?.instance_name) {
            return json(409, { error: "ACTIVATE_EVOLUTION_IDENTITY_UNKNOWN", message: "instância não vinculada" });
          }

          // 3-7. estado REAL agora + ressincronização da identidade real.
          const sync = await syncEvolutionIdentity(inst.instance_name);
          if ("error" in sync) {
            return json(409, sync as Record<string, unknown>);
          }
          if (sync.connected !== true) {
            return json(409, {
              error: "ACTIVATE_EVOLUTION_NOT_CONNECTED",
              message: `estado real: ${sync.state}`,
            });
          }
          if (sync.identityKnown !== true) {
            return json(409, { error: "ACTIVATE_EVOLUTION_IDENTITY_UNKNOWN" });
          }
          // 8. comparação com o external_address normalizado do endpoint.
          const epDigits = digitsOf(epRow.external_address);
          if (!epDigits || sync.ownerDigits !== epDigits) {
            return json(409, {
              error: "ACTIVATE_EVOLUTION_IDENTITY_MISMATCH",
              message: `número conectado ${sync.ownerIdentity.masked ?? "desconhecido"} diverge do endpoint ${mask(epRow.external_address) ?? "—"}`,
            });
          }
        }

        // 9. só aqui a rotação acontece.
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

      // ------------------- INTEGRAÇÃO: conectar sessão (QR real) — Evolution
      case "connectInstance": {
        const name = typeof body.instanceName === "string" ? body.instanceName : "";
        if (!INSTANCE_NAME_RE.test(name)) {
          return json(400, { error: "INVALID_INPUT", message: "instanceName" });
        }
        if (!evolutionEnabled) {
          return json(403, { error: "FEATURE_DISABLED", message: EVOLUTION_FLAG });
        }

        const { data: row } = await service
          .from("evolution_instances")
          .select("id, organization_id")
          .eq("instance_name", name)
          .maybeSingle();
        if (!row) return json(404, { error: "INSTANCE_NOT_FOUND" });
        if (row.organization_id !== orgId) return json(403, { error: "INSTANCE_FOREIGN_ORG" });

        const provider = evolution();
        if (isEvolutionError(provider)) {
          return json(provider.status ?? 502, { error: provider.code, message: provider.message });
        }

        const out = await provider.connect(name);
        if (isEvolutionError(out)) {
          return json(out.status ?? 502, { error: out.code, message: out.message });
        }

        const expiresAt = new Date(Date.now() + 60_000).toISOString();
        await service.from("evolution_instances").update({
          last_known_state: "connecting",
          last_state_checked_at: new Date().toISOString(),
          last_qr_expires_at: expiresAt,
          updated_at: new Date().toISOString(),
        }).eq("id", row.id);

        return json(200, {
          instanceName: name,
          pairingCode: out?.pairingCode ?? null,
          qrBase64: out?.base64 ?? null,
          count: out?.count ?? 0,
          expiresAt,
        });
      }

      // -------------------- INTEGRAÇÃO: estado real (polling do modal de QR)
      //
      // Ao detectar `open`, ressincroniza a identidade a partir da resposta
      // REAL do servidor e compara com o endpoint esperado. Os campos são
      // booleanos explícitos (ou null quando indeterminado) — o frontend só
      // considera sucesso com os três `=== true`.
      case "instanceState": {
        const name = typeof body.instanceName === "string" ? body.instanceName : "";
        const sync = await syncEvolutionIdentity(name);
        if ("error" in sync) return json(200, { ...sync, connected: false });

        const targetEndpointId = typeof body.endpointId === "string"
          ? body.endpointId
          : sync.endpointId;
        const expectedDigits = targetEndpointId
          ? (await endpointDigits(targetEndpointId)) ?? ""
          : "";

        let identityMatchesEndpoint: boolean | null = null;
        if (sync.identityKnown && expectedDigits.length >= 8) {
          identityMatchesEndpoint = sync.ownerDigits === expectedDigits;
        }

        return json(200, {
          instanceName: sync.instanceName,
          state: sync.state,
          connected: sync.connected === true,
          identityKnown: sync.identityKnown === true,
          identityMatchesEndpoint,
          expectedMasked: expectedDigits ? mask(expectedDigits) : null,
          ownerMasked: sync.ownerIdentity.masked,
        });
      }

      // -------------------------------------------------- LIST INSTANCES (org)
      // Somente leitura da CONFIGURAÇÃO local do tenant. Nenhum segredo.
      case "listInstances": {
        const { data: rows } = await service
          .from("evolution_instances")
          .select(
            "id, instance_name, endpoint_id, provisioning_status, last_known_state, last_state_checked_at, owner_number_digits, created_at",
          )
          .eq("organization_id", orgId)
          .order("created_at", { ascending: true });

        return json(200, {
          organizationId: orgId,
          evolutionIntegration: evolutionEnabled,
          instances: ((rows ?? []) as Record<string, unknown>[]).map((r) => ({
            id: r.id,
            instanceName: r.instance_name,
            endpointId: r.endpoint_id ?? null,
            provisioningStatus: r.provisioning_status ?? "pending",
            state: r.last_known_state ?? "unknown",
            connected: r.last_known_state === "open",
            checkedAt: r.last_state_checked_at ?? null,
            ownerMasked: mask(r.owner_number_digits as string | null),
            identityKnown: digitsOf(r.owner_number_digits as string | null).length >= 8,
            createdAt: r.created_at,
          })),
        });
      }

      // ------------------------------------------------------ CREATE INSTANCE
      // Provisionamento de uma NOVA instância Evolution (porta de entrada:
      // card "Evolution WhatsApp"). O número real só é conhecido depois da
      // leitura do QR, portanto a instância nasce `pending` (endpoint_id NULL).
      // Nenhuma credencial é criada, duplicada ou retornada.
      case "createInstance": {
        if (!evolutionEnabled) {
          return json(403, { error: "FEATURE_DISABLED", message: EVOLUTION_FLAG });
        }
        const webhookSecret = Deno.env.get("EVOLUTION_WEBHOOK_SECRET");
        const supabaseUrl = Deno.env.get("SUPABASE_URL");
        if (!webhookSecret || !supabaseUrl) return json(503, { error: "MISSING_SECRET" });

        const provider = evolution();
        if (isEvolutionError(provider)) {
          return json(provider.status ?? 503, {
            error: provider.code,
            message: provider.message,
          });
        }

        // Nome técnico gerado SERVER-SIDE. O usuário nunca escolhe/injeta.
        const name = `evo-${orgId.replace(/-/g, "").slice(0, 8)}-${
          crypto.randomUUID().replace(/-/g, "").slice(0, 8)
        }`;
        if (!INSTANCE_NAME_RE.test(name)) return json(500, { error: "UNEXPECTED" });

        // 1. Registro local `pending` primeiro: sem órfãos invisíveis na UI.
        const { data: inserted, error: insErr } = await service
          .from("evolution_instances")
          .insert({
            organization_id: orgId,
            instance_name: name,
            endpoint_id: null,
            provisioning_status: "pending",
            last_known_state: "connecting",
          })
          .select("id, instance_name")
          .single();
        if (insErr || !inserted) {
          logEvolution("error", {
            fn: FN,
            requestId,
            orgId,
            code: "INSTANCE_INSERT_FAILED",
            message: insErr?.message ?? "insert failed",
          });
          return json(500, { error: "INSTANCE_INSERT_FAILED" });
        }

        // 2. Cria de fato no servidor Evolution.
        const created = await provider.create({ instanceName: name, qrcode: true });
        if (isEvolutionError(created)) {
          await service.from("evolution_instances").delete().eq("id", inserted.id);
          return json(created.status ?? 502, {
            error: created.code,
            message: created.message,
          });
        }

        // 3. Webhook obrigatório (URL montada no servidor, com o secret).
        const url = `${supabaseUrl.replace(/\/$/, "")}/functions/v1/evolution-webhook?token=${
          encodeURIComponent(webhookSecret)
        }`;
        const hook = await provider.webhookSet(name, {
          enabled: true,
          url,
          events: ["CONNECTION_UPDATE", "QRCODE_UPDATED", "MESSAGES_UPSERT", "MESSAGES_UPDATE"],
          webhookByEvents: false,
          webhookBase64: false,
        });
        if (hook !== true) {
          // Sem webhook a instância é inútil e perderia inbound: desfaz tudo.
          await provider.delete(name);
          await service.from("evolution_instances").delete().eq("id", inserted.id);
          return json(502, { error: "WEBHOOK_SET_FAILED" });
        }

        // 4. QR inicial.
        const qr = await provider.connect(name);
        if (isEvolutionError(qr)) {
          return json(200, { instanceId: inserted.id, instanceName: name, qr: null });
        }

        return json(200, {
          instanceId: inserted.id,
          instanceName: name,
          provisioningStatus: "pending",
          qr: { base64: qr.base64 ?? null, code: qr.code ?? null },
        });
      }

      // -------------------------------------------------------- SYNC WEBHOOK
      // Reaplica o webhook canônico de uma instância existente da org.
      case "syncWebhook": {
        if (!evolutionEnabled) {
          return json(403, { error: "FEATURE_DISABLED", message: EVOLUTION_FLAG });
        }
        const name = typeof body.instanceName === "string" ? body.instanceName : "";
        if (!INSTANCE_NAME_RE.test(name)) {
          return json(400, { error: "INVALID_INPUT", message: "instanceName" });
        }
        const { data: row } = await service
          .from("evolution_instances")
          .select("id, organization_id")
          .eq("instance_name", name)
          .maybeSingle();
        if (!row) return json(404, { error: "INSTANCE_NOT_FOUND" });
        if (row.organization_id !== orgId) return json(403, { error: "INSTANCE_FOREIGN_ORG" });

        const webhookSecret = Deno.env.get("EVOLUTION_WEBHOOK_SECRET");
        const supabaseUrl = Deno.env.get("SUPABASE_URL");
        if (!webhookSecret || !supabaseUrl) return json(503, { error: "MISSING_SECRET" });

        const provider = evolution();
        if (isEvolutionError(provider)) {
          return json(provider.status ?? 503, { error: provider.code });
        }
        const hook = await provider.webhookSet(name, {
          enabled: true,
          url: `${supabaseUrl.replace(/\/$/, "")}/functions/v1/evolution-webhook?token=${
            encodeURIComponent(webhookSecret)
          }`,
          events: ["CONNECTION_UPDATE", "QRCODE_UPDATED", "MESSAGES_UPSERT", "MESSAGES_UPDATE"],
          webhookByEvents: false,
          webhookBase64: false,
        });
        if (hook !== true) return json(502, { error: "WEBHOOK_SET_FAILED" });
        return json(200, { ok: true });
      }

      // ------------------------------------- SYNC PENDING INSTANCE IDENTITY
      // Leitura EXPLÍCITA da identidade real de uma instância recém-conectada.
      // `listInstances` permanece leitura pura: só este op consulta o provedor
      // e persiste `owner_jid` / `owner_number_digits`. Nada além da identidade
      // é tocado (nenhum endpoint, Route, número ativo ou rotação).
      case "syncPendingInstanceIdentity": {
        if (!evolutionEnabled) {
          return json(403, { error: "FEATURE_DISABLED", message: EVOLUTION_FLAG });
        }
        const instanceId = typeof body.instanceId === "string" ? body.instanceId : "";
        if (!instanceId) return json(400, { error: "INVALID_INPUT", message: "instanceId" });

        const { data: row } = await service
          .from("evolution_instances")
          .select(
            "id, organization_id, instance_name, provisioning_status, last_known_state, owner_number_digits",
          )
          .eq("id", instanceId)
          .maybeSingle();
        if (!row) return json(404, { error: "INSTANCE_NOT_FOUND" });
        if (row.organization_id !== orgId) return json(403, { error: "INSTANCE_FOREIGN_ORG" });
        if ((row.provisioning_status ?? "pending") !== "pending") {
          return json(409, { error: "INSTANCE_NOT_PENDING" });
        }
        if (row.last_known_state !== "open") {
          return json(409, { error: "INSTANCE_NOT_CONNECTED" });
        }

        const sync = await syncEvolutionIdentity(row.instance_name as string);
        if ("error" in sync) return json(400, sync as Record<string, unknown>);

        logEvolution("info", {
          fn: FN,
          requestId,
          orgId,
          op: body.op,
          code: sync.identityKnown ? "IDENTITY_SYNCED" : "IDENTITY_UNKNOWN",
          instanceName: row.instance_name as string,
        });

        return json(200, {
          instanceId: row.id,
          instanceName: sync.instanceName,
          state: sync.state,
          connected: sync.connected,
          identityKnown: sync.identityKnown,
          ownerMasked: sync.ownerIdentity.masked,
        });
      }

      // ------------------------------------------------- LINK PENDING INSTANCE
      // Vincula uma instância `pending` já conectada e com identidade conhecida
      // à Route Comercial da própria org. O número NUNCA vem do frontend: é
      // exclusivamente `owner_number_digits` lido da Evolution. A escrita é
      // atômica na RPC `provision_sales_endpoint`, que também marca
      // `provisioning_status='linked'`. Não altera `active_endpoint_id`, não
      // cria rotações e não toca Meta/Twilio/Atendimento.
      case "linkPendingInstance": {
        if (!evolutionEnabled) {
          return json(403, { error: "FEATURE_DISABLED", message: EVOLUTION_FLAG });
        }
        const instanceId = typeof body.instanceId === "string" ? body.instanceId : "";
        if (!instanceId) return json(400, { error: "INVALID_INPUT", message: "instanceId" });

        const { data: row } = await service
          .from("evolution_instances")
          .select(
            "id, organization_id, instance_name, endpoint_id, provisioning_status, last_known_state, owner_number_digits",
          )
          .eq("id", instanceId)
          .maybeSingle();
        if (!row) return json(404, { error: "INSTANCE_NOT_FOUND" });
        if (row.organization_id !== orgId) return json(403, { error: "INSTANCE_FOREIGN_ORG" });
        if ((row.provisioning_status ?? "pending") !== "pending" || row.endpoint_id) {
          return json(409, { error: "INSTANCE_ALREADY_LINKED" });
        }
        if (row.last_known_state !== "open") {
          return json(409, { error: "INSTANCE_NOT_CONNECTED" });
        }
        const digits = digitsOf(row.owner_number_digits as string | null);
        if (digits.length < 8) return json(409, { error: "INSTANCE_IDENTITY_UNKNOWN" });

        // Route Comercial (sales/whatsapp) da própria org.
        const { data: lines } = await service
          .from("messaging_lines")
          .select("id, is_active, created_at")
          .eq("organization_id", orgId)
          .eq("inbox_key", "sales")
          .eq("channel", "whatsapp")
          .order("created_at", { ascending: true });
        const line = ((lines ?? []) as { id: string; is_active: boolean | null }[])
          .find((l) => l.is_active === true) ?? (lines ?? [])[0] ?? null;
        if (!line) return json(409, { error: "SALES_ROUTE_NOT_FOUND" });

        const { data, error } = await caller.rpc("provision_sales_endpoint", {
          p_organization_id: orgId,
          p_line_id: (line as { id: string }).id,
          p_provider: "evolution",
          p_address: `+${digits}`,
          p_display_name: null,
          p_instance_name: row.instance_name as string,
        });
        if (error) {
          logEvolution("warn", {
            fn: FN,
            requestId,
            orgId,
            op: body.op,
            code: "LINK_PENDING_FAILED",
            message: error.message,
          });
          return json(400, { error: "PROVISION_FAILED", message: error.message });
        }

        logEvolution("info", {
          fn: FN,
          requestId,
          orgId,
          op: body.op,
          code: "INSTANCE_LINKED",
          instanceName: row.instance_name as string,
        });

        return json(200, { ok: true, result: data, ownerMasked: mask(digits) });
      }



      // ------------------------------------------------------ DELETE INSTANCE
      // TRAVA OBRIGATÓRIA: jamais remove silenciosamente uma instância cujo
      // endpoint esteja em uso (Route ativa, link ativo em qualquer linha —
      // Comercial ou Atendimento). Fail-closed com EVOLUTION_INSTANCE_IN_USE.
      case "deleteInstance": {
        const name = typeof body.instanceName === "string" ? body.instanceName : "";
        if (!INSTANCE_NAME_RE.test(name)) {
          return json(400, { error: "INVALID_INPUT", message: "instanceName" });
        }
        const { data: row } = await service
          .from("evolution_instances")
          .select("id, organization_id, instance_name, endpoint_id, provisioning_status")
          .eq("instance_name", name)
          .maybeSingle();
        if (!row) return json(404, { error: "INSTANCE_NOT_FOUND" });
        if (row.organization_id !== orgId) return json(403, { error: "INSTANCE_FOREIGN_ORG" });

        const endpointId = (row.endpoint_id as string | null) ?? null;
        if (endpointId) {
          const { data: activeLines } = await service
            .from("messaging_lines")
            .select("id, inbox_key, active_endpoint_id")
            .eq("active_endpoint_id", endpointId);
          if ((activeLines ?? []).length > 0) {
            return json(409, {
              error: "EVOLUTION_INSTANCE_IN_USE",
              message: "endpoint é o número ativo de uma Route",
              usedBy: (activeLines ?? []).map((l: Record<string, unknown>) => ({
                lineId: l.id,
                inboxKey: l.inbox_key,
                reason: "ACTIVE_ENDPOINT",
              })),
            });
          }

          const { data: activeLinks } = await service
            .from("messaging_line_endpoints")
            .select("line_id, endpoint_id, is_active")
            .eq("endpoint_id", endpointId)
            .eq("is_active", true);
          if ((activeLinks ?? []).length > 0) {
            return json(409, {
              error: "EVOLUTION_INSTANCE_IN_USE",
              message: "endpoint está vinculado e ativo em uma Route",
              usedBy: (activeLinks ?? []).map((l: Record<string, unknown>) => ({
                lineId: l.line_id,
                reason: "ACTIVE_LINK",
              })),
            });
          }
        }

        const provider = evolution();
        if (isEvolutionError(provider)) {
          return json(provider.status ?? 503, { error: provider.code });
        }
        const del = await provider.delete(name);
        if (del !== true && (del as { code?: string }).code !== "EVOLUTION_NOT_FOUND") {
          return json(502, {
            error: (del as { code: string }).code ?? "EVOLUTION_DELETE_FAILED",
          });
        }

        // Só o registro da instância é removido. O endpoint (configuração) e
        // qualquer histórico permanecem intactos.
        await service.from("evolution_instances").delete().eq("id", row.id);
        logEvolution("info", {
          fn: FN,
          requestId,
          orgId,
          code: "INSTANCE_DELETED",
          instanceName: name,
        });
        return json(200, { ok: true, endpointPreserved: endpointId });
      }

      default:
        return json(400, { error: "INVALID_INPUT", message: "unknown op" });
    }
  } catch (e) {
    logEvolution("error", { fn: FN, requestId, orgId, code: "UNEXPECTED", message: String(e) });
    return json(500, { error: "UNEXPECTED" });
  }
});
