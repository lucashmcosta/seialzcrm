// Integration Worker: consome integration_jobs, dispara handlers, persiste resultado.
// Invocado a cada 30s pelo cron `integration-worker` (ver migration phase 2).

import { createClient } from "jsr:@supabase/supabase-js@2";
import {
  Classification,
  type HandlerContext,
  type HandlerResult,
  type IntegrationEvent,
  type IntegrationJob,
  type IntegrationSubscription,
} from "../_shared/integration-handlers/types.ts";
import { resolve as resolveHandler } from "../_shared/integration-handlers/registry.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const WORKER_TOKEN = Deno.env.get("INTEGRATION_WORKER_TOKEN")!;

const BATCH_SIZE = 10;
const MAX_BATCHES = 5;
const MAX_RUNTIME_MS = 25_000;

Deno.serve(async (req) => {
  // --- Auth: shared token via header (server-to-server, sem CORS) ---
  const token = req.headers.get("x-worker-token");
  if (!WORKER_TOKEN || token !== WORKER_TOKEN) {
    return new Response(JSON.stringify({ error: "unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  const startedAt = performance.now();
  let totalProcessed = 0;
  const summary = { success: 0, conflict: 0, retryable: 0, permanent: 0, no_handler: 0, error: 0 };

  for (let batchN = 0; batchN < MAX_BATCHES; batchN++) {
    if (performance.now() - startedAt > MAX_RUNTIME_MS) break;

    const { data: jobs, error: claimErr } = await supabase.rpc("rpc_claim_integration_jobs", {
      p_limit: BATCH_SIZE,
    });
    if (claimErr) {
      console.error("[integration-worker] claim error", claimErr);
      return new Response(JSON.stringify({ error: "claim_failed", details: claimErr.message }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }

    const claimed: IntegrationJob[] = jobs ?? [];
    if (claimed.length === 0) break;

    await Promise.all(claimed.map((job) => processJob(supabase, job, summary)));
    totalProcessed += claimed.length;
    if (claimed.length < BATCH_SIZE) break;
  }

  return new Response(
    JSON.stringify({
      ok: true,
      processed: totalProcessed,
      durationMs: Math.round(performance.now() - startedAt),
      summary,
    }),
    { headers: { "Content-Type": "application/json" } },
  );
});

// deno-lint-ignore no-explicit-any
async function processJob(supabase: any, job: IntegrationJob, summary: Record<string, number>) {
  const startMs = performance.now();
  let result: HandlerResult;

  try {
    // Carrega subscription + event em paralelo
    const [subRes, evtRes] = await Promise.all([
      supabase.from("integration_subscriptions").select("*").eq("id", job.subscription_id).maybeSingle(),
      supabase.from("integration_events").select("*").eq("id", job.event_id).maybeSingle(),
    ]);

    if (subRes.error || !subRes.data) {
      result = {
        classification: Classification.Permanent,
        error: `subscription not found: ${subRes.error?.message ?? job.subscription_id}`,
      };
    } else if (evtRes.error || !evtRes.data) {
      result = {
        classification: Classification.Permanent,
        error: `event not found: ${evtRes.error?.message ?? job.event_id}`,
      };
    } else {
      const subscription = subRes.data as IntegrationSubscription;
      const event = evtRes.data as IntegrationEvent;
      const handler = resolveHandler(subscription.integration_slug, subscription.target_action);

      if (!handler) {
        summary.no_handler++;
        result = {
          classification: Classification.Permanent,
          error: `no handler for ${subscription.integration_slug}:${subscription.target_action}`,
        };
      } else {
        const ctx: HandlerContext = { supabase, job, subscription, event };
        try {
          result = await handler(ctx);
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          result = { classification: Classification.Retryable, error: `handler threw: ${msg}` };
        }
      }
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    result = { classification: Classification.Retryable, error: `job processing threw: ${msg}` };
  }

  const totalDurationMs = Math.round(performance.now() - startMs);
  await persistResult(supabase, job, result, totalDurationMs, summary);
}

// deno-lint-ignore no-explicit-any
async function persistResult(
  supabase: any,
  job: IntegrationJob,
  result: HandlerResult,
  totalDurationMs: number,
  summary: Record<string, number>,
) {
  const nowIso = new Date().toISOString();

  switch (result.classification) {
    case Classification.Success:
    case Classification.Conflict: {
      summary[result.classification === Classification.Success ? "success" : "conflict"]++;

      const { error: updErr } = await supabase
        .from("integration_jobs")
        .update({
          status: "success",
          completed_at: nowIso,
          external_response: result.externalPayload ?? null,
          last_error: null,
        })
        .eq("id", job.id);
      if (updErr) console.error("[integration-worker] update success failed", job.id, updErr);

      if (result.externalId && result.entityType && result.internalId) {
        const { error: mapErr } = await supabase
          .from("external_mappings")
          .upsert(
            {
              organization_id: job.organization_id,
              integration_slug: job.integration_slug,
              entity_type: result.entityType,
              internal_id: result.internalId,
              external_id: result.externalId,
              external_metadata: result.externalPayload ?? {},
              sync_status: "synced",
              last_synced_at: nowIso,
              sync_error: null,
            },
            { onConflict: "integration_slug,entity_type,internal_id" },
          );
        if (mapErr) console.error("[integration-worker] external_mappings upsert failed", job.id, mapErr);
      }
      break;
    }

    case Classification.Retryable: {
      summary.retryable++;
      const { error } = await supabase.rpc("fn_schedule_retry", {
        job_id: job.id,
        error_msg: result.error ?? "unknown error",
      });
      if (error) console.error("[integration-worker] fn_schedule_retry failed", job.id, error);
      break;
    }

    case Classification.Permanent: {
      summary.permanent++;
      const { error } = await supabase
        .from("integration_jobs")
        .update({
          status: "dead_letter",
          completed_at: nowIso,
          last_error: result.error ?? "permanent failure",
          last_error_at: nowIso,
        })
        .eq("id", job.id);
      if (error) console.error("[integration-worker] dead_letter update failed", job.id, error);
      break;
    }
  }

  // Audit log (best-effort; não falha o job se isto der erro)
  const { error: auditErr } = await supabase.from("integration_audit_logs").insert({
    organization_id: job.organization_id,
    job_id: job.id,
    subscription_id: job.subscription_id,
    event_id: job.event_id,
    integration_slug: job.integration_slug,
    target_action: job.target_action,
    classification: result.classification,
    http_status: result.httpStatus ?? null,
    duration_ms: result.durationMs ?? totalDurationMs,
    attempt_number: job.attempts,
    error: result.error ?? null,
    external_response: result.externalPayload ?? null,
  });
  if (auditErr) console.warn("[integration-worker] audit log insert failed", job.id, auditErr.message);
}
