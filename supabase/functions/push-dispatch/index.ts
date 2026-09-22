// Push dispatch worker: consome push_delivery_jobs e envia para o Expo Push Service.
// Invocado a cada 30s pelo cron `push-dispatch` (header x-worker-token).
//
// Dois tipos de job (`kind`):
//  - 'message'   → notificação visível de mensagem nova para o responsável da conversa.
//  - 'read_sync' → push SILENCIOSO (data-only) avisando que conversas foram lidas,
//                  para o app apagar a notificação entregue. Enviado APENAS para tokens
//                  com `supports_read_sync = true` (a build publicada não sabe tratar
//                  push de dados nem limpar badge). Sem token com suporte → `skipped`,
//                  sem contar tentativa nem erro.
// Badge só é enviado para tokens com suporte, nos dois tipos.

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
  thread_id: string | null;
  message_id: string | null;
  business_context: string | null;
  title: string | null;
  body: string | null;
  target_url: string | null;
  attempts: number;
  kind: string | null;
  payload: { thread_ids?: string[] } | null;
  exclude_push_token: string | null;
}

interface TokenRow {
  id: string;
  expo_push_token: string;
  supports_read_sync: boolean | null;
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
  const summary = {
    sent: 0,
    no_token: 0,
    read_sync_sent: 0,
    read_sync_skipped: 0,
    retried: 0,
    dead_letter: 0,
    errors: 0,
  };
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
        if ((job.kind ?? "message") === "read_sync") {
          await processReadSyncJob(supabase, job, summary);
        } else {
          await processJob(supabase, job, summary);
        }
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
async function loadTokens(supabase: any, userId: string): Promise<TokenRow[]> {
  const { data, error } = await supabase
    .from("user_push_tokens")
    .select("id, expo_push_token, supports_read_sync")
    .eq("user_id", userId)
    .eq("is_active", true);
  if (error) throw new Error(`token lookup failed: ${error.message}`);
  return (data ?? []) as TokenRow[];
}

// deno-lint-ignore no-explicit-any
async function unreadBadge(supabase: any, userId: string): Promise<number | null> {
  const { data, error } = await supabase.rpc("fn_push_unread_thread_count", { p_user_id: userId });
  if (error) {
    console.error("[push-dispatch] badge count failed", error.message);
    return null;
  }
  return typeof data === "number" ? data : null;
}

// deno-lint-ignore no-explicit-any
async function processJob(supabase: any, job: PushJob, summary: Record<string, number>) {
  let list: TokenRow[];
  try {
    list = await loadTokens(supabase, job.recipient_user_id);
  } catch (err) {
    await failJob(supabase, job, err instanceof Error ? err.message : String(err), summary);
    return;
  }

  if (list.length === 0) {
    summary.no_token++;
    await supabase
      .from("push_delivery_jobs")
      .update({ status: "skipped", completed_at: new Date().toISOString(), last_error: "no_active_token" })
      .eq("id", job.id);
    return;
  }

  // Badge só para aparelhos que sabem limpá-lo.
  const anySupports = list.some((t) => t.supports_read_sync === true);
  const badge = anySupports ? await unreadBadge(supabase, job.recipient_user_id) : null;

  const messages = list.map((t) => ({
    to: t.expo_push_token,
    title: job.title,
    body: job.body,
    sound: "default",
    priority: "high",
    channelId: "messages",
    // iOS agrupa visualmente as notificações da mesma conversa por threadId.
    threadId: job.thread_id,
    ...(t.supports_read_sync === true && badge !== null ? { badge } : {}),

    data: {
      url: job.target_url,
      thread_id: job.thread_id,
      message_id: job.message_id,
      business_context: job.business_context,
    },
  }));

  await sendToExpo(supabase, job, list, messages, summary, "sent");
}

// Push silencioso de leitura: apenas tokens com suporte declarado, exceto o de origem.
// deno-lint-ignore no-explicit-any
async function processReadSyncJob(supabase: any, job: PushJob, summary: Record<string, number>) {
  let list: TokenRow[];
  try {
    list = await loadTokens(supabase, job.recipient_user_id);
  } catch (err) {
    await failJob(supabase, job, err instanceof Error ? err.message : String(err), summary);
    return;
  }

  const targets = list.filter(
    (t) =>
      t.supports_read_sync === true &&
      (!job.exclude_push_token || t.expo_push_token !== job.exclude_push_token),
  );

  if (targets.length === 0) {
    // Sem aparelho com suporte: encerra como skipped, sem tentativa nem erro,
    // para nada cair em dead_letter enquanto a nova versão do app não sai.
    summary.read_sync_skipped++;
    await supabase
      .from("push_delivery_jobs")
      .update({
        status: "skipped",
        completed_at: new Date().toISOString(),
        last_error: "no_read_sync_capable_token",
      })
      .eq("id", job.id);
    return;
  }

  const threadIds = job.payload?.thread_ids ?? (job.thread_id ? [job.thread_id] : []);
  const badge = await unreadBadge(supabase, job.recipient_user_id);

  const messages = targets.map((t) => ({
    to: t.expo_push_token,
    // Sem title/body/sound: data-only. iOS exige _contentAvailable para acordar o app.
    _contentAvailable: true,
    priority: "high",
    ...(badge !== null ? { badge } : {}),
    data: {
      type: "thread_read",
      thread_ids: threadIds,
      ...(badge !== null ? { badge } : {}),
    },
  }));

  await sendToExpo(supabase, job, targets, messages, summary, "read_sync_sent");
}

// deno-lint-ignore no-explicit-any
async function sendToExpo(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  job: PushJob,
  tokens: TokenRow[],
  // deno-lint-ignore no-explicit-any
  messages: any[],
  summary: Record<string, number>,
  sentCounter: "sent" | "read_sync_sent",
) {
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
    const token = tokens[i];
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

  if (anyOk || (errorsFound.length > 0 && errorsFound.every((e) => e === "DeviceNotRegistered"))) {
    summary[sentCounter]++;
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
