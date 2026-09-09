// Push dispatch worker: consome push_delivery_jobs e envia para o Expo Push Service.
// Invocado a cada 30s pelo cron `push-dispatch` (Authorization: Bearer service_role_key).
//
// Escopo: apenas notificação de mensagem nova para o responsável da conversa
// (message_threads.assigned_user_id). Não altera nada do fluxo de `notifications`.

import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const EXPO_ENDPOINT = "https://exp.host/--/api/v2/push/send";
const BATCH_SIZE = 25;
const MAX_BATCHES = 4;
const MAX_RUNTIME_MS = 25_000;
const MAX_ATTEMPTS = 5;

interface PushJob {
  id: string;
  organization_id: string;
  recipient_user_id: string;
  thread_id: string;
  message_id: string;
  business_context: string | null;
  title: string;
  body: string;
  target_url: string;
  attempts: number;
}

function backoffMs(attempts: number) {
  // 30s, 60s, 2min, 4min, 8min...
  return Math.min(30_000 * Math.pow(2, Math.max(0, attempts - 1)), 15 * 60_000);
}

Deno.serve(async (req) => {
  if (!SERVICE_ROLE_KEY) {
    return new Response(JSON.stringify({ error: "misconfigured" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  // Autenticação server-to-server: x-worker-token comparado ao segredo do cofre
  // (vault `push_dispatch_worker_token`), o mesmo que o cron envia.
  const workerToken = req.headers.get("x-worker-token") ?? "";
  const { data: expectedToken, error: tokenErr } = await supabase.rpc("fn_get_push_dispatch_token");
  if (tokenErr || !expectedToken || workerToken !== expectedToken) {
    if (tokenErr) console.error("[push-dispatch] token lookup failed", tokenErr.message);
    return new Response(JSON.stringify({ error: "unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }


  const startedAt = performance.now();
  const summary = { sent: 0, no_token: 0, retried: 0, dead_letter: 0, errors: 0 };
  let processed = 0;

  for (let batchN = 0; batchN < MAX_BATCHES; batchN++) {
    if (performance.now() - startedAt > MAX_RUNTIME_MS) break;

    const { data: claimed, error: claimErr } = await supabase.rpc("rpc_claim_push_delivery_jobs", {
      p_limit: BATCH_SIZE,
    });
    if (claimErr) {
      console.error("[push-dispatch] claim error", claimErr.message);
      return new Response(JSON.stringify({ error: "claim_failed", details: claimErr.message }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }

    const jobs: PushJob[] = claimed ?? [];
    if (jobs.length === 0) break;

    for (const job of jobs) {
      try {
        await processJob(supabase, job, summary);
      } catch (err) {
        summary.errors++;
        const msg = err instanceof Error ? err.message : String(err);
        console.error("[push-dispatch] job threw", job.id, msg);
        await failJob(supabase, job, `job threw: ${msg}`, summary);
      }
    }

    processed += jobs.length;
    if (jobs.length < BATCH_SIZE) break;
  }

  return new Response(
    JSON.stringify({
      ok: true,
      processed,
      durationMs: Math.round(performance.now() - startedAt),
      summary,
    }),
    { headers: { "Content-Type": "application/json" } },
  );
});

// deno-lint-ignore no-explicit-any
async function processJob(supabase: any, job: PushJob, summary: Record<string, number>) {
  const { data: tokens, error: tokErr } = await supabase
    .from("user_push_tokens")
    .select("id, expo_push_token")
    .eq("user_id", job.recipient_user_id)
    .eq("is_active", true);

  if (tokErr) {
    await failJob(supabase, job, `token lookup failed: ${tokErr.message}`, summary);
    return;
  }

  const list = (tokens ?? []) as { id: string; expo_push_token: string }[];
  if (list.length === 0) {
    summary.no_token++;
    await supabase
      .from("push_delivery_jobs")
      .update({ status: "skipped", completed_at: new Date().toISOString(), last_error: "no_active_token" })
      .eq("id", job.id);
    return;
  }

  const messages = list.map((t) => ({
    to: t.expo_push_token,
    title: job.title,
    body: job.body,
    sound: "default",
    priority: "high",
    channelId: "messages",
    // iOS agrupa visualmente as notificações da mesma conversa por threadId.
    // Sem collapseId: cada mensagem é uma notificação própria (não substitui a anterior).
    threadId: job.thread_id,

    data: {
      url: job.target_url,
      thread_id: job.thread_id,
      message_id: job.message_id,
      business_context: job.business_context,
    },
  }));

  let res: Response;
  try {
    res = await fetch(EXPO_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(messages),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await failJob(supabase, job, `expo fetch failed: ${msg}`, summary);
    return;
  }

  const raw = await res.text();
  if (!res.ok) {
    await failJob(supabase, job, `expo http ${res.status}: ${raw.slice(0, 400)}`, summary);
    return;
  }

  let parsed: { data?: { status: string; details?: { error?: string }; message?: string }[] } = {};
  try {
    parsed = JSON.parse(raw);
  } catch {
    await failJob(supabase, job, `expo invalid json: ${raw.slice(0, 200)}`, summary);
    return;
  }

  const tickets = parsed.data ?? [];
  const errorsFound: string[] = [];

  for (let i = 0; i < tickets.length; i++) {
    const ticket = tickets[i];
    const token = list[i];
    if (ticket?.status === "ok") continue;

    const detail = ticket?.details?.error ?? ticket?.message ?? "unknown_expo_error";
    errorsFound.push(detail);

    if (detail === "DeviceNotRegistered" && token) {
      await supabase
        .from("user_push_tokens")
        .update({ is_active: false, updated_at: new Date().toISOString() })
        .eq("id", token.id);
    }
  }

  const anyOk = tickets.some((t) => t?.status === "ok");
  const nowIso = new Date().toISOString();

  if (anyOk || errorsFound.every((e) => e === "DeviceNotRegistered")) {
    summary.sent++;
    await supabase
      .from("push_delivery_jobs")
      .update({
        status: "sent",
        completed_at: nowIso,
        last_error: errorsFound.length > 0 ? errorsFound.join("; ").slice(0, 500) : null,
        last_error_at: errorsFound.length > 0 ? nowIso : null,
      })
      .eq("id", job.id);
    return;
  }

  await failJob(supabase, job, `expo errors: ${errorsFound.join("; ").slice(0, 400)}`, summary);
}

// deno-lint-ignore no-explicit-any
async function failJob(supabase: any, job: PushJob, error: string, summary: Record<string, number>) {
  const nowIso = new Date().toISOString();
  const attempts = job.attempts ?? 1;

  if (attempts >= MAX_ATTEMPTS) {
    summary.dead_letter++;
    await supabase
      .from("push_delivery_jobs")
      .update({ status: "dead_letter", completed_at: nowIso, last_error: error, last_error_at: nowIso })
      .eq("id", job.id);
    return;
  }

  summary.retried++;
  await supabase
    .from("push_delivery_jobs")
    .update({
      status: "pending",
      last_error: error,
      last_error_at: nowIso,
      next_attempt_at: new Date(Date.now() + backoffMs(attempts)).toISOString(),
    })
    .eq("id", job.id);
}
