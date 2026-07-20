// Edge Function: evolution-webhook
// Fase 5 — Piloto controlado (Viagi).
//
// Responsabilidades desta fase:
//   • Autentica por `EVOLUTION_WEBHOOK_SECRET` (secret dedicado).
//   • Rate-limit por IP.
//   • Persiste idempotência em `public.integration_inbound_events`
//     via UNIQUE (integration_slug, idempotency_key). Conflito = duplicata.
//     Substitui a dedup em memória da Fase 4.
//   • Resolve a organização pela `instance` do envelope contra
//     `public.evolution_instances` e checa a feature flag PER-ORG.
//   • Processa APENAS `CONNECTION_UPDATE` e `QRCODE_UPDATED`,
//     atualizando somente:
//        - last_known_state
//        - last_state_checked_at
//        - last_qr_expires_at
//        - instance_id_remote (quando revelado pelo evento)
//   • NÃO cria mensagens, threads, contatos, endpoints ou linhas.
//   • NÃO aciona dispatcher, composer, filas ou automações.
//   • Eventos de mensagem (`MESSAGES_UPSERT`/`MESSAGES_UPDATE`) são
//     persistidos apenas como log inbound (para idempotência) e ignorados.
//
// verify_jwt=false — auth em código.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient, SupabaseClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { featureFlagEnabled } from "../_shared/feature-flags.ts";
import { logEvolution, newRequestId } from "../_shared/evolution/logger.ts";
import { callerKey, rateLimit } from "../_shared/evolution/rate-limit.ts";
import {
  EVOLUTION_WEBHOOK_CONTRACT_VERSION,
  EvolutionWebhookEnvelope,
} from "../_shared/evolution/types.ts";

const FN = "evolution-webhook" as const;
const FLAG = "evolution_api_enabled";
const INTEGRATION_SLUG = "evolution_api";

// ---- Rate limit ----
const RL_LIMIT = 120;
const RL_WINDOW_MS = 60_000;

// TTL do registro em `integration_inbound_events`. Não é usado para
// dedup (o índice UNIQUE já dedupa "para sempre"); serve apenas para
// higienização eventual de log.
const INBOUND_EVENT_TTL_MS = 7 * 24 * 60 * 60_000;

const KNOWN_EVENTS = new Set([
  "CONNECTION_UPDATE",
  "QRCODE_UPDATED",
  "MESSAGES_UPSERT",
  "MESSAGES_UPDATE",
]);

// Eventos que geram efeito colateral em `evolution_instances`.
// Mensagens NÃO estão nesta lista — são registradas apenas como log
// inbound e ignoradas nesta fase.
const STATEFUL_EVENTS = new Set([
  "CONNECTION_UPDATE",
  "QRCODE_UPDATED",
]);

function json(status: number, body: Record<string, unknown>, extra?: HeadersInit): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "content-type": "application/json", ...(extra ?? {}) },
  });
}

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function extractInboundToken(req: Request): string | null {
  const h1 = req.headers.get("x-evolution-webhook-secret");
  if (h1) return h1;
  const h2 = req.headers.get("x-evolution-token");
  if (h2) return h2;
  const h3 = req.headers.get("apikey");
  if (h3) return h3;
  try {
    const url = new URL(req.url);
    const q = url.searchParams.get("token");
    if (q) return q;
  } catch { /* noop */ }
  return null;
}

function idempotencyKey(env: EvolutionWebhookEnvelope): string {
  const inst = typeof env.instance === "string" ? env.instance : "?";
  const evt = typeof env.event === "string" ? env.event : "?";
  const data = (env.data ?? {}) as Record<string, unknown>;
  const key =
    (typeof (data as { key?: { id?: string } }).key?.id === "string" &&
      (data as { key: { id: string } }).key.id) ||
    (typeof (data as { id?: string }).id === "string"
      ? (data as { id: string }).id
      : "") ||
    env.date_time || "";
  return `${inst}|${evt}|${key}`;
}

// Extrai o `state` de um envelope CONNECTION_UPDATE.
function extractConnectionState(env: EvolutionWebhookEnvelope):
  "open" | "connecting" | "close" | "unknown" | null {
  const data = (env.data ?? {}) as Record<string, unknown>;
  const raw = (data.state ?? data.status ?? data.connection ?? null);
  if (typeof raw !== "string") return null;
  const s = raw.toLowerCase();
  if (s === "open" || s === "connected") return "open";
  if (s === "connecting" || s === "qr" || s === "pairing") return "connecting";
  if (s === "close" || s === "closed" || s === "disconnected" || s === "logout") return "close";
  return "unknown";
}

// QR expira em ~60s por padrão no Evolution/Baileys. Se o envelope trouxer
// TTL, usamos; caso contrário, aplicamos default conservador.
function extractQrExpiresAt(env: EvolutionWebhookEnvelope): Date {
  const data = (env.data ?? {}) as Record<string, unknown>;
  const ttlRaw = data.ttl ?? data.expires_in ?? data.expiresIn;
  const ttlSec = typeof ttlRaw === "number" && ttlRaw > 0 && ttlRaw < 3600
    ? ttlRaw
    : 60;
  return new Date(Date.now() + ttlSec * 1000);
}

function extractInstanceIdRemote(env: EvolutionWebhookEnvelope): string | null {
  const data = (env.data ?? {}) as Record<string, unknown>;
  const inst = (data.instance ?? data.instanceId ?? data.instance_id) as
    | { instanceId?: string; id?: string } | string | undefined;
  if (typeof inst === "string") return inst;
  if (inst && typeof inst === "object") {
    if (typeof inst.instanceId === "string") return inst.instanceId;
    if (typeof inst.id === "string") return inst.id;
  }
  return null;
}

// Insere o evento inbound. Retorna:
//   { duplicate: true } se conflito no índice UNIQUE.
//   { duplicate: false, id, orgId } se novo.
async function recordInboundEvent(
  service: SupabaseClient,
  args: {
    envelope: EvolutionWebhookEnvelope;
    idKey: string;
    orgId: string | null;
    req: Request;
    handlerKey: string;
    processStatus: "ignored" | "processed";
  },
): Promise<
  | { duplicate: true }
  | { duplicate: false; id: string }
  | { error: string }
> {
  const { envelope, idKey, orgId, req, handlerKey, processStatus } = args;
  const now = new Date();
  const expiresAt = new Date(now.getTime() + INBOUND_EVENT_TTL_MS);

  const externalId =
    typeof ((envelope.data ?? {}) as { key?: { id?: string } }).key?.id === "string"
      ? ((envelope.data as { key: { id: string } }).key.id)
      : (typeof (envelope.data as { id?: string })?.id === "string"
        ? (envelope.data as { id: string }).id
        : null);

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    ?? req.headers.get("cf-connecting-ip")
    ?? req.headers.get("x-real-ip")
    ?? null;

  const insertRow = {
    organization_id: orgId,
    integration_slug: INTEGRATION_SLUG,
    source_event: typeof envelope.event === "string" ? envelope.event : "unknown",
    external_id: externalId,
    idempotency_key: idKey,
    raw_payload: envelope as unknown as Record<string, unknown>,
    headers: {}, // não persistimos headers para não vazar tokens
    http_method: "POST",
    request_path: "/functions/v1/evolution-webhook",
    received_at: now.toISOString(),
    process_status: processStatus,
    processed_at: processStatus === "processed" ? now.toISOString() : null,
    parser_function: FN,
    parser_version: 1,
    parse_attempts: 1,
    last_attempt_at: now.toISOString(),
    expires_at: expiresAt.toISOString(),
    event_version: 1,
    aggregate_type: "evolution_instance",
    aggregate_id: typeof envelope.instance === "string" ? envelope.instance : null,
    source_ip: ip,
    handler_key: handlerKey,
    shadow_mode: false,
  };

  const { data, error } = await service
    .from("integration_inbound_events")
    .insert(insertRow)
    .select("id")
    .maybeSingle();

  if (error) {
    // Postgres 23505 = unique_violation → duplicata (idempotência).
    if ((error as { code?: string }).code === "23505") {
      return { duplicate: true };
    }
    return { error: error.message };
  }
  if (!data) return { error: "insert_returned_no_row" };
  return { duplicate: false, id: (data as { id: string }).id };
}

async function resolveInstanceRow(
  service: SupabaseClient,
  instanceName: string,
): Promise<
  | { id: string; organization_id: string; endpoint_id: string }
  | null
> {
  const { data } = await service
    .from("evolution_instances")
    .select("id,organization_id,endpoint_id")
    .eq("instance_name", instanceName)
    .maybeSingle();
  return (data as { id: string; organization_id: string; endpoint_id: string } | null) ?? null;
}

async function applyEventToInstance(
  service: SupabaseClient,
  args: {
    instanceRowId: string;
    event: string;
    envelope: EvolutionWebhookEnvelope;
  },
): Promise<{ updated: boolean; fields: Record<string, unknown> }> {
  const { instanceRowId, event, envelope } = args;
  const now = new Date().toISOString();
  const patch: Record<string, unknown> = {
    last_state_checked_at: now,
    updated_at: now,
  };

  if (event === "CONNECTION_UPDATE") {
    const state = extractConnectionState(envelope);
    if (state) patch.last_known_state = state;
    const remoteId = extractInstanceIdRemote(envelope);
    if (remoteId) patch.instance_id_remote = remoteId;
  } else if (event === "QRCODE_UPDATED") {
    patch.last_qr_expires_at = extractQrExpiresAt(envelope).toISOString();
    // Um QR fresco implica estado "connecting".
    patch.last_known_state = "connecting";
  }

  const { error } = await service
    .from("evolution_instances")
    .update(patch)
    .eq("id", instanceRowId);

  if (error) return { updated: false, fields: patch };
  return { updated: true, fields: patch };
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
  const rl = rateLimit(callerKey(req, "evo-wh"), RL_LIMIT, RL_WINDOW_MS);
  if (!rl.allowed) {
    logEvolution("warn", { fn: FN, requestId, code: "RATE_LIMITED" });
    return json(429, { error: "RATE_LIMITED" }, {
      "retry-after": String(rl.retryAfterSec),
    });
  }

  // ---- 1. Auth ----
  const expected = Deno.env.get("EVOLUTION_WEBHOOK_SECRET");
  if (!expected) {
    logEvolution("error", { fn: FN, requestId, code: "MISSING_SECRET" });
    return json(503, { error: "MISSING_SECRET" });
  }
  const presented = extractInboundToken(req);
  if (!presented || !safeEqual(presented, expected)) {
    logEvolution("warn", { fn: FN, requestId, code: "UNAUTHORIZED" });
    return json(401, { error: "UNAUTHORIZED" });
  }

  // ---- 2. Parse ----
  let envelope: EvolutionWebhookEnvelope;
  try {
    envelope = await req.json() as EvolutionWebhookEnvelope;
  } catch {
    return json(400, { error: "INVALID_INPUT", message: "invalid JSON" });
  }
  if (!envelope || typeof envelope !== "object") {
    return json(400, { error: "INVALID_INPUT" });
  }

  const eventRaw = typeof envelope.event === "string" ? envelope.event : null;
  const event = eventRaw ? eventRaw.toUpperCase() : null;
  const instance = typeof envelope.instance === "string" ? envelope.instance : null;
  const knownEvent = event ? KNOWN_EVENTS.has(event) : false;
  const isStateful = event ? STATEFUL_EVENTS.has(event) : false;

  const service = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // ---- 3. Resolver instância → organização ----
  const instanceRow = instance
    ? await resolveInstanceRow(service, instance)
    : null;
  const orgId = instanceRow?.organization_id ?? null;

  // ---- 4. Feature flag (per-org quando conhecemos a org; global caso contrário) ----
  const enabled = await featureFlagEnabled(service, FLAG, orgId);
  if (!enabled) {
    logEvolution("info", {
      fn: FN,
      requestId,
      event: eventRaw ?? undefined,
      instanceName: instance ?? undefined,
      orgId,
      code: "FEATURE_DISABLED",
    });
    return json(202, {
      accepted: true,
      processed: false,
      reason: "FEATURE_DISABLED",
      contract: EVOLUTION_WEBHOOK_CONTRACT_VERSION,
    });
  }

  // ---- 5. Idempotência persistente (INSERT ... UNIQUE) ----
  const idKey = idempotencyKey(envelope);
  const willProcess = !!(isStateful && instanceRow);

  const recorded = await recordInboundEvent(service, {
    envelope,
    idKey,
    orgId,
    req,
    handlerKey: `evolution:${event ?? "unknown"}`,
    processStatus: willProcess ? "processed" : "ignored",
  });

  if ("error" in recorded) {
    logEvolution("error", {
      fn: FN,
      requestId,
      event: eventRaw ?? undefined,
      instanceName: instance ?? undefined,
      code: "INTERNAL_ERROR",
      message: `inbound insert failed: ${recorded.error}`,
    });
    return json(500, { error: "INTERNAL_ERROR" });
  }
  if (recorded.duplicate) {
    logEvolution("info", {
      fn: FN,
      requestId,
      event: eventRaw ?? undefined,
      instanceName: instance ?? undefined,
      code: "DUPLICATE_EVENT",
    });
    return json(200, {
      ok: true,
      duplicate: true,
      contract: EVOLUTION_WEBHOOK_CONTRACT_VERSION,
    });
  }

  // ---- 6. Efeito colateral (apenas metadados da instância) ----
  if (!willProcess) {
    logEvolution("info", {
      fn: FN,
      requestId,
      event: eventRaw ?? undefined,
      instanceName: instance ?? undefined,
      orgId,
      code: knownEvent ? undefined : "UNKNOWN_EVENT",
      message: instanceRow
        ? "event logged, no state effect in phase 5"
        : "instance not registered — logged only",
    });
    return json(200, {
      ok: true,
      processed: false,
      known: knownEvent,
      contract: EVOLUTION_WEBHOOK_CONTRACT_VERSION,
    });
  }

  const applied = await applyEventToInstance(service, {
    instanceRowId: instanceRow!.id,
    event: event!,
    envelope,
  });

  logEvolution("info", {
    fn: FN,
    requestId,
    event: eventRaw ?? undefined,
    instanceName: instance ?? undefined,
    orgId,
    message: applied.updated ? "instance metadata updated" : "instance update failed",
  });

  return json(200, {
    ok: true,
    processed: applied.updated,
    known: true,
    contract: EVOLUTION_WEBHOOK_CONTRACT_VERSION,
  });
});
