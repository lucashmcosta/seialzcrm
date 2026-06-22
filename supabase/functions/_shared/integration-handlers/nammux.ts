// Handler outbound Seialz -> Nammux.
// target_action = "send_opportunity_won"
// Lê URL/secret de organization_integrations.config_values (slug = 'nammux').

import { Classification, type Handler, type HandlerResult } from "./types.ts";
import { fetchWithClassification } from "./http.ts";

interface NammuxConfig {
  webhook_url?: string;
  webhook_secret?: string;
  enabled?: boolean;
  send_opportunity_won?: boolean;
}

// deno-lint-ignore no-explicit-any
async function loadNammuxConfig(supabase: any, organizationId: string): Promise<NammuxConfig | null> {
  const { data, error } = await supabase
    .from("organization_integrations")
    .select("config_values, is_enabled, integration:admin_integrations!inner(slug)")
    .eq("organization_id", organizationId)
    .eq("admin_integrations.slug", "nammux")
    .eq("is_enabled", true)
    .maybeSingle();
  if (error || !data) return null;
  return (data.config_values ?? {}) as NammuxConfig;
}

async function hmacSha256Hex(secret: string, message: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(message));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export const nammuxSendOpportunityWonHandler: Handler = async (ctx): Promise<HandlerResult> => {
  const cfg = await loadNammuxConfig(ctx.supabase, ctx.event.organization_id);
  if (!cfg) {
    return {
      classification: Classification.Permanent,
      error: "Nammux integration not configured or disabled for this organization",
    };
  }
  if (cfg.enabled === false || cfg.send_opportunity_won === false) {
    return {
      classification: Classification.Permanent,
      error: "Nammux opportunity.won disabled in config_values (enabled / send_opportunity_won)",
    };
  }
  const url = (cfg.webhook_url ?? "").trim();
  const secret = (cfg.webhook_secret ?? "").trim();
  if (!url || !secret) {
    return {
      classification: Classification.Permanent,
      error: "config_values.webhook_url or webhook_secret is missing",
    };
  }

  const envelope = {
    event_id: ctx.event.id,
    event_type: ctx.event.event_type,
    idempotency_key: ctx.job.idempotency_key.replace(/:[0-9a-f-]{36}$/i, ""), // strip subscription suffix -> evento idem key
    organization_id: ctx.event.organization_id,
    occurred_at: ctx.event.occurred_at,
    data: ctx.event.payload,
  };
  // Garante chave estável idêntica ao integration_events.idempotency_key.
  // (fn_fanout_event concatena ":<subscription_id>"; removemos pra usar a do evento.)
  const rawBody = JSON.stringify(envelope);
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const signature = await hmacSha256Hex(secret, `${timestamp}.${rawBody}`);

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "X-Seialz-Signature": `sha256=${signature}`,
    "X-Seialz-Timestamp": timestamp,
    "X-Seialz-Event-Id": ctx.event.id,
    "X-Seialz-Event-Type": ctx.event.event_type,
    "X-Seialz-Idempotency-Key": envelope.idempotency_key,
    "X-Seialz-Organization-Id": ctx.event.organization_id,
    "X-Trace-Id": ctx.event.id,
    "User-Agent": "Seialz-Integration-Worker/1.0",
  };

  const res = await fetchWithClassification(url, { method: "POST", headers, body: rawBody });

  let externalPayload: Record<string, unknown> | undefined;
  try {
    externalPayload = res.body ? JSON.parse(res.body) : undefined;
  } catch {
    externalPayload = res.body ? { raw: res.body.slice(0, 2000) } : undefined;
  }

  return {
    classification: res.classification,
    httpStatus: res.status,
    durationMs: res.durationMs,
    error: res.error,
    externalPayload,
    entityType: "opportunity",
    internalId: (ctx.event.payload as { id?: string })?.id ?? ctx.event.id,
  };
};
