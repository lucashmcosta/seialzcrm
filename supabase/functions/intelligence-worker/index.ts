// Intelligence Worker: consome intelligence_jobs e dispara analyze/transcribe.
// Invocado a cada 30s por pg_cron. Auth via x-worker-token.
// Mesmo padrão do integration-worker, mas isolado (não compete por capacidade).

import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const WORKER_TOKEN = Deno.env.get("INTELLIGENCE_WORKER_TOKEN")!;

const BATCH_SIZE = 3;
const MAX_BATCHES = 3;
const MAX_RUNTIME_MS = 25_000;

type Job = {
  id: string;
  organization_id: string;
  target_action: string;
  payload: Record<string, unknown>;
  attempts: number;
  max_attempts: number;
};

Deno.serve(async (req) => {
  if (req.headers.get("x-worker-token") !== WORKER_TOKEN) {
    return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401 });
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });
  const started = performance.now();
  let processed = 0;
  const summary = { success: 0, retryable: 0, permanent: 0, no_handler: 0 };

  for (let i = 0; i < MAX_BATCHES; i++) {
    if (performance.now() - started > MAX_RUNTIME_MS) break;

    const { data: jobs, error } = await supabase.rpc("rpc_claim_intelligence_jobs", { p_limit: BATCH_SIZE });
    if (error) {
      console.error("[intelligence-worker] claim error", error);
      return new Response(JSON.stringify({ error: error.message }), { status: 500 });
    }
    const claimed: Job[] = jobs ?? [];
    if (claimed.length === 0) break;

    await Promise.all(claimed.map((job) => process(supabase, job, summary)));
    processed += claimed.length;
    if (claimed.length < BATCH_SIZE) break;
  }

  return new Response(JSON.stringify({ ok: true, processed, summary }), {
    headers: { "Content-Type": "application/json" },
  });
});

async function process(supabase: any, job: Job, summary: Record<string, number>) {
  try {
    let handlerPath: string | null = null;
    if (job.target_action === "intelligence.analyze_message") handlerPath = "analyze-message";
    else if (job.target_action === "intelligence.transcribe_audio") handlerPath = "transcribe-audio";

    if (!handlerPath) {
      await finalize(supabase, job.id, "permanent_failure", `no handler for ${job.target_action}`);
      summary.no_handler++;
      return;
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
      summary.success++;
    } else if (res.status >= 500 || res.status === 429) {
      await retry(supabase, job, body?.error ?? `http_${res.status}`);
      summary.retryable++;
    } else {
      await finalize(supabase, job.id, "permanent_failure", body?.error ?? `http_${res.status}`, body);
      summary.permanent++;
    }
  } catch (e) {
    await retry(supabase, job, (e as Error).message);
    summary.retryable++;
  }
}

async function finalize(supabase: any, id: string, status: "success" | "permanent_failure", err: string | null, response?: unknown) {
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
    : { status: "failed", next_run_at: new Date(Date.now() + Math.min(60_000 * Math.pow(2, job.attempts), 600_000)).toISOString() };
  await supabase.from("intelligence_jobs").update({ ...next, last_error: err, last_error_at: new Date().toISOString() }).eq("id", job.id);
}
