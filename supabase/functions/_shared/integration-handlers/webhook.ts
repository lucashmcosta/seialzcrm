// Handler genérico de webhook outbound.
// subscription.config esperado: { url: string, secret?: string }
// Faz POST com assinatura HMAC-SHA256 do body usando o secret.

import { Classification, type Handler, type HandlerResult } from "./types.ts";
import { fetchWithClassification } from "./http.ts";

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

export const webhookDispatchHandler: Handler = async (ctx): Promise<HandlerResult> => {
  const config = ctx.subscription.config as { url?: string; secret?: string };
  const url = (config.url ?? "").trim();
  if (!url) {
    return {
      classification: Classification.Permanent,
      error: "subscription.config.url is missing",
    };
  }

  const body = JSON.stringify({
    event_id: ctx.event.id,
    event_type: ctx.event.event_type,
    entity_type: ctx.event.entity_type,
    entity_id: ctx.event.entity_id,
    organization_id: ctx.event.organization_id,
    occurred_at: ctx.event.occurred_at,
    payload: ctx.event.payload,
  });

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "X-Event-Id": ctx.event.id,
    "X-Event-Type": ctx.event.event_type,
    "X-Idempotency-Key": ctx.job.idempotency_key,
  };

  if (config.secret) {
    headers["X-Signature"] = `sha256=${await hmacSha256Hex(config.secret, body)}`;
  }

  const res = await fetchWithClassification(url, { method: "POST", headers, body });

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
    entityType: ctx.event.entity_type,
    internalId: ctx.event.entity_id,
  };
};
