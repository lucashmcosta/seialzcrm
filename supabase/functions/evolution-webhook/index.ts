// Edge Function: evolution-webhook
// Fase 4 — Backend aditivo (INERTE em produção).
//
// Recebe webhooks do servidor Evolution API. Nesta fase:
//   • Autentica a origem EXCLUSIVAMENTE por `EVOLUTION_WEBHOOK_SECRET`
//     (secret independente, NUNCA reutiliza `EVOLUTION_GLOBAL_API_KEY`).
//   • Aplica rate limiting básico por IP.
//   • Valida estrutura mínima do envelope.
//   • Deduplica em memória (Fase 5 migrará para persistência em banco —
//     ver bloco "PREP: Idempotência persistente" abaixo).
//   • NÃO grava mensagens, contatos, threads, endpoints ou instâncias.
//   • Enquanto `evolution_api_enabled` estiver desligada (global e por org),
//     responde 202 imediatamente e não executa nada além de log informativo.
//
// verify_jwt=false — a autenticação é feita em código.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
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

// ---- Rate limit ----
// 120 requisições / 60s por IP. Suficiente para bursts legítimos do
// servidor Evolution; corta floods triviais sem alterar comportamento.
const RL_LIMIT = 120;
const RL_WINDOW_MS = 60_000;

// ---- Idempotência (Fase 4: memória) ----
// PREP: Idempotência persistente (Fase 5)
// ---------------------------------------
// Na próxima fase, quando o consumo real do webhook for ligado, esta
// verificação deve ser substituída por uma inserção em
// `public.integration_inbound_events` (tabela já existente) com uma
// UNIQUE constraint sobre (provider, event_key). Conflito = duplicata.
// O contrato da `idempotencyKey()` abaixo já produz a chave estável que
// será persistida. Nada mais precisa mudar no restante do handler.
const IDEMP_TTL_MS = 5 * 60_000;
const idempotency = new Map<string, number>();

function seenRecently(key: string): boolean {
  const now = Date.now();
  if (idempotency.size > 5000) {
    for (const [k, t] of idempotency) {
      if (t < now - IDEMP_TTL_MS) idempotency.delete(k);
    }
  }
  const ts = idempotency.get(key);
  if (ts && ts > now - IDEMP_TTL_MS) return true;
  idempotency.set(key, now);
  return false;
}

const KNOWN_EVENTS = new Set([
  "CONNECTION_UPDATE",
  "QRCODE_UPDATED",
  "MESSAGES_UPSERT",
  "MESSAGES_UPDATE",
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

  // ---- 1. Auth (secret exclusivo do webhook) ----
  const expected = Deno.env.get("EVOLUTION_WEBHOOK_SECRET");
  if (!expected) {
    logEvolution("error", {
      fn: FN,
      requestId,
      code: "MISSING_SECRET",
      message: "EVOLUTION_WEBHOOK_SECRET not set",
    });
    return json(503, { error: "MISSING_SECRET" });
  }
  const presented = extractInboundToken(req);
  if (!presented || !safeEqual(presented, expected)) {
    logEvolution("warn", { fn: FN, requestId, code: "UNAUTHORIZED" });
    return json(401, { error: "UNAUTHORIZED" });
  }

  // ---- 2. Parse envelope ----
  let envelope: EvolutionWebhookEnvelope;
  try {
    envelope = await req.json() as EvolutionWebhookEnvelope;
  } catch {
    return json(400, { error: "INVALID_INPUT", message: "invalid JSON" });
  }
  if (!envelope || typeof envelope !== "object") {
    return json(400, { error: "INVALID_INPUT" });
  }

  const event = typeof envelope.event === "string" ? envelope.event : null;
  const instance = typeof envelope.instance === "string"
    ? envelope.instance
    : null;
  const knownEvent = event ? KNOWN_EVENTS.has(event.toUpperCase()) : false;

  // ---- 3. Idempotência (memória; Fase 5 → banco) ----
  const idKey = idempotencyKey(envelope);
  if (seenRecently(idKey)) {
    logEvolution("info", {
      fn: FN,
      requestId,
      event: event ?? undefined,
      instanceName: instance ?? undefined,
      code: "DUPLICATE_EVENT",
    });
    return json(200, {
      ok: true,
      duplicate: true,
      contract: EVOLUTION_WEBHOOK_CONTRACT_VERSION,
    });
  }

  // ---- 4. Feature flag (BLOQUEADORA nesta fase) ----
  const service = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
  const enabled = await featureFlagEnabled(service, FLAG, null);
  if (!enabled) {
    logEvolution("info", {
      fn: FN,
      requestId,
      event: event ?? undefined,
      instanceName: instance ?? undefined,
      code: "FEATURE_DISABLED",
      message: "webhook accepted but not processed (flag off)",
    });
    return json(202, {
      accepted: true,
      processed: false,
      reason: "FEATURE_DISABLED",
      contract: EVOLUTION_WEBHOOK_CONTRACT_VERSION,
    });
  }

  // ---- 5. Feature ligada: mesmo assim NÃO grava nada nesta fase ----
  logEvolution("info", {
    fn: FN,
    requestId,
    event: event ?? undefined,
    instanceName: instance ?? undefined,
    code: knownEvent ? undefined : "UNKNOWN_EVENT",
    message: knownEvent ? "event observed (no-op)" : "unknown event (no-op)",
  });

  return json(200, {
    ok: true,
    processed: false,
    known: knownEvent,
    contract: EVOLUTION_WEBHOOK_CONTRACT_VERSION,
  });
});
