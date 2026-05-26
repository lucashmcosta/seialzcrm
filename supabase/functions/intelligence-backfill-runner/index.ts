// Intelligence Backfill Runner — admin-only, internal use.
// Enqueues analyze_message + transcribe_audio jobs for messages in a time window.
// Auth: x-worker-token header must match INTELLIGENCE_WORKER_TOKEN secret.

import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-worker-token",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const WORKER_TOKEN = Deno.env.get("INTELLIGENCE_WORKER_TOKEN") ?? "";

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, {
  auth: { persistSession: false },
});

const DEFAULT_SLICE_HOURS = 6;
const DEFAULT_LOOKBACK_DAYS = 30;
const DEFAULT_MAX_COST_USD = 5;
const BATCH_SIZE = 500;
const MAX_SLICES_PER_INVOCATION = 4; // ~24h per run call; resume to continue
const MAX_PENDING_JOBS = 3000; // hard cap on simultaneous pending jobs per org

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function getOrgCostInRun(orgId: string, runStartedAt: string): Promise<number> {
  const { data } = await supabase
    .from("ai_usage_logs")
    .select("estimated_cost_usd")
    .eq("organization_id", orgId)
    .gte("created_at", runStartedAt);
  if (!data) return 0;
  return data.reduce((sum: number, row: any) => sum + Number(row.estimated_cost_usd || 0), 0);
}

async function getRecentRateLimitRatio(orgId: string): Promise<number> {
  const since = new Date(Date.now() - 5 * 60 * 1000).toISOString();
  const { data } = await supabase
    .from("intelligence_jobs")
    .select("status,last_error")
    .eq("organization_id", orgId)
    .gte("created_at", since)
    .limit(500);
  if (!data || data.length < 20) return 0;
  const rateLimited = data.filter((j: any) =>
    j.status === "failed" && /rate.?limit|429/i.test(j.last_error || ""),
  ).length;
  return rateLimited / data.length;
}

// Pre-LLM filter mirroring analyze-prompt.ts preLlmFilter (kept in sync).
const URL_ONLY_RE = /^\s*(https?:\/\/\S+|www\.\S+)\s*$/i;
const ACK_RE = /^\s*(ok|okay|okk+|blz|beleza|valeu|vlw|obg|obgd|obrigad[oa]|tmj|show|certo|td bem|tudo bem|👍+|👌+|✅+|🙏+)\s*[.!?]*\s*$/i;

function shouldEnqueueText(content: string, direction: string): boolean {
  const raw = (content ?? "").trim();
  if (raw.length < 5) return false;
  if (URL_ONLY_RE.test(raw)) return false;
  if (direction === "outbound" && ACK_RE.test(raw)) return false;
  return true;
}

const ANALYSIS_VERSION = "v2.1.0";

async function getPendingJobsCount(orgId: string): Promise<number> {
  const { count } = await supabase
    .from("intelligence_jobs")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", orgId)
    .eq("status", "pending");
  return count ?? 0;
}

async function enqueueSlice(
  orgId: string,
  sliceFrom: string,
  sliceTo: string,
  mode: "all" | "text_only" | "audio_only" = "all",
): Promise<{ text: number; audio: number; skipped_prefilter: number; skipped_already_v2: number }> {
  const { data: msgs, error } = await supabase
    .from("messages")
    .select("id, content, media_type, direction, created_at")
    .eq("organization_id", orgId)
    .gte("created_at", sliceFrom)
    .lt("created_at", sliceTo)
    .is("deleted_at", null)
    .in("direction", ["inbound", "outbound"])
    .order("created_at", { ascending: true })
    .limit(BATCH_SIZE * 4);

  if (error) throw new Error(`select messages: ${error.message}`);
  if (!msgs || msgs.length === 0) {
    return { text: 0, audio: 0, skipped_prefilter: 0, skipped_already_v2: 0 };
  }

  // Skip messages that already have v2 analysis (no duplicate cost)
  const ids = (msgs as any[]).map((m) => m.id);
  const { data: existing } = await supabase
    .from("message_analyses")
    .select("message_id")
    .eq("analysis_version", ANALYSIS_VERSION)
    .in("message_id", ids);
  const alreadyV2 = new Set((existing ?? []).map((r: any) => r.message_id));

  const textJobs: any[] = [];
  const audioJobs: any[] = [];
  let stagger = 0;
  let skippedPrefilter = 0;
  let skippedAlreadyV2 = 0;

  for (const m of msgs as any[]) {
    const isAudio = (m.media_type || "").toLowerCase().startsWith("audio");

    if (isAudio && mode === "text_only") continue;
    if (!isAudio && mode === "audio_only") continue;

    if (alreadyV2.has(m.id)) { skippedAlreadyV2++; continue; }

    const nextRunAt = new Date(Date.now() + stagger * 2000).toISOString();

    if (isAudio) {
      audioJobs.push({
        organization_id: orgId,
        target_action: "intelligence.transcribe_audio",
        payload: { message_id: m.id, source: "backfill", version: ANALYSIS_VERSION },
        idempotency_key: `transcribe:v2:${m.id}`,
        status: "pending",
        attempts: 0,
        max_attempts: 5,
        next_run_at: nextRunAt,
      });
      stagger++;
    } else {
      if (!shouldEnqueueText(m.content ?? "", m.direction ?? "")) {
        skippedPrefilter++;
        continue;
      }
      textJobs.push({
        organization_id: orgId,
        target_action: "intelligence.analyze_message",
        payload: { message_id: m.id, source: "backfill", version: ANALYSIS_VERSION },
        idempotency_key: `analyze:v2:${m.id}`,
        status: "pending",
        attempts: 0,
        max_attempts: 5,
        next_run_at: nextRunAt,
      });
      stagger++;
    }
  }

  const allJobs = [...textJobs, ...audioJobs];
  if (allJobs.length === 0) {
    return { text: 0, audio: 0, skipped_prefilter: skippedPrefilter, skipped_already_v2: skippedAlreadyV2 };
  }

  const CHUNK = 500;
  for (let i = 0; i < allJobs.length; i += CHUNK) {
    const chunk = allJobs.slice(i, i + CHUNK);
    const { error: insErr } = await supabase
      .from("intelligence_jobs")
      .upsert(chunk, { onConflict: "idempotency_key", ignoreDuplicates: true });
    if (insErr) throw new Error(`insert jobs: ${insErr.message}`);
  }

  return { text: textJobs.length, audio: audioJobs.length, skipped_prefilter: skippedPrefilter, skipped_already_v2: skippedAlreadyV2 };
}

async function actionStart(body: any) {
  const orgId = body.organization_id as string | undefined;
  const fromTs = body.from
    ? new Date(body.from).toISOString()
    : new Date(Date.now() - DEFAULT_LOOKBACK_DAYS * 86400 * 1000).toISOString();
  const toTs = body.to ? new Date(body.to).toISOString() : new Date().toISOString();
  const sliceHours = Number(body.slice_hours) || DEFAULT_SLICE_HOURS;
  const maxCostUsd = Number(body.max_cost_usd) || DEFAULT_MAX_COST_USD;
  const dryRun = Boolean(body.dry_run);
  const mode: "all" | "text_only" | "audio_only" =
    body.mode === "text_only" || body.mode === "audio_only" ? body.mode : "all";

  if (!orgId) return json({ error: "organization_id required" }, 400);

  if (dryRun) {
    const { count } = await supabase
      .from("messages")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", orgId)
      .gte("created_at", fromTs)
      .lt("created_at", toTs)
      .is("deleted_at", null);
    return json({ dry_run: true, organization_id: orgId, candidate_messages: count, from: fromTs, to: toTs, mode });
  }

  const { data: run, error } = await supabase
    .from("intelligence_backfill_runs")
    .insert({
      organization_id: orgId,
      from_ts: fromTs,
      to_ts: toTs,
      slice_hours: sliceHours,
      max_cost_usd: maxCostUsd,
      cursor_ts: fromTs,
      status: "running",
      mode,
    })
    .select()
    .single();
  if (error) return json({ error: error.message }, 500);

  // Kick off processing right away
  const processed = await processRun(run.id);
  return json({ run_id: run.id, mode, ...processed });
}

async function processRun(runId: string) {
  const { data: run, error } = await supabase
    .from("intelligence_backfill_runs")
    .select("*")
    .eq("id", runId)
    .single();
  if (error || !run) throw new Error("run not found");
  if (run.status !== "running") return { status: run.status, message: "run not in running state" };

  let cursor = new Date(run.cursor_ts).getTime();
  const toMs = new Date(run.to_ts).getTime();
  const sliceMs = run.slice_hours * 3600 * 1000;
  let enqueuedText = run.enqueued_text || 0;
  let enqueuedAudio = run.enqueued_audio || 0;
  let slicesProcessed = 0;
  let finalStatus: string = "running";

  while (cursor < toMs && slicesProcessed < MAX_SLICES_PER_INVOCATION) {
    // Budget cap
    const cost = await getOrgCostInRun(run.organization_id, run.created_at);
    if (cost >= Number(run.max_cost_usd)) {
      finalStatus = "paused_budget";
      break;
    }

    // Rate limit guard
    const rlRatio = await getRecentRateLimitRatio(run.organization_id);
    if (rlRatio > 0.3) {
      finalStatus = "paused_rate_limit";
      break;
    }

    const sliceFrom = new Date(cursor).toISOString();
    const sliceTo = new Date(Math.min(cursor + sliceMs, toMs)).toISOString();

    try {
      const r = await enqueueSlice(run.organization_id, sliceFrom, sliceTo, (run.mode as any) || "all");
      enqueuedText += r.text;
      enqueuedAudio += r.audio;
    } catch (e) {
      await supabase
        .from("intelligence_backfill_runs")
        .update({
          status: "error",
          last_error: String((e as Error).message || e),
          cursor_ts: sliceFrom,
          enqueued_text: enqueuedText,
          enqueued_audio: enqueuedAudio,
        })
        .eq("id", runId);
      return { status: "error", error: String((e as Error).message || e) };
    }

    cursor = Math.min(cursor + sliceMs, toMs);
    slicesProcessed++;
    await new Promise((r) => setTimeout(r, 1000)); // throttle
  }

  if (finalStatus === "running" && cursor >= toMs) finalStatus = "done";

  await supabase
    .from("intelligence_backfill_runs")
    .update({
      status: finalStatus,
      cursor_ts: new Date(cursor).toISOString(),
      enqueued_text: enqueuedText,
      enqueued_audio: enqueuedAudio,
    })
    .eq("id", runId);

  return {
    status: finalStatus,
    cursor_ts: new Date(cursor).toISOString(),
    enqueued_text: enqueuedText,
    enqueued_audio: enqueuedAudio,
    slices_processed: slicesProcessed,
    remaining: cursor < toMs,
  };
}

async function actionResume(body: any) {
  const runId = body.run_id;
  if (!runId) return json({ error: "run_id required" }, 400);
  await supabase
    .from("intelligence_backfill_runs")
    .update({ status: "running", last_error: null })
    .eq("id", runId)
    .in("status", ["paused_manual", "paused_budget", "paused_rate_limit", "error"]);
  const result = await processRun(runId);
  return json({ run_id: runId, ...result });
}

async function actionPause(body: any) {
  const runId = body.run_id;
  if (!runId) return json({ error: "run_id required" }, 400);
  const { error } = await supabase
    .from("intelligence_backfill_runs")
    .update({ status: "paused_manual" })
    .eq("id", runId)
    .eq("status", "running");
  if (error) return json({ error: error.message }, 500);
  return json({ run_id: runId, status: "paused_manual" });
}

async function actionStatus(body: any) {
  const runId = body.run_id;
  if (!runId) return json({ error: "run_id required" }, 400);
  const { data, error } = await supabase
    .from("intelligence_backfill_runs")
    .select("*")
    .eq("id", runId)
    .single();
  if (error) return json({ error: error.message }, 404);
  const cost = await getOrgCostInRun(data.organization_id, data.created_at);
  const { count: pending } = await supabase
    .from("intelligence_jobs")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", data.organization_id)
    .eq("status", "pending");
  return json({ run: data, cost_usd_in_run: cost, pending_jobs: pending });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const token = req.headers.get("x-worker-token") ?? "";
  if (!WORKER_TOKEN || token !== WORKER_TOKEN) {
    return json({ error: "unauthorized" }, 401);
  }

  let body: any = {};
  try {
    body = await req.json();
  } catch {
    return json({ error: "invalid json" }, 400);
  }

  const action = body.action || "start";
  try {
    switch (action) {
      case "start":
        return await actionStart(body);
      case "resume":
        return await actionResume(body);
      case "pause":
        return await actionPause(body);
      case "status":
        return await actionStatus(body);
      default:
        return json({ error: `unknown action: ${action}` }, 400);
    }
  } catch (e) {
    return json({ error: String((e as Error).message || e) }, 500);
  }
});
