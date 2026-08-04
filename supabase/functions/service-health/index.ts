// service-health — read-only operational health snapshot for Kairos Tech.
//
// Auth: header `x-health-token` must match SERVICE_HEALTH_TOKEN.
// Strictly read-only: no writes, no new heartbeats, no schema changes.
// A service is only reported with a real status/metrics when it has its OWN
// telemetry source today. Everything else stays "unknown".

import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const HEALTH_TOKEN = Deno.env.get("SERVICE_HEALTH_TOKEN") ?? "";
const RELEASE = Deno.env.get("SENTRY_RELEASE") ?? "seialz-crm@unknown";
const ENVIRONMENT = Deno.env.get("ENVIRONMENT") ?? "production";
const COMMIT = Deno.env.get("COMMIT_SHA") ?? (RELEASE.includes("@") ? RELEASE.split("@").pop()! : null);

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "x-health-token, content-type, authorization, apikey",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Cache-Control": "no-store",
};

type Status = "healthy" | "warning" | "critical" | "unknown";

type Service = {
  slug: string;
  name: string;
  status: Status;
  lastHeartbeat: string | null;
  uptimeSeconds: number | null;
  version: string | null;
  lastDeadLetterAt?: string | null;
  metrics: Record<string, number>;
};

const WARN_MS = 5 * 60_000;
const CRIT_MS = 15 * 60_000;

function ageMs(ts: string | null | undefined): number | null {
  if (!ts) return null;
  const t = new Date(ts).getTime();
  return Number.isFinite(t) ? Date.now() - t : null;
}

/** Status derived from heartbeat freshness, then degraded by explicit signals. */
function statusFromHeartbeat(ts: string | null | undefined, degraded: Status | null = null): Status {
  const age = ageMs(ts ?? null);
  if (age === null) return "critical";
  let s: Status = age > CRIT_MS ? "critical" : age > WARN_MS ? "warning" : "healthy";
  if (degraded === "critical") s = "critical";
  else if (degraded === "warning" && s === "healthy") s = "warning";
  return s;
}

function unknownService(slug: string, name: string): Service {
  return { slug, name, status: "unknown", lastHeartbeat: null, uptimeSeconds: null, version: null, metrics: {} };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const token = req.headers.get("x-health-token") ?? "";
  if (!HEALTH_TOKEN || token !== HEALTH_TOKEN) {
    return new Response(JSON.stringify({ error: "unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    return new Response(JSON.stringify({ error: "misconfigured" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  const since24h = new Date(Date.now() - 24 * 60 * 60_000).toISOString();

  const [outboxRes, reaperRes, inboundRes, evoRes, dl24Res, failed24Res, lastDlRes] =
    await Promise.allSettled([
      supabase.rpc("fn_outbox_health_summary_internal"),
      supabase.from("outbox_system_heartbeats").select("component,last_run_at,last_detail").eq("component", "reaper").maybeSingle(),
      supabase.rpc("fn_inbound_health_summary", { _window: "01:00:00" }),
      supabase.from("evolution_instances").select("last_known_state,last_state_checked_at"),
      supabase
        .from("integration_jobs")
        .select("id", { count: "exact", head: true })
        .eq("status", "dead_letter")
        .gte("last_error_at", since24h),
      supabase
        .from("integration_jobs")
        .select("id", { count: "exact", head: true })
        .eq("status", "failed")
        .gte("last_error_at", since24h),
      supabase
        .from("integration_jobs")
        .select("last_error_at")
        .eq("status", "dead_letter")
        .not("last_error_at", "is", null)
        .order("last_error_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

  const countOf = (res: PromiseSettledResult<any>): number => {
    if (res.status !== "fulfilled" || res.value?.error) return 0;
    return Number(res.value?.count ?? 0);
  };

  const services: Service[] = [];

  // ---- Outbox worker (integration_audit_logs actor=integration-worker + job counters)
  const outbox: any =
    outboxRes.status === "fulfilled" && !outboxRes.value.error ? outboxRes.value.data : null;
  if (outbox) {
    const stuck = Number(outbox.running_stuck_5m ?? 0);
    const failedTotal = Number(outbox.failed ?? 0);
    const deadTotal = Number(outbox.dead_letter ?? 0);
    const deadLetter24h = countOf(dl24Res);
    const failed24h = countOf(failed24Res);
    const pending = Number(outbox.pending ?? 0);
    const lastDeadLetterAt: string | null =
      lastDlRes.status === "fulfilled" && !lastDlRes.value?.error
        ? (lastDlRes.value?.data?.last_error_at ?? null)
        : null;

    // Operational window only: the historical dead-letter backlog never drives status.
    const degraded: Status | null = stuck > 0 || deadLetter24h > 0
      ? "critical"
      : failed24h > 0 || pending > 100
      ? "warning"
      : null;

    services.push({
      slug: "outbox-worker",
      name: "Outbox Worker",
      status: statusFromHeartbeat(outbox.worker_last_run_at, degraded),
      lastHeartbeat: outbox.worker_last_run_at ?? null,
      uptimeSeconds: null,
      version: null,
      lastDeadLetterAt,
      metrics: {
        processed: Number(outbox.success_24h ?? 0),
        errors: Number(outbox.failed_24h ?? 0),
        pending,
        running: Number(outbox.running ?? 0),
        stuck5m: stuck,
        failed: failedTotal,
        failed24h,
        // BREAKING (documented): `deadLetter` is now the 24h window, not the
        // historical accumulator. Use `deadLetterTotal` for the backlog.
        deadLetter: deadLetter24h,
        deadLetter24h,
        deadLetterTotal: deadTotal,
      },
    });
  } else {
    services.push(unknownService("outbox-worker", "Outbox Worker"));
  }

  // ---- Inbox reaper (own heartbeat row)
  const reaper: any =
    reaperRes.status === "fulfilled" && !reaperRes.value.error ? reaperRes.value.data : null;
  if (reaper?.last_run_at) {
    const reaped = Number(reaper.last_detail?.reaped ?? 0);
    services.push({
      slug: "inbox-reaper",
      name: "Inbox Reaper",
      status: statusFromHeartbeat(reaper.last_run_at),
      lastHeartbeat: reaper.last_run_at,
      uptimeSeconds: null,
      version: null,
      metrics: { processed: reaped },
    });
  } else {
    services.push(unknownService("inbox-reaper", "Inbox Reaper"));
  }

  // ---- Inbox dispatcher (inbound events aggregated over the last hour)
  const inbound: any[] | null =
    inboundRes.status === "fulfilled" && !inboundRes.value.error
      ? ((inboundRes.value.data as any[]) ?? [])
      : null;
  if (inbound) {
    let processed = 0;
    let errors = 0;
    let latencyWeighted = 0;
    let latencyCount = 0;
    let deadLetter = 0;
    for (const row of inbound) {
      const count = Number(row.count ?? 0);
      const avg = Number(row.avg_latency_sec ?? 0);
      if (row.status === "processed") processed += count;
      if (row.status === "failed") errors += count;
      if (row.status === "dead_letter") { deadLetter += count; errors += count; }
      if (Number.isFinite(avg) && count > 0) {
        latencyWeighted += avg * count;
        latencyCount += count;
      }
    }
    const total = inbound.reduce((acc, r) => acc + Number(r.count ?? 0), 0);
    const metrics: Record<string, number> = { processed, errors, deadLetter };
    if (latencyCount > 0) metrics.latencyMs = Math.round((latencyWeighted / latencyCount) * 1000);
    // No heartbeat row exists for the dispatcher: freshness is inferred from
    // whether inbound events were seen in the window. Zero events in an hour is
    // not an error by itself, so it stays "unknown".
    let status: Status = "unknown";
    let lastHeartbeat: string | null = null;
    if (total > 0) {
      status = deadLetter > 0 ? "critical" : errors > 0 ? "warning" : "healthy";
      lastHeartbeat = new Date().toISOString();
    }
    services.push({
      slug: "inbox-dispatcher",
      name: "Inbox Dispatcher",
      status,
      lastHeartbeat,
      uptimeSeconds: null,
      version: null,
      metrics: total > 0 ? metrics : {},
    });
  } else {
    services.push(unknownService("inbox-dispatcher", "Inbox Dispatcher"));
  }

  // ---- Evolution API (estado das instâncias + frescor da verificação)
  //
  // Duas condições distintas, reportadas separadamente para o Kairos:
  //   * instância fora do ar  -> last_known_state != 'open'
  //   * estado desatualizado  -> last_state_checked_at antigo (checker parado)
  const evo: any[] | null =
    evoRes.status === "fulfilled" && !evoRes.value.error ? ((evoRes.value.data as any[]) ?? []) : null;
  if (evo && evo.length > 0) {
    const stateOf = (i: any) => String(i.last_known_state ?? "unknown").toLowerCase();
    const open = evo.filter((i) => stateOf(i) === "open").length;
    const connecting = evo.filter((i) => stateOf(i) === "connecting").length;
    const closed = evo.filter((i) => stateOf(i) === "close").length;
    const unknownState = evo.length - open - connecting - closed;
    const lastChecked = evo
      .map((i) => i.last_state_checked_at)
      .filter(Boolean)
      .sort()
      .pop() ?? null;

    // Frescor: o health check periódico roda a cada 5 min.
    const checkAge = ageMs(lastChecked);
    const stale = checkAge === null || checkAge > STATE_STALE_MS;

    let status: Status = open === evo.length ? "healthy" : open === 0 ? "critical" : "warning";
    const reasons: string[] = [];
    if (open < evo.length) {
      reasons.push(
        `${evo.length - open} de ${evo.length} instância(s) sem sessão ativa (close=${closed}, connecting=${connecting}, unknown=${unknownState})`,
      );
    }
    if (stale) {
      // Estado potencialmente defasado: o alerta não pode ser lido como
      // "instância caiu" sem antes considerar que ninguém verificou.
      if (status === "healthy") status = "warning";
      reasons.push(
        checkAge === null
          ? "estado nunca verificado"
          : `estado verificado há ${Math.round(checkAge / 60_000)} min (verificação periódica atrasada)`,
      );
    }

    services.push({
      slug: "evolution-api",
      name: "Evolution API",
      status,
      lastHeartbeat: lastChecked,
      uptimeSeconds: null,
      version: null,
      detail: reasons.length > 0 ? reasons.join("; ") : "todas as instâncias conectadas",
      metrics: {
        instancesOpen: open,
        instancesConnecting: connecting,
        instancesClose: closed,
        instancesUnknown: unknownState,
        instancesTotal: evo.length,
        stateStale: stale ? 1 : 0,
        stateAgeSeconds: checkAge === null ? -1 : Math.round(checkAge / 1000),
      },
    });
  } else {
    services.push(unknownService("evolution-api", "Evolution API"));
  }


  // ---- Services without their own telemetry today
  services.push(unknownService("integration-worker", "Integration Worker"));
  services.push(unknownService("public-subscriber-worker", "Public Subscriber Worker"));
  services.push(unknownService("redis", "Redis"));
  services.push(unknownService("railway-backend", "Railway Backend"));
  services.push(unknownService("scheduler", "Scheduler"));

  const body = {
    generated_at: new Date().toISOString(),
    application: {
      name: "Seialz CRM",
      version: RELEASE,
      environment: ENVIRONMENT,
      commit: COMMIT,
    },
    services,
    totalHealthy: services.filter((s) => s.status === "healthy").length,
    totalWarning: services.filter((s) => s.status === "warning").length,
    totalCritical: services.filter((s) => s.status === "critical").length,
  };

  return new Response(JSON.stringify(body, null, 2), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
