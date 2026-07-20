// TEMPORARY discovery function — Phase 0 for Evolution API integration.
// Ephemeral by design. Deleted at the end of the discovery run.
// Guardrails:
// - Fixed switch of operations; no client-supplied url/method/path.
// - instanceName strictly validated (temporary discovery pattern only).
// - Secrets read only from env; never echoed in response or logs.
// - Additional x-discovery-token header check on top of platform auth.

import { corsHeaders } from "../_shared/cors.ts";

const EXTRA_HEADERS = {
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-discovery-token",
};
const CORS = { ...corsHeaders, ...EXTRA_HEADERS };

const INSTANCE_RE = /^evo_discovery_\d+_[a-z0-9]{6}$/;

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "content-type": "application/json" },
  });
}

function sanitizeBaseUrl(raw: string | undefined): string | null {
  if (!raw) return null;
  const t = raw.trim().replace(/\/+$/, "");
  if (!/^https?:\/\//i.test(t)) return null;
  return t;
}

function ctEq(a: string, b: string) {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

type OpSpec = {
  method: "GET" | "POST" | "DELETE";
  path: (args: Record<string, unknown>) => string;
  body?: (args: Record<string, unknown>) => unknown;
  requireInstance?: boolean;
};

const OPS: Record<string, OpSpec> = {
  serverInfo: { method: "GET", path: () => "/" },
  fetchInstances: { method: "GET", path: () => "/instance/fetchInstances" },
  fetchInstanceOne: {
    method: "GET",
    path: (a) => `/instance/fetchInstances?instanceName=${encodeURIComponent(String(a.instanceName))}`,
    requireInstance: true,
  },
  create: {
    method: "POST",
    path: () => "/instance/create",
    body: (a) => ({
      instanceName: String(a.instanceName),
      integration: "WHATSAPP-BAILEYS",
      qrcode: true,
    }),
    requireInstance: true,
  },
  connect: {
    method: "GET",
    path: (a) => `/instance/connect/${encodeURIComponent(String(a.instanceName))}`,
    requireInstance: true,
  },
  connectionState: {
    method: "GET",
    path: (a) => `/instance/connectionState/${encodeURIComponent(String(a.instanceName))}`,
    requireInstance: true,
  },
  webhookFind: {
    method: "GET",
    path: (a) => `/webhook/find/${encodeURIComponent(String(a.instanceName))}`,
    requireInstance: true,
  },
  webhookSet: {
    method: "POST",
    path: (a) => `/webhook/set/${encodeURIComponent(String(a.instanceName))}`,
    body: () => ({
      webhook: {
        enabled: true,
        url: "https://example.invalid/discovery",
        webhookByEvents: false,
        webhookBase64: false,
        events: [
          "CONNECTION_UPDATE",
          "QRCODE_UPDATED",
          "MESSAGES_UPSERT",
          "MESSAGES_UPDATE",
        ],
      },
    }),
    requireInstance: true,
  },
  logout: {
    method: "DELETE",
    path: (a) => `/instance/logout/${encodeURIComponent(String(a.instanceName))}`,
    requireInstance: true,
  },
  delete: {
    method: "DELETE",
    path: (a) => `/instance/delete/${encodeURIComponent(String(a.instanceName))}`,
    requireInstance: true,
  },
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json(405, { error: "method_not_allowed" });

  const token = Deno.env.get("EVOLUTION_DISCOVERY_TOKEN");
  const provided = req.headers.get("x-discovery-token") ?? "";
  if (!token || !ctEq(token, provided)) {
    return json(401, { error: "unauthorized" });
  }

  const base = sanitizeBaseUrl(Deno.env.get("EVOLUTION_BASE_URL"));
  const apiKey = Deno.env.get("EVOLUTION_GLOBAL_API_KEY");
  if (!base || !apiKey) return json(500, { error: "missing_upstream_config" });

  let payload: { op?: string; args?: Record<string, unknown> };
  try {
    payload = await req.json();
  } catch {
    return json(400, { error: "invalid_json" });
  }
  const opName = String(payload?.op ?? "");
  const args = (payload?.args ?? {}) as Record<string, unknown>;
  const spec = OPS[opName];
  if (!spec) return json(400, { error: "unknown_op", op: opName });

  if (spec.requireInstance) {
    const name = String(args.instanceName ?? "");
    if (!INSTANCE_RE.test(name)) {
      return json(400, { error: "invalid_instance_name" });
    }
  }

  const url = base + spec.path(args);
  const init: RequestInit = {
    method: spec.method,
    headers: {
      apikey: apiKey,
      "content-type": "application/json",
      accept: "application/json",
    },
    signal: AbortSignal.timeout(20000),
  };
  if (spec.body) init.body = JSON.stringify(spec.body(args));

  let upstreamStatus = 0;
  let upstreamText = "";
  let upstreamCT = "";
  try {
    const r = await fetch(url, init);
    upstreamStatus = r.status;
    upstreamCT = r.headers.get("content-type") ?? "";
    upstreamText = await r.text();
  } catch (e) {
    return json(502, { error: "upstream_error", message: String((e as Error).message) });
  }

  let parsed: unknown = null;
  if (upstreamCT.includes("application/json")) {
    try {
      parsed = JSON.parse(upstreamText);
    } catch {
      parsed = null;
    }
  }

  // Redact large base64/pairingCode fields recursively before returning.
  const redact = (v: unknown): unknown => {
    if (v && typeof v === "object") {
      if (Array.isArray(v)) return v.map(redact);
      const out: Record<string, unknown> = {};
      for (const [k, val] of Object.entries(v)) {
        if (typeof val === "string" && val.length > 120) {
          out[k] = {
            __redacted: true,
            length: val.length,
            prefix: val.slice(0, 40),
          };
        } else {
          out[k] = redact(val);
        }
      }
      return out;
    }
    return v;
  };

  return json(200, {
    op: opName,
    method: spec.method,
    path: spec.path(args),
    upstream_status: upstreamStatus,
    upstream_content_type: upstreamCT,
    body_length: upstreamText.length,
    body_json: parsed ? redact(parsed) : null,
    body_text: parsed === null ? upstreamText.slice(0, 2000) : null,
  });
});
