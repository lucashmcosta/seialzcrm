// Edge Function: evolution-instance-manager
// Fase 3 — Backend aditivo (INERTE em produção).
//
// Superfície: operações administrativas sobre instâncias Evolution
// (create/delete/connect/logout/connectionState/webhookSet/webhookFind).
//
// Bloqueios obrigatórios:
//   1. Requer JWT válido (Authorization: Bearer <access_token>).
//   2. Requer feature flag `evolution_api_enabled` ligada
//      (global OU para a org informada). Enquanto a flag estiver desligada,
//      TODA operação retorna 403 FEATURE_DISABLED sem tocar em nada.
//   3. NÃO cria communication_endpoints, messaging_lines nem
//      evolution_instances automaticamente. Apenas fala com o servidor
//      Evolution upstream.
//
// Nenhuma alteração em Meta, Twilio ou dispatcher.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { featureFlagEnabled } from "../_shared/feature-flags.ts";
import {
  EvolutionError,
  EvolutionWebhookConfig,
  EvolutionWebhookEvent,
} from "../_shared/evolution/types.ts";
import { readEvolutionEnv } from "../_shared/evolution/client.ts";
import { makeEvolutionProvider } from "../_shared/evolution/provider.ts";
import { logEvolution, newRequestId } from "../_shared/evolution/logger.ts";
import { callerKey, rateLimit } from "../_shared/evolution/rate-limit.ts";

const FN = "evolution-instance-manager" as const;
const FLAG = "evolution_api_enabled";

// Rate limit: 30 operações administrativas / 60s por IP.
const RL_LIMIT = 30;
const RL_WINDOW_MS = 60_000;

// Regex conservador para nomes de instância — evita path injection.
// Aceita apenas [a-zA-Z0-9_-], comprimento 3..64.
const INSTANCE_NAME_RE = /^[A-Za-z0-9_-]{3,64}$/;

const ALLOWED_EVENTS: EvolutionWebhookEvent[] = [
  "CONNECTION_UPDATE",
  "QRCODE_UPDATED",
  "MESSAGES_UPSERT",
  "MESSAGES_UPDATE",
];

type Op =
  | "create"
  | "delete"
  | "connect"
  | "logout"
  | "connectionState"
  | "webhookSet"
  | "webhookFind"
  | "fetch";

interface Body {
  op: Op;
  organizationId?: string | null;
  instanceName?: string;
  qrcode?: boolean;
  webhook?: {
    enabled: boolean;
    url: string;
    events: EvolutionWebhookEvent[];
    webhookByEvents?: boolean;
    webhookBase64?: boolean;
  };
}

function json(
  status: number,
  body: Record<string, unknown>,
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "content-type": "application/json" },
  });
}

function errFromEvolution(e: EvolutionError): Response {
  return json(e.status, { error: e.code, message: e.message });
}

function validateInstanceName(name: unknown): string | null {
  if (typeof name !== "string") return null;
  if (!INSTANCE_NAME_RE.test(name)) return null;
  return name;
}

function validateWebhook(
  w: Body["webhook"],
): EvolutionWebhookConfig | null {
  if (!w || typeof w !== "object") return null;
  if (typeof w.enabled !== "boolean") return null;
  if (typeof w.url !== "string" || !/^https?:\/\//i.test(w.url)) return null;
  if (!Array.isArray(w.events) || w.events.length === 0) return null;
  for (const ev of w.events) {
    if (!ALLOWED_EVENTS.includes(ev)) return null;
  }
  return {
    enabled: w.enabled,
    url: w.url,
    events: w.events,
    webhookByEvents: !!w.webhookByEvents,
    webhookBase64: !!w.webhookBase64,
  };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return json(405, { error: "METHOD_NOT_ALLOWED" });
  }

  const requestId = newRequestId();

  // ---- 0. Rate limit ----
  const rl = rateLimit(callerKey(req, "evo-mgr"), RL_LIMIT, RL_WINDOW_MS);
  if (!rl.allowed) {
    logEvolution("warn", { fn: FN, requestId, code: "RATE_LIMITED" });
    return new Response(JSON.stringify({ error: "RATE_LIMITED" }), {
      status: 429,
      headers: {
        ...corsHeaders,
        "content-type": "application/json",
        "retry-after": String(rl.retryAfterSec),
      },
    });
  }


  // ---- 1. Auth: JWT obrigatório ----
  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) {
    logEvolution("warn", { fn: FN, requestId, code: "UNAUTHORIZED" });
    return json(401, { error: "UNAUTHORIZED" });
  }
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } },
  );
  const token = authHeader.replace("Bearer ", "");
  const { data: claimsRes, error: claimsErr } = await supabase.auth.getClaims(
    token,
  );
  if (claimsErr || !claimsRes?.claims?.sub) {
    logEvolution("warn", { fn: FN, requestId, code: "UNAUTHORIZED" });
    return json(401, { error: "UNAUTHORIZED" });
  }

  // ---- 2. Body ----
  let body: Body;
  try {
    body = await req.json();
  } catch {
    return json(400, { error: "INVALID_INPUT", message: "invalid JSON" });
  }
  if (!body || typeof body !== "object" || typeof body.op !== "string") {
    return json(400, { error: "INVALID_INPUT", message: "missing op" });
  }

  const orgIdBody = typeof body.organizationId === "string"
    ? body.organizationId
    : null;

  // ---- 3. Feature flag (BLOQUEADORA nesta fase) ----
  // Resolvemos a organização pela `instance_name` quando possível, para que
  // a UI admin não precise conhecer/enviar o org_id. Se a instância não
  // existir ainda em `evolution_instances`, caímos no body.organizationId.
  const service = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  let resolvedOrgId: string | null = orgIdBody;
  let instanceRow: {
    id: string;
    organization_id: string;
    endpoint_id: string;
  } | null = null;
  if (typeof body.instanceName === "string" && body.instanceName.length > 0) {
    const { data } = await service
      .from("evolution_instances")
      .select("id,organization_id,endpoint_id")
      .eq("instance_name", body.instanceName)
      .maybeSingle();
    if (data) {
      instanceRow = data as typeof instanceRow;
      resolvedOrgId = instanceRow!.organization_id;
    }
  }

  const enabled = await featureFlagEnabled(service, FLAG, resolvedOrgId);
  if (!enabled) {
    logEvolution("info", {
      fn: FN,
      op: body.op,
      requestId,
      orgId: resolvedOrgId,
      code: "FEATURE_DISABLED",
      message: "evolution_api_enabled is off — no-op",
    });
    return json(403, {
      error: "FEATURE_DISABLED",
      message: "evolution_api_enabled is not enabled for this scope",
    });
  }

  // ---- 4. Secrets ----
  const envOrErr = readEvolutionEnv();
  if ("code" in envOrErr) {
    logEvolution("error", {
      fn: FN,
      requestId,
      code: envOrErr.code,
      message: envOrErr.message,
    });
    return errFromEvolution(envOrErr);
  }
  const provider = makeEvolutionProvider(envOrErr, requestId);

  // ---- 5. Dispatch ----
  try {
    switch (body.op) {
      case "fetch": {
        const name = body.instanceName
          ? validateInstanceName(body.instanceName) ?? undefined
          : undefined;
        if (body.instanceName && !name) {
          return json(400, { error: "INVALID_INPUT", message: "instanceName" });
        }
        const r = await provider.fetch(name);
        if (!Array.isArray(r) && "code" in r) return errFromEvolution(r);
        return json(200, { instances: r });
      }
      case "create": {
        const name = validateInstanceName(body.instanceName);
        if (!name) {
          return json(400, { error: "INVALID_INPUT", message: "instanceName" });
        }
        const r = await provider.create({
          instanceName: name,
          qrcode: body.qrcode ?? true,
        });
        if ("code" in r) return errFromEvolution(r);

        // Se existe uma linha em evolution_instances para essa `name`,
        // persistimos `instance_id_remote` e `last_state_checked_at`.
        // NUNCA criamos endpoints/linhas/instâncias novos aqui.
        if (instanceRow && r.instanceId) {
          await service
            .from("evolution_instances")
            .update({
              instance_id_remote: r.instanceId,
              integration: r.integration ?? "WHATSAPP-BAILEYS",
              last_state_checked_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            })
            .eq("id", instanceRow.id);
        }

        return json(200, {
          instanceName: r.instanceName,
          instanceId: r.instanceId,
          integration: r.integration,
          status: r.status,
          qrcode: r.qrcode
            ? {
              pairingCode: r.qrcode.pairingCode,
              base64: r.qrcode.base64,
              count: r.qrcode.count,
            }
            : null,
        });
      }
      case "delete": {
        const name = validateInstanceName(body.instanceName);
        if (!name) {
          return json(400, { error: "INVALID_INPUT", message: "instanceName" });
        }
        const r = await provider.delete(name);
        if (r !== true) return errFromEvolution(r);
        if (instanceRow) {
          await service
            .from("evolution_instances")
            .update({
              last_known_state: "close",
              instance_id_remote: null,
              last_state_checked_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            })
            .eq("id", instanceRow.id);
        }
        return json(200, { ok: true });
      }
      case "logout": {
        const name = validateInstanceName(body.instanceName);
        if (!name) {
          return json(400, { error: "INVALID_INPUT", message: "instanceName" });
        }
        const r = await provider.logout(name);
        if (r !== true) return errFromEvolution(r);
        if (instanceRow) {
          await service
            .from("evolution_instances")
            .update({
              last_known_state: "close",
              last_state_checked_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            })
            .eq("id", instanceRow.id);
        }
        return json(200, { ok: true });
      }
      case "connect": {
        const name = validateInstanceName(body.instanceName);
        if (!name) {
          return json(400, { error: "INVALID_INPUT", message: "instanceName" });
        }
        const r = await provider.connect(name);
        if ("code" in r) return errFromEvolution(r);
        if (instanceRow) {
          await service
            .from("evolution_instances")
            .update({
              last_known_state: "connecting",
              last_qr_expires_at: new Date(Date.now() + 60_000).toISOString(),
              last_state_checked_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            })
            .eq("id", instanceRow.id);
        }
        return json(200, {
          pairingCode: r.pairingCode,
          base64: r.base64,
          count: r.count,
        });
      }
      case "connectionState": {
        const name = validateInstanceName(body.instanceName);
        if (!name) {
          return json(400, { error: "INVALID_INPUT", message: "instanceName" });
        }
        const r = await provider.connectionState(name);
        if (typeof r !== "string") return errFromEvolution(r);
        if (instanceRow) {
          await service
            .from("evolution_instances")
            .update({
              last_known_state: r,
              last_state_checked_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            })
            .eq("id", instanceRow.id);
        }
        return json(200, { instanceName: name, state: r });
      }
      case "webhookFind": {
        const name = validateInstanceName(body.instanceName);
        if (!name) {
          return json(400, { error: "INVALID_INPUT", message: "instanceName" });
        }
        const r = await provider.webhookFind(name);
        if (r && typeof r === "object" && "code" in r) {
          return errFromEvolution(r as EvolutionError);
        }
        return json(200, { webhook: r });
      }
      case "webhookSet": {
        const name = validateInstanceName(body.instanceName);
        if (!name) {
          return json(400, { error: "INVALID_INPUT", message: "instanceName" });
        }
        // Segurança: a UI NÃO passa mais o token. Construímos a URL do
        // webhook no servidor injetando o `EVOLUTION_WEBHOOK_SECRET`,
        // evitando expor o secret ao frontend.
        const webhookSecret = Deno.env.get("EVOLUTION_WEBHOOK_SECRET");
        const supabaseUrl = Deno.env.get("SUPABASE_URL");
        if (!webhookSecret || !supabaseUrl) {
          return json(503, { error: "MISSING_SECRET" });
        }
        const requested = body.webhook;
        const events = (requested?.events && requested.events.length > 0)
          ? requested.events
          : ALLOWED_EVENTS;
        for (const ev of events) {
          if (!ALLOWED_EVENTS.includes(ev)) {
            return json(400, { error: "INVALID_INPUT", message: "webhook.events" });
          }
        }
        const url = `${supabaseUrl.replace(/\/$/, "")}/functions/v1/evolution-webhook?token=${encodeURIComponent(webhookSecret)}`;
        const cfg = {
          enabled: true,
          url,
          events,
          webhookByEvents: !!requested?.webhookByEvents,
          webhookBase64: !!requested?.webhookBase64,
        };
        const r = await provider.webhookSet(name, cfg);
        if (r !== true) return errFromEvolution(r);
        // Não devolvemos a URL para o cliente (contém o secret).
        return json(200, { ok: true, events });
      }
      default:
        return json(400, { error: "INVALID_INPUT", message: "unknown op" });
    }
      default:
        return json(400, { error: "INVALID_INPUT", message: "unknown op" });
    }
  } catch (err) {
    logEvolution("error", {
      fn: FN,
      requestId,
      op: body.op,
      code: "INTERNAL_ERROR",
      message: (err as Error)?.message ?? "unexpected",
    });
    return json(500, { error: "INTERNAL_ERROR" });
  }
});
