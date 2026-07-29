// Handler outbound Seialz -> Nammux.
// target_action = "send_opportunity_won"
// Lê URL/secret de organization_integrations.config_values (slug = 'nammux').

import { Classification, type Handler, type HandlerResult } from "./types.ts";
import { fetchWithClassification } from "./http.ts";
import { loadActiveIntegrationSecret } from "../integration-credentials.ts";

interface NammuxConfig {
  webhook_url?: string;
  enabled?: boolean;
  send_opportunity_won?: boolean;
  nammux_organization_id?: string;
}

function allowedNammuxWebhook(value: string): URL | null {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password) return null;
    const defaults = ["rqnbnbbbmhtynuhecavv.supabase.co"];
    const allowed = (Deno.env.get("NAMMUX_ALLOWED_WEBHOOK_HOSTS") ?? defaults.join(","))
      .split(",")
      .map((host) => host.trim().toLowerCase())
      .filter(Boolean);
    return allowed.includes(url.hostname.toLowerCase()) ? url : null;
  } catch {
    return null;
  }
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
  const url = allowedNammuxWebhook((cfg.webhook_url ?? "").trim());
  let credential;
  try {
    credential = await loadActiveIntegrationSecret(
      ctx.supabase,
      ctx.event.organization_id,
    );
  } catch (error) {
    return {
      classification: Classification.Permanent,
      error: error instanceof Error ? error.message : String(error),
    };
  }
  if (!url || !credential) {
    return {
      classification: Classification.Permanent,
      error: "Allowed webhook URL or active tenant credential is missing",
    };
  }

  const eventIdemKey = ((ctx.event as unknown as { idempotency_key?: string }).idempotency_key ?? "").toString();
  const targetOrgId = (cfg.nammux_organization_id ?? "").trim();
  if (!targetOrgId) {
    return {
      classification: Classification.Permanent,
      error: "Nammux Organization ID não configurado.",
    };
  }

  const seialzOrgId = ctx.event.organization_id;
  const basePayload = (ctx.event.payload ?? {}) as Record<string, unknown>;
  const data = {
    ...basePayload,
    organization_id: seialzOrgId,
    target_organization_id: targetOrgId,
  };
  const envelope: Record<string, unknown> = {
    event_id: ctx.event.id,
    event_type: ctx.event.event_type,
    schema_version: Number(basePayload.schema_version ?? 1),
    idempotency_key: eventIdemKey,
    source: "seialz_crm",
    source_organization_id: seialzOrgId,
    organization_id: seialzOrgId,
    target_organization_id: targetOrgId,
    correlation_id: ctx.event.id,
    entity: {
      type: ctx.event.entity_type,
      id: ctx.event.entity_id,
    },
    occurred_at: ctx.event.occurred_at,
    data,
  };
  const rawBody = JSON.stringify(envelope);
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const signature = await hmacSha256Hex(credential.secret, `${timestamp}.${rawBody}`);

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "X-Seialz-Signature": `sha256=${signature}`,
    "X-Seialz-Key-Id": credential.keyId,
    "X-Seialz-Timestamp": timestamp,
    "X-Seialz-Event-Id": ctx.event.id,
    "X-Seialz-Event-Type": ctx.event.event_type,
    "X-Seialz-Idempotency-Key": eventIdemKey,
    "X-Seialz-Organization-Id": seialzOrgId,
    "X-Seialz-Target-Organization-Id": targetOrgId,
    "X-Trace-Id": ctx.event.id,
    "User-Agent": "Seialz-Integration-Worker/1.0",
  };
  const replay = (basePayload._replay as { replay?: boolean } | undefined)?.replay === true;
  if (replay) {
    headers["X-Seialz-Replay"] = "true";
    headers["X-Seialz-Delivery-Id"] = ctx.event.id;
  }
  if (targetOrgId) headers["X-Nammux-Organization-Id"] = targetOrgId;

  const res = await fetchWithClassification(url.toString(), { method: "POST", headers, body: rawBody });

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
    externalId:
      typeof externalPayload?.external_process_id === "string"
        ? externalPayload.external_process_id
        : undefined,
    entityType: ctx.event.entity_type,
    internalId: ctx.event.entity_id,
  };
};
