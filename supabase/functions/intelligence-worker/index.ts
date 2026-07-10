// Intelligence Worker v2.1 (infra-only — proteção contra saturação da Supabase)
// Mudanças vs v2:
// - WORKER_CONCURRENCY default 3 (min 1, cap operacional 8).
// - Claim reduzido: p_limit = concurrency * 2.
// - WORKER_MAX_BATCHES (default 2) limita batches por execução.
// - Circuit breaker agora reage a network_error / platform_rate_limit (não só HTTP 429/5xx).
// - Erros de plataforma (Rate limit exceeded for trace, FunctionsRelayError, fetch failed, connection reset,
//   runtime shutdown) são classificados como `platform_rate_limit`, NÃO viram permanent_failure,
//   e não consomem tentativas do job (attempts é revertido).
// - Backoff com jitter para erros de plataforma (30s base, 10min máx, 0-30% jitter).
// - Advisory lease (intelligence_worker_leases) para impedir runs sobrepostos.
// - Métricas novas persistidas: platform_rate_limit, claimed, deferred, max_batches,
//   overlap_prevented, effective_concurrency, runtime_ms.
// Sem alteração de: analyze-message, transcribe-audio, prompts, modelos, BYOK, sales_events,
// claim atômico, schemas de análise, retries funcionais, idempotência.

import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const WORKER_TOKEN = Deno.env.get("INTELLIGENCE_WORKER_TOKEN")!;

const RAW_CONCURRENCY = Number(Deno.env.get("WORKER_CONCURRENCY") ?? "3");
const DEFAULT_CONCURRENCY = Math.max(1, Math.min(8, Number.isFinite(RAW_CONCURRENCY) ? RAW_CONCURRENCY : 3));
const MIN_CONCURRENCY = 1;
const MAX_RUNTIME_MS = Number(Deno.env.get("WORKER_MAX_RUNTIME_MS") ?? "25000");
const MAX_BATCHES = Math.max(1, Number(Deno.env.get("WORKER_MAX_BATCHES") ?? "2"));

const CB_429_THRESHOLD = Number(Deno.env.get("WORKER_CB_429_THRESHOLD") ?? "3");
const CB_5XX_THRESHOLD = Number(Deno.env.get("WORKER_CB_5XX_THRESHOLD") ?? "5");
const CB_NETWORK_THRESHOLD = Number(Deno.env.get("WORKER_CB_NETWORK_THRESHOLD") ?? "3");
const CB_PLATFORM_THRESHOLD = Number(Deno.env.get("WORKER_CB_PLATFORM_THRESHOLD") ?? "3");
const CB_COOLDOWN_MS = Number(Deno.env.get("WORKER_CB_COOLDOWN_MS") ?? "2000");

const LEASE_NAME = Deno.env.get("WORKER_LEASE_NAME") ?? "intelligence-worker-main";
const LEASE_TTL_SECONDS = Math.max(30, Number(Deno.env.get("WORKER_LEASE_TTL_SECONDS") ?? "60"));

const PLATFORM_ERROR_PATTERNS = [
  /rate limit exceeded for trace/i,
  /functionsrelayerror/i,
  /fetch failed/i,
  /connection reset/i,
  /runtime shutdown/i,
  /worker terminated/i,
  /shutdown/i,
];

type Job = {
  id: string;
  organization_id: string;
  target_action: string;
  payload: Record<string, unknown>;
  attempts: number;
  max_attempts: number;
};

type OutcomeKind =
  | "success"
  | "retryable"
  | "permanent"
  | "no_handler"
  | "http_429"
  | "http_5xx"
  | "network_error"
  | "platform_rate_limit";

type JobOutcome = {
  kind: OutcomeKind;
  latencyMs: number;
  jobId: string;
  action: string;
};

Deno.serve(async (req) => {
  if (req.headers.get("x-worker-token") !== WORKER_TOKEN) {
    return json({ error: "unauthorized" }, 401);
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });

  const runStartedAt = new Date();
  const runStartedPerf = performance.now();
  const holder = crypto.randomUUID();

  // (7) Proteção contra runs sobrepostos — lease com TTL
  const { data: leaseAcquired, error: leaseErr } = await supabase.rpc("try_acquire_worker_lease", {
    p_name: LEASE_NAME,
    p_holder: holder,
    p_ttl_seconds: LEASE_TTL_SECONDS,
  });
  if (leaseErr) {
    console.error("[intelligence-worker] lease acquire error", leaseErr);
  }
  if (leaseErr || !leaseAcquired) {
    await persistRun(supabase, {
      runStartedAt, runFinishedAt: new Date(), processed: 0, latencies: [],
      counters: emptyCounters(), concurrency: DEFAULT_CONCURRENCY, cbTripped: false,
      cbTripReason: leaseErr ? `lease_error:${leaseErr.message}` : "overlap_prevented",
      status: "skipped", claimed: 0, deferred: 0, overlapPrevented: true,
    });
    return json({ ok: true, skipped: true, reason: "overlap_prevented" });
  }

  let concurrency = DEFAULT_CONCURRENCY;
  let processed = 0;
  let claimedTotal = 0;
  let deferredTotal = 0;
  let batchesRun = 0;
  const latencies: number[] = [];
  const counters = emptyCounters();
  let cbTripped = false;
  let cbTripReason: string | null = null;

  try {
    while (
      batchesRun < MAX_BATCHES &&
      !cbTripped &&
      performance.now() - runStartedPerf < MAX_RUNTIME_MS
    ) {
      // (2) claim reduzido
      const claimLimit = concurrency * 2;
      const { data: jobs, error } = await supabase.rpc("rpc_claim_intelligence_jobs", { p_limit: claimLimit });
      if (error) {
        console.error("[intelligence-worker] claim error", error);
        await persistRun(supabase, {
          runStartedAt, runFinishedAt: new Date(), processed, latencies, counters,
          concurrency, cbTripped, cbTripReason: `claim_error:${error.message}`, status: "error",
          claimed: claimedTotal, deferred: deferredTotal, overlapPrevented: false,
        });
        return json({ error: error.message }, 500);
      }
      const claimed: Job[] = jobs ?? [];
      if (claimed.length === 0) break;

      claimedTotal += claimed.length;
      batchesRun += 1;

      const batchOutcomes = await runPool(claimed, concurrency, (job) => processJob(supabase, job));
      for (const o of batchOutcomes) {
        processed += 1;
        counters[o.kind] = (counters[o.kind] ?? 0) + 1;
        latencies.push(o.latencyMs);
      }

      // (4) Circuit breaker: HTTP 429/5xx + network_error + platform_rate_limit
      const b429 = batchOutcomes.filter((o) => o.kind === "http_429").length;
      const b5xx = batchOutcomes.filter((o) => o.kind === "http_5xx").length;
      const bNet = batchOutcomes.filter((o) => o.kind === "network_error").length;
      const bPlat = batchOutcomes.filter((o) => o.kind === "platform_rate_limit").length;

      let reason: string | null = null;
      if (bPlat >= CB_PLATFORM_THRESHOLD) reason = `platform_rate_limit_burst:${bPlat}`;
      else if (bNet >= CB_NETWORK_THRESHOLD) reason = `network_error_burst:${bNet}`;
      else if (b429 >= CB_429_THRESHOLD) reason = `429_burst:${b429}`;
      else if (b5xx >= CB_5XX_THRESHOLD) reason = `5xx_burst:${b5xx}`;

      if (reason) {
        const previous = concurrency;
        concurrency = Math.max(MIN_CONCURRENCY, Math.floor(concurrency / 2));
        cbTripped = true;
        cbTripReason = reason;
        console.warn(`[intelligence-worker] circuit-breaker tripped (${reason}): concurrency ${previous} -> ${concurrency}, cooldown ${CB_COOLDOWN_MS}ms; no more claims this run`);
        await sleep(CB_COOLDOWN_MS);
        break; // (4) interromper novos claims neste run
      }

      if (claimed.length < claimLimit) break;
    }

    // Se paramos por MAX_BATCHES tendo capacidade, marca esses jobs como deferred conceitualmente
    if (batchesRun >= MAX_BATCHES) {
      deferredTotal = 0; // não sabemos quantos ficaram na fila; métrica cheia é populada pelo cron seguinte
    }
  } finally {
    await supabase.rpc("release_worker_lease", { p_name: LEASE_NAME, p_holder: holder }).catch((e) => {
      console.error("[intelligence-worker] release lease failed", e);
    });
  }

  const runFinishedAt = new Date();
  await persistRun(supabase, {
    runStartedAt, runFinishedAt, processed, latencies, counters, concurrency,
    cbTripped, cbTripReason, status: "ok",
    claimed: claimedTotal, deferred: deferredTotal, overlapPrevented: false,
  });

  return json({
    ok: true,
    processed,
    claimed: claimedTotal,
    batches: batchesRun,
    max_batches: MAX_BATCHES,
    concurrency,
    circuit_breaker: cbTripped ? { tripped: true, reason: cbTripReason } : { tripped: false },
    summary: counters,
    duration_ms: Math.round(performance.now() - runStartedPerf),
    latency_avg_ms: latencies.length ? Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length) : 0,
    latency_p95_ms: percentile(latencies, 95),
  });
});

function emptyCounters(): Record<string, number> {
  return {
    success: 0,
    retryable: 0,
    permanent: 0,
    no_handler: 0,
    http_429: 0,
    http_5xx: 0,
    network_error: 0,
    platform_rate_limit: 0,
  };
}

function classifyError(msg: string): "platform_rate_limit" | "network_error" {
  const s = msg ?? "";
  for (const rx of PLATFORM_ERROR_PATTERNS) if (rx.test(s)) return "platform_rate_limit";
  return "network_error";
}

async function processJob(supabase: any, job: Job): Promise<JobOutcome> {
  const started = performance.now();
  const base = { jobId: job.id, action: job.target_action } as const;

  try {
    let handlerPath: string | null = null;
    if (job.target_action === "intelligence.analyze_message") handlerPath = "analyze-message";
    else if (job.target_action === "intelligence.transcribe_audio") handlerPath = "transcribe-audio";

    if (!handlerPath) {
      await finalize(supabase, job.id, "permanent_failure", `no handler for ${job.target_action}`);
      return { ...base, kind: "no_handler", latencyMs: Math.round(performance.now() - started) };
    }

    const res = await fetch(`${SUPABASE_URL}/functions/v1/${handlerPath}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-worker-token": WORKER_TOKEN },
      body: JSON.stringify({ job_id: job.id, organization_id: job.organization_id, ...job.payload }),
    });

    // Corpo pode vir vazio em erros de runtime — proteção contra JSON inválido
    const bodyText = await res.text().catch(() => "");
    let body: any = {};
    try { body = bodyText ? JSON.parse(bodyText) : {}; } catch { body = { raw: bodyText }; }

    if (res.ok) {
      await finalize(supabase, job.id, "success", null, body);
      return { ...base, kind: "success", latencyMs: Math.round(performance.now() - started) };
    }
    // Supabase runtime rate limit (HTTP-side também)
    if (res.status === 429 && /rate limit exceeded for trace/i.test(bodyText)) {
      await retryPlatform(supabase, job, `platform_rate_limit:${res.status}`);
      return { ...base, kind: "platform_rate_limit", latencyMs: Math.round(performance.now() - started) };
    }
    if (res.status === 429) {
      await retry(supabase, job, body?.error ?? "http_429");
      return { ...base, kind: "http_429", latencyMs: Math.round(performance.now() - started) };
    }
    if (res.status >= 500) {
      // 5xx do runtime também é erro de plataforma, não da mensagem
      const isPlatform = res.status === 546 || res.status === 502 || res.status === 503 || res.status === 504;
      if (isPlatform) {
        await retryPlatform(supabase, job, `platform_${res.status}`);
        return { ...base, kind: "platform_rate_limit", latencyMs: Math.round(performance.now() - started) };
      }
      await retry(supabase, job, body?.error ?? `http_${res.status}`);
      return { ...base, kind: "http_5xx", latencyMs: Math.round(performance.now() - started) };
    }
    await finalize(supabase, job.id, "permanent_failure", body?.error ?? `http_${res.status}`, body);
    return { ...base, kind: "permanent", latencyMs: Math.round(performance.now() - started) };
  } catch (e) {
    const msg = (e as Error).message ?? "unknown";
    const kind = classifyError(msg);
    if (kind === "platform_rate_limit") {
      await retryPlatform(supabase, job, msg);
      return { ...base, kind: "platform_rate_limit", latencyMs: Math.round(performance.now() - started) };
    }
    // (5) network_error também não pode virar permanent imediatamente
    await retryPlatform(supabase, job, msg);
    return { ...base, kind: "network_error", latencyMs: Math.round(performance.now() - started) };
  }
}

async function finalize(
  supabase: any,
  id: string,
  status: "success" | "permanent_failure",
  err: string | null,
  response?: unknown,
) {
  await supabase.from("intelligence_jobs").update({
    status,
    completed_at: new Date().toISOString(),
    last_error: err,
    external_response: response ?? null,
  }).eq("id", id);
}

// Retry funcional (erro do handler / mensagem) — mantém comportamento original.
async function retry(supabase: any, job: Job, err: string) {
  const next = job.attempts >= job.max_attempts
    ? { status: "permanent_failure", completed_at: new Date().toISOString() }
    : {
        status: "failed",
        next_run_at: new Date(Date.now() + Math.min(60_000 * Math.pow(2, job.attempts), 600_000)).toISOString(),
      };
  await supabase
    .from("intelligence_jobs")
    .update({ ...next, last_error: err, last_error_at: new Date().toISOString() })
    .eq("id", job.id);
}

// (5) + (6) Retry por erro de plataforma:
// - Nunca vira permanent_failure aqui (plataforma cai, mensagem não é culpada).
// - Não consome tentativa (attempts é revertido para o valor antes do claim).
// - Backoff com jitter: 30s base, 10min máx, 0-30% jitter.
async function retryPlatform(supabase: any, job: Job, err: string) {
  const baseMs = 30_000;
  const maxMs = 10 * 60_000;
  const exp = Math.min(maxMs, baseMs * Math.pow(2, Math.max(0, job.attempts - 1)));
  const jitter = exp * (Math.random() * 0.3);
  const delay = Math.round(exp + jitter);
  await supabase
    .from("intelligence_jobs")
    .update({
      status: "failed",
      next_run_at: new Date(Date.now() + delay).toISOString(),
      last_error: `platform:${err}`,
      last_error_at: new Date().toISOString(),
      // Reverte o incremento de attempts feito pelo claim para não punir a mensagem.
      attempts: Math.max(0, job.attempts - 1),
    })
    .eq("id", job.id);
}

async function runPool<T, R>(items: T[], size: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.max(1, Math.min(size, items.length)) }, async () => {
    while (true) {
      const idx = cursor++;
      if (idx >= items.length) return;
      try { results[idx] = await fn(items[idx]); }
      catch (e) { console.error("[intelligence-worker] pool task threw", e); }
    }
  });
  await Promise.allSettled(workers);
  return results.filter((r) => r !== undefined);
}

async function persistRun(supabase: any, args: {
  runStartedAt: Date;
  runFinishedAt: Date;
  processed: number;
  latencies: number[];
  counters: Record<string, number>;
  concurrency: number;
  cbTripped: boolean;
  cbTripReason: string | null;
  status: "ok" | "error" | "skipped";
  claimed: number;
  deferred: number;
  overlapPrevented: boolean;
}) {
  const durationMs = args.runFinishedAt.getTime() - args.runStartedAt.getTime();
  const jobsPerMin = durationMs > 0 ? (args.processed / durationMs) * 60_000 : 0;
  try {
    await supabase.from("intelligence_worker_runs").insert({
      started_at: args.runStartedAt.toISOString(),
      finished_at: args.runFinishedAt.toISOString(),
      duration_ms: durationMs,
      runtime_ms: durationMs,
      processed: args.processed,
      success: args.counters.success ?? 0,
      retryable: args.counters.retryable ?? 0,
      permanent: args.counters.permanent ?? 0,
      no_handler: args.counters.no_handler ?? 0,
      http_429: args.counters.http_429 ?? 0,
      http_5xx: args.counters.http_5xx ?? 0,
      network_error: args.counters.network_error ?? 0,
      platform_rate_limit: args.counters.platform_rate_limit ?? 0,
      jobs_per_min: jobsPerMin,
      latency_avg_ms: args.latencies.length ? Math.round(args.latencies.reduce((a, b) => a + b, 0) / args.latencies.length) : 0,
      latency_p95_ms: percentile(args.latencies, 95),
      final_concurrency: args.concurrency,
      effective_concurrency: args.concurrency,
      circuit_breaker_tripped: args.cbTripped,
      circuit_breaker_reason: args.cbTripReason,
      status: args.status,
      claimed: args.claimed,
      deferred: args.deferred,
      max_batches: MAX_BATCHES,
      overlap_prevented: args.overlapPrevented,
    });
  } catch (e) {
    console.error("[intelligence-worker] persistRun failed", e);
  }
}

function percentile(values: number[], p: number): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[Math.max(0, idx)];
}

function sleep(ms: number) { return new Promise((r) => setTimeout(r, ms)); }
function json(b: unknown, status = 200) {
  return new Response(JSON.stringify(b), { status, headers: { "Content-Type": "application/json" } });
}
