// Edge Function: evolution-webhook
// Fase 3 — Backend aditivo (INERTE em produção).
//
// Recebe webhooks do servidor Evolution API. Nesta fase:
//   • Autentica a origem por token compartilhado no header ou querystring.
//   • Valida estrutura mínima do envelope.
//   • Registra idempotência lógica (chave = instance + event + id).
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
import {
  EVOLUTION_WEBHOOK_CONTRACT_VERSION,
  EvolutionWebhookEnvelope,
} from "../_shared/evolution/types.ts";

const FN = "evolution-webhook" as const;
const FLAG = "evolution_api_enabled";

// Idempotência em memória do isolate. Fase 3 não persiste em tabela para não
// introduzir dependência de schema adicional. TTL 5 minutos.
const IDEMP_TTL_MS = 5 * 60_000;
const idempotency = new Map<string, number>();

function seenRecently(key: string): boolean {
  const now = Date.now();
  // GC oportunístico
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

function json(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "content-type": "application/json" },
  });
}

// Comparação em tempo constante para o token compartilhado.
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function extractInboundToken(req: Request): string | null {
  // Prioridade: header customizado > apikey (contrato Evolution) > querystring.
  const h1 = req.headers.get("x-evolution-token");
  if (h1) return h1;
  const h2 = req.headers.get("apikey");
  if (h2) return h2;
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

  // ---- 1. Auth (token compartilhado) ----
  // O token é o mesmo `EVOLUTION_GLOBAL_API_KEY` que a instância remota
  // envia no header `apikey` ao chamar seu próprio webhook. Nesta fase,
  // exigimos que ele esteja configurado e seja apresentado.
  const expected = Deno.env.get("EVOLUTION_GLOBAL_API_KEY");
  if (!expected) {
    logEvolution("error", {
      fn: FN,
      requestId,
      code: "MISSING_SECRET",
      message: "EVOLUTION_GLOBAL_API_KEY not set",
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

  // ---- 3. Idempotência ----
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
  // Sem tocar em contatos/threads/mensagens. Log informativo e 202.
  const service = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
  // Nesta fase avaliamos apenas o gate global. Mapeamento
  // instance→organization_id será feito na Fase 4/5.
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
  // O consumo real de webhook (persistir mensagens, atualizar
  // connection_state em `evolution_instances`, etc.) fica para a Fase 4.
  // Aqui apenas registramos que o evento foi visto e (se aplicável) que
  // seu formato é conhecido.
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
