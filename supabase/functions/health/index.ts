// Public health endpoint for monitoring (Better Stack, UptimeRobot, etc.)
// No auth required. Does not return sensitive data.
//
// Structured JSON:
//   { status, app, release, environment, timestamp, checks: { ... } }
//
// HTTP 200 = all critical checks ok
// HTTP 503 = at least one critical check failed
//
// To add new checks (inbox, outbox, jobs, webhooks, integrations) in the
// future, register them in the CHECKS array below. Each check returns either
// "ok" / true / false / an error string, and declares whether it is critical.

import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const SENTRY_DSN = Deno.env.get("SENTRY_DSN") ?? "";
const RELEASE = Deno.env.get("SENTRY_RELEASE") ?? "seialz-crm@unknown";
const ENVIRONMENT = Deno.env.get("ENVIRONMENT") ?? "production";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type, authorization",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Cache-Control": "no-store",
};

type CheckResult = { value: unknown; ok: boolean; critical: boolean };

async function checkSupabase(): Promise<CheckResult> {
  try {
    if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
      return { value: "misconfigured", ok: false, critical: true };
    }
    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    });
    // Light ping: head-count query on a tiny, always-present table.
    const { error } = await supabase
      .from("users")
      .select("id", { count: "exact", head: true })
      .limit(1);
    if (error) return { value: `error: ${error.message}`, ok: false, critical: true };
    return { value: "ok", ok: true, critical: true };
  } catch (e) {
    return { value: `error: ${(e as Error).message}`, ok: false, critical: true };
  }
}

function checkSentry(): CheckResult {
  const enabled = Boolean(SENTRY_DSN);
  return { value: enabled, ok: true, critical: false };
}

function checkFrontend(): CheckResult {
  // The frontend itself reaches this endpoint to read status; from the
  // server's POV we always report "ok" — actual SPA load is verified by the
  // /health page check in the monitor.
  return { value: "ok", ok: true, critical: false };
}

// Registry — add future checks here (inbox, outbox, jobs, webhooks, integrations)
const CHECKS: Array<{ name: string; run: () => Promise<CheckResult> | CheckResult }> = [
  { name: "frontend", run: checkFrontend },
  { name: "sentry", run: checkSentry },
  { name: "supabase", run: checkSupabase },
  // { name: "inbox",        run: checkInbox },
  // { name: "outbox",       run: checkOutbox },
  // { name: "jobs",         run: checkJobs },
  // { name: "webhooks",     run: checkWebhooks },
  // { name: "integrations", run: checkIntegrations },
];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const checks: Record<string, unknown> = {};
  let anyCriticalFailed = false;

  await Promise.all(
    CHECKS.map(async ({ name, run }) => {
      const r = await run();
      checks[name] = r.value;
      if (!r.ok && r.critical) anyCriticalFailed = true;
    }),
  );

  const body = {
    status: anyCriticalFailed ? "degraded" : "ok",
    app: "seialz-crm",
    release: RELEASE,
    environment: ENVIRONMENT,
    timestamp: new Date().toISOString(),
    checks,
  };

  return new Response(JSON.stringify(body, null, 2), {
    status: anyCriticalFailed ? 503 : 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
