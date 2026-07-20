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

  const orgId = typeof body.organizationId === "string"
    ? body.organizationId
    : null;

  // ---- 3. Feature flag (BLOQUEADORA nesta fase) ----
  // Nenhuma operação executa enquanto a flag estiver desligada.
  const service = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
  const enabled = await featureFlagEnabled(service, FLAG, orgId);
  if (!enabled) {
    logEvolution("info", {
      fn: FN,
      op: body.op,
      requestId,
      orgId,
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
        // Redigimos o hash antes de devolver ao caller: nesta fase o cliente
        // não tem consumidor legítimo para o token da instância.
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
        return json(200, { ok: true });
      }
      case "logout": {
        const name = validateInstanceName(body.instanceName);
        if (!name) {
          return json(400, { error: "INVALID_INPUT", message: "instanceName" });
        }
        const r = await provider.logout(name);
        if (r !== true) return errFromEvolution(r);
        return json(200, { ok: true });
      }
      case "connect": {
        const name = validateInstanceName(body.instanceName);
        if (!name) {
          return json(400, { error: "INVALID_INPUT", message: "instanceName" });
        }
        const r = await provider.connect(name);
        if ("code" in r) return errFromEvolution(r);
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
        const cfg = validateWebhook(body.webhook);
        if (!cfg) {
          return json(400, { error: "INVALID_INPUT", message: "webhook" });
        }
        const r = await provider.webhookSet(name, cfg);
        if (r !== true) return errFromEvolution(r);
        return json(200, { ok: true });
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
