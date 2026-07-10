// Intelligence Worker v2 (infra-only optimization)
// - Concorrência configurável (WORKER_CONCURRENCY, default 8) via pool controlado.
// - Claim atômico ajustado (p_limit = concurrency * 2).
// - Promise.allSettled com pool: um erro nunca aborta os demais.
// - Circuit breaker adaptativo em 429/5xx: reduz concorrência à metade e recupera gradualmente.
// - Métricas persistidas em intelligence_worker_runs para health/observabilidade.
// - Sem alteração de prompts, modelos, handlers, schemas, sales_events, classificação.

import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const WORKER_TOKEN = Deno.env.get("INTELLIGENCE_WORKER_TOKEN")!;

const DEFAULT_CONCURRENCY = Math.max(1, Math.min(32, Number(Deno.env.get("WORKER_CONCURRENCY") ?? "8")));
const MIN_CONCURRENCY = 1;
const MAX_RUNTIME_MS = Number(Deno.env.get("WORKER_MAX_RUNTIME_MS") ?? "25000");
const CB_429_THRESHOLD = Number(Deno.env.get("WORKER_CB_429_THRESHOLD") ?? "3");     // dentro de uma execução
const CB_5XX_THRESHOLD = Number(Deno.env.get("WORKER_CB_5XX_THRESHOLD") ?? "5");
const CB_COOLDOWN_MS = Number(Deno.env.get("WORKER_CB_COOLDOWN_MS") ?? "2000");

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
  | "network_error";

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

  let concurrency = DEFAULT_CONCURRENCY;
  let processed = 0;
  const latencies: number[] = [];
  const counters: Record<string, number> = {
    success: 0,
    retryable: 0,
    permanent: 0,
    no_handler: 0,
    http_429: 0,
    http_5xx: 0,
    network_error: 0,
  };

  // Circuit breaker (por execução — cooldown curto entre batches)
  let cbTripped = false;
  let cbTripReason: string | null = null;

  while (performance.now() - runStartedPerf < MAX_RUNTIME_MS) {
    const claimLimit = Math.max(concurrency, concurrency * 2);
    const { data: jobs, error } = await supabase.rpc("rpc_claim_intelligence_jobs", { p_limit: claimLimit });
    if (error) {
      console.error("[intelligence-worker] claim error", error);
      await persistRun(supabase, {
        runStartedAt, runFinishedAt: new Date(), processed, latencies, counters, concurrency,
        cbTripped, cbTripReason: `claim_error:${error.message}`, status: "error",
      });
      return json({ error: error.message }, 500);
    }
    const claimed: Job[] = jobs ?? [];
    if (claimed.length === 0) break;

    // Pool paralelo controlado
    const batchOutcomes = await runPool(claimed, concurrency, (job) => process(supabase, job));

    for (const o of batchOutcomes) {
      processed += 1;
      counters[o.kind] = (counters[o.kind] ?? 0) + 1;
      latencies.push(o.latencyMs);
    }

    // Circuit breaker: reage a burst de 429/5xx
    const batch429 = batchOutcomes.filter((o) => o.kind === "http_429").length;
    const batch5xx = batchOutcomes.filter((o) => o.kind === "http_5xx").length;

    if (batch429 >= CB_429_THRESHOLD || batch5xx >= CB_5XX_THRESHOLD) {
      const previous = concurrency;
      concurrency = Math.max(MIN_CONCURRENCY, Math.floor(concurrency / 2));
      cbTripped = true;
      cbTripReason = batch429 >= CB_429_THRESHOLD
        ? `429_burst:${batch429}`
        : `5xx_burst:${batch5xx}`;
      console.warn(`[intelligence-worker] circuit-breaker tripped (${cbTripReason}): concurrency ${previous} -> ${concurrency}, cooldown ${CB_COOLDOWN_MS}ms`);
      await sleep(CB_COOLDOWN_MS);
    } else if (cbTripped && batch429 === 0 && batch5xx === 0 && concurrency < DEFAULT_CONCURRENCY) {
      // Recuperação gradual (+1 por batch limpo até o default)
      concurrency = Math.min(DEFAULT_CONCURRENCY, concurrency + 1);
    }

    if (claimed.length < claimLimit) break;
  }

  const runFinishedAt = new Date();
  await persistRun(supabase, {
    runStartedAt, runFinishedAt, processed, latencies, counters, concurrency,
    cbTripped, cbTripReason, status: "ok",
  });

  return json({
    ok: true,
    processed,
    concurrency,
    circuit_breaker: cbTripped ? { tripped: true, reason: cbTripReason } : { tripped: false },
    summary: counters,
    duration_ms: Math.round(performance.now() - runStartedPerf),
    latency_avg_ms: latencies.length ? Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length) : 0,
    latency_p95_ms: percentile(latencies, 95),
  });
});

async function process(supabase: any, job: Job): Promise<JobOutcome> {
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
      headers: {
        "Content-Type": "application/json",
        "x-worker-token": WORKER_TOKEN,
      },
      body: JSON.stringify({ job_id: job.id, organization_id: job.organization_id, ...job.payload }),
    });
    const body = await res.json().catch(() => ({}));

    if (res.ok) {
      await finalize(supabase, job.id, "success", null, body);
      return { ...base, kind: "success", latencyMs: Math.round(performance.now() - started) };
    }
    if (res.status === 429) {
      await retry(supabase, job, body?.error ?? "http_429");
      return { ...base, kind: "http_429", latencyMs: Math.round(performance.now() - started) };
    }
    if (res.status >= 500) {
      await retry(supabase, job, body?.error ?? `http_${res.status}`);
      return { ...base, kind: "http_5xx", latencyMs: Math.round(performance.now() - started) };
    }
    await finalize(supabase, job.id, "permanent_failure", body?.error ?? `http_${res.status}`, body);
    return { ...base, kind: "permanent", latencyMs: Math.round(performance.now() - started) };
  } catch (e) {
    await retry(supabase, job, (e as Error).message);
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
    status: status === "success" ? "success" : "permanent_failure",
    completed_at: new Date().toISOString(),
    last_error: err,
    external_response: response ?? null,
  }).eq("id", id);
}

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

// Pool paralelo controlado — sem Promise.all infinito.
async function runPool<T, R>(items: T[], size: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.max(1, Math.min(size, items.length)) }, async () => {
    while (true) {
      const idx = cursor++;
      if (idx >= items.length) return;
      try {
        results[idx] = await fn(items[idx]);
      } catch (e) {
        // Nunca aborta o pool. O erro do handler individual é logado; a estrutura de outcome cobre o caminho normal.
        console.error("[intelligence-worker] pool task threw", e);
      }
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
  status: "ok" | "error";
}) {
  const durationMs = args.runFinishedAt.getTime() - args.runStartedAt.getTime();
  const jobsPerMin = durationMs > 0 ? (args.processed / durationMs) * 60_000 : 0;
  try {
    await supabase.from("intelligence_worker_runs").insert({
      started_at: args.runStartedAt.toISOString(),
      finished_at: args.runFinishedAt.toISOString(),
      duration_ms: durationMs,
      processed: args.processed,
      success: args.counters.success ?? 0,
      retryable: args.counters.retryable ?? 0,
      permanent: args.counters.permanent ?? 0,
      no_handler: args.counters.no_handler ?? 0,
      http_429: args.counters.http_429 ?? 0,
      http_5xx: args.counters.http_5xx ?? 0,
      network_error: args.counters.network_error ?? 0,
      jobs_per_min: jobsPerMin,
      latency_avg_ms: args.latencies.length ? Math.round(args.latencies.reduce((a, b) => a + b, 0) / args.latencies.length) : 0,
      latency_p95_ms: percentile(args.latencies, 95),
      final_concurrency: args.concurrency,
      circuit_breaker_tripped: args.cbTripped,
      circuit_breaker_reason: args.cbTripReason,
      status: args.status,
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

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function json(b: unknown, status = 200) {
  return new Response(JSON.stringify(b), { status, headers: { "Content-Type": "application/json" } });
}
