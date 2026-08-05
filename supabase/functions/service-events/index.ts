// service-events — read-only operational event history per service.
//
// Auth: header `x-health-token` must match SERVICE_HEALTH_TOKEN (same secret as
// service-health). Strictly read-only: no writes, no new telemetry, no schema
// changes. Only sources that already exist today are read, and only technical
// metadata is returned (no payloads, headers, tokens, message content or PII).

import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const HEALTH_TOKEN = Deno.env.get("SERVICE_HEALTH_TOKEN") ?? "";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "x-health-token, content-type, authorization, apikey",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Cache-Control": "no-store",
};

type Level = "info" | "warning" | "error" | "critical";

type Event = {
  id: string;
  occurredAt: string;
  level: Level;
  status: string | null;
  type: string;
  summary: string;
  durationMs: number | null;
  attempt: number | null;
  maxAttempts: number | null;
  referenceId: string | null;
  severitySource?: "job" | "audit" | "event";
  metadata: Record<string, unknown>;
};

const SERVICES: Record<string, string> = {
  "outbox-worker": "Outbox Worker",
  "inbox-dispatcher": "Inbox Dispatcher",
  "inbox-reaper": "Inbox Reaper",
  "evolution-api": "Evolution API",
  "integration-worker": "Integration Worker",
  "public-subscriber-worker": "Public Subscriber Worker",
  redis: "Redis",
  "railway-backend": "Railway Backend",
  scheduler: "Scheduler",
};

// Services with no telemetry source of their own today.
const NO_SOURCE = new Set([
  "integration-worker",
  "public-subscriber-worker",
  "redis",
  "railway-backend",
  "scheduler",
]);

const SOURCE_TIMEOUT_MS = 8_000;

// ---------------------------------------------------------------- sanitizing

const SECRET_PATTERNS = [
  /sk-[A-Za-z0-9_-]{16,}/g,
  /Bearer\s+[A-Za-z0-9._-]{20,}/gi,
  /eyJ[A-Za-z0-9._-]{20,}/g,
  /\+?\d[\d\s().-]{8,}\d/g, // phone-like sequences
  /[\w.+-]+@[\w-]+\.[\w.]+/g, // e-mails
];

function sanitizeError(input: unknown, max = 240): string | null {
  if (input == null) return null;
  let out = typeof input === "string" ? input : JSON.stringify(input);
  for (const re of SECRET_PATTERNS) out = out.replace(re, "[REDACTED]");
  out = out.replace(/\s+/g, " ").trim();
  return out.length > max ? `${out.slice(0, max)}…` : out;
}

function maskIdentifier(value: unknown): string | null {
  const s = value == null ? "" : String(value);
  if (!s) return null;
  if (s.length <= 4) return `***${s}`;
  return `***${s.slice(-4)}`;
}

function num(value: unknown): number | null {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function durationBetween(from: unknown, to: unknown): number | null {
  if (!from || !to) return null;
  const a = new Date(String(from)).getTime();
  const b = new Date(String(to)).getTime();
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  const d = b - a;
  return d >= 0 ? d : null;
}

/** Best-effort HTTP status extraction from an already-persisted response blob. */
function httpStatusFrom(value: unknown): number | null {
  if (!value || typeof value !== "object") return null;
  const v = value as Record<string, unknown>;
  return num(v.status ?? v.statusCode ?? v.http_status ?? (v.response as any)?.status);
}

/** Extracts an HTTP status code mentioned in a persisted error string. */
function httpStatusFromText(value: unknown): number | null {
  if (value == null) return null;
  const s = typeof value === "string" ? value : JSON.stringify(value);
  const m = s.match(/\b(?:status|http)[^0-9]{0,4}([1-5]\d{2})\b/i) ?? s.match(/\b([45]\d{2})\b/);
  return m ? num(m[1]) : null;
}

/** True when a persisted error looks like a network/timeout failure. */
function isTimeout(value: unknown): boolean {
  if (value == null) return false;
  const s = (typeof value === "string" ? value : JSON.stringify(value)).toLowerCase();
  return /timeout|timed out|etimedout|deadline exceeded|connection closed|econnreset/.test(s);
}


function withTimeout<T>(p: PromiseLike<T>): Promise<T> {
  return Promise.race([
    Promise.resolve(p),
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error("source_timeout")), SOURCE_TIMEOUT_MS)
    ),
  ]);
}

function rowsOf(result: PromiseSettledResult<any>): any[] {
  if (result.status !== "fulfilled") return [];
  const r = result.value;
  if (!r || r.error) return [];
  return (r.data as any[]) ?? [];
}

// ------------------------------------------------------------------ builders

type Ctx = {
  supabase: ReturnType<typeof createClient>;
  limit: number;
  cursor: string | null;
  status: string | null;
  from: string | null;
  to: string | null;
  /** null = no severity filter (default recent feed). */
  levels: Set<Level> | null;
};

/** True when the caller asked for severities beyond plain `info`. */
function wantsLevel(ctx: Ctx, level: Level): boolean {
  return ctx.levels === null || ctx.levels.has(level);
}

function severityFiltered(ctx: Ctx): boolean {
  return ctx.levels !== null;
}

/** Applies cursor/from/to window on a timestamp column. */
function applyWindow(q: any, col: string, ctx: Ctx) {
  if (ctx.cursor) q = q.lt(col, ctx.cursor);
  if (ctx.from) q = q.gte(col, ctx.from);
  if (ctx.to) q = q.lte(col, ctx.to);
  return q;
}

function jobLevel(status: string, stuck: boolean): Level {
  if (status === "dead_letter" || stuck) return "critical";
  if (status === "failed") return "error";
  if (status === "retry_scheduled" || status === "retrying") return "warning";
  return "info";
}

const JOB_FAILURE_STATUSES = ["failed", "dead_letter"];
const AUDIT_FAILURE_ACTIONS = [
  "worker.retryable",
  "worker.permanent",
  "retry_scheduled",
  "worker.failed",
  "worker.error",
  "worker.dead_letter",
];

function jobEvent(row: any, occurredAt: string, now: number): Event {
  const status = String(row.status ?? "unknown");
  const attempt = num(row.attempts);
  const maxAttempts = num(row.max_attempts);
  const httpStatus = httpStatusFrom(row.external_response) ??
    httpStatusFromText(row.last_error);
  const startedAge = row.started_at ? now - new Date(String(row.started_at)).getTime() : 0;
  const stuck = status === "running" && startedAge > 5 * 60_000;
  const error = sanitizeError(row.last_error);
  const timedOut = isTimeout(row.last_error);

  let summary: string;
  if (status === "completed" || status === "success") {
    summary = httpStatus
      ? `Webhook dispatch concluído com HTTP ${httpStatus}`
      : "Job processado com sucesso";
  } else if (status === "dead_letter") {
    summary = `Job movido para dead letter${httpStatus ? ` após HTTP ${httpStatus}` : ""}${
      timedOut ? " (timeout)" : ""
    }`;
  } else if (status === "failed") {
    summary = `Job falhou${httpStatus ? ` com HTTP ${httpStatus}` : ""}${
      timedOut ? " (timeout)" : ""
    }${error ? ` — ${error}` : ""}`;
  } else if (status === "running") {
    summary = stuck ? "Job preso em execução há mais de 5 minutos" : "Job em execução";
  } else if (attempt && maxAttempts) {
    summary = `Job enviado para retry — tentativa ${attempt} de ${maxAttempts}`;
  } else {
    summary = `Job com status ${status}`;
  }

  let level = jobLevel(status, stuck);
  if (level === "info" && (timedOut || (httpStatus !== null && httpStatus >= 500))) {
    level = "error";
  }

  return {
    id: `job:${row.id}`,
    occurredAt,
    level,
    status,
    type: "outbox.job",
    summary,
    durationMs: durationBetween(row.started_at, row.completed_at),
    attempt,
    maxAttempts,
    referenceId: row.id,
    severitySource: "job",
    metadata: {
      integrationSlug: row.integration_slug ?? null,
      targetAction: row.target_action ?? null,
      httpStatus,
      timeout: timedOut,
      error,
      integrationJobId: row.id,
      integrationEventId: row.event_id ?? null,
      subscriptionId: row.subscription_id ?? null,
      organizationId: row.organization_id ?? null,
    },
  };
}

const JOB_COLS =
  "id,organization_id,integration_slug,target_action,status,attempts,max_attempts,last_error,last_error_at,started_at,completed_at,created_at,event_id,subscription_id,external_response";

async function outboxWorkerEvents(ctx: Ctx): Promise<Event[]> {
  const cap = ctx.limit;
  const statusFilter = ctx.status;

  // Each read is ordered/paginated by ONE stable column, and `occurredAt` is
  // exactly that column — no coalesce in the ordering.
  const queries: Array<{ q: any; col: string } | null> = [];

  // 1) Finished jobs (stable column: completed_at)
  const wantFinished = statusFilter
    ? ["success", "completed"].includes(statusFilter)
    : wantsLevel(ctx, "info");
  if (wantFinished) {
    let q = ctx.supabase.from("integration_jobs").select(JOB_COLS)
      .not("completed_at", "is", null);
    q = statusFilter ? q.eq("status", statusFilter) : q.in("status", ["success", "completed"]);
    q = applyWindow(q, "completed_at", ctx);
    queries.push({ q: q.order("completed_at", { ascending: false }).limit(cap), col: "completed_at" });
  }

  // 2) Failed / dead-letter jobs (stable column: last_error_at)
  const failureStatuses = statusFilter
    ? (JOB_FAILURE_STATUSES.includes(statusFilter) ? [statusFilter] : [])
    : JOB_FAILURE_STATUSES;
  const wantFailures = failureStatuses.length > 0 &&
    (wantsLevel(ctx, "error") || wantsLevel(ctx, "critical"));
  if (wantFailures) {
    let q = ctx.supabase.from("integration_jobs").select(JOB_COLS)
      .in("status", failureStatuses)
      .not("last_error_at", "is", null);
    q = applyWindow(q, "last_error_at", ctx);
    queries.push({ q: q.order("last_error_at", { ascending: false }).limit(cap), col: "last_error_at" });
  }

  // 3) Running jobs, including the stuck ones (stable column: started_at)
  const wantRunning = statusFilter ? statusFilter === "running" : true;
  if (wantRunning) {
    let q = ctx.supabase.from("integration_jobs").select(JOB_COLS)
      .eq("status", "running")
      .not("started_at", "is", null);
    q = applyWindow(q, "started_at", ctx);
    queries.push({ q: q.order("started_at", { ascending: false }).limit(cap), col: "started_at" });
  }

  // 4) Worker audit log (stable column: created_at) — `status` maps to `action`.
  let auditQ: any = ctx.supabase
    .from("integration_audit_logs")
    .select("id,organization_id,integration_slug,action,actor,details,job_id,event_id,created_at");
  if (statusFilter) auditQ = auditQ.eq("action", statusFilter);
  else if (severityFiltered(ctx) && !wantsLevel(ctx, "info")) {
    auditQ = auditQ.in("action", AUDIT_FAILURE_ACTIONS);
  }
  auditQ = applyWindow(auditQ, "created_at", ctx);
  auditQ = auditQ.order("created_at", { ascending: false }).limit(cap);

  // 5) integration_events (stable column: occurred_at)
  let eventsQ: any = ctx.supabase
    .from("integration_events")
    .select("id,organization_id,aggregate_type,event_type,status,occurred_at,published_at");
  let includeEvents = true;
  if (statusFilter) eventsQ = eventsQ.eq("status", statusFilter);
  else if (severityFiltered(ctx) && !wantsLevel(ctx, "info")) {
    if (wantsLevel(ctx, "error")) eventsQ = eventsQ.eq("status", "failed");
    else includeEvents = false;
  }
  eventsQ = applyWindow(eventsQ, "occurred_at", ctx);
  eventsQ = eventsQ.order("occurred_at", { ascending: false }).limit(cap);

  const jobQueries = queries.filter(Boolean) as Array<{ q: any; col: string }>;
  const settled = await Promise.allSettled([
    ...jobQueries.map((entry) => withTimeout(entry.q)),
    withTimeout(auditQ),
    includeEvents ? withTimeout(eventsQ) : Promise.resolve({ data: [], error: null } as any),
  ]);

  const out: Event[] = [];
  const now = Date.now();
  const seen = new Set<string>();

  jobQueries.forEach((entry, index) => {
    for (const row of rowsOf(settled[index])) {
      const occurredAt = row[entry.col];
      if (!occurredAt) continue;
      const event = jobEvent(row, String(occurredAt), now);
      if (seen.has(event.id)) continue;
      seen.add(event.id);
      out.push(event);
    }
  });

  const auditRes = settled[jobQueries.length];
  const eventsRes = settled[jobQueries.length + 1];


  for (const a of rowsOf(auditRes)) {
    const action = String(a.action ?? "unknown");
    const d = (a.details ?? {}) as Record<string, unknown>;
    const attempt = num(d.attempt ?? d.attempts);
    const maxAttempts = num(d.max_attempts ?? d.maxAttempts);
    const httpStatus = num(d.http_status ?? d.status_code) ?? httpStatusFrom(d) ??
      httpStatusFromText(d.error ?? d.message ?? d.last_error);
    const error = sanitizeError(d.error ?? d.message ?? d.last_error);
    const batch = num(d.processed ?? d.batch_size ?? d.jobs);
    const timedOut = isTimeout(d.error ?? d.message ?? d.last_error);

    let level: Level = "info";
    if (action === "worker.permanent" || /dead_letter/.test(action)) level = "critical";
    else if (action === "worker.retryable" || action === "retry_scheduled" || /retry/.test(action)) {
      level = "warning";
    } else if (/fail|error/.test(action)) level = "error";
    if (level === "info" && (timedOut || (httpStatus !== null && httpStatus >= 500))) {
      level = "error";
    }

    let summary: string;
    if (action === "worker.success") {
      summary = httpStatus
        ? `Execução do worker concluída com HTTP ${httpStatus}`
        : "Execução do worker concluída com sucesso";
    } else if (action === "worker.permanent") {
      summary = `Job encerrado como falha permanente${
        attempt && maxAttempts ? ` — tentativa ${attempt} de ${maxAttempts}` : ""
      }${error ? ` — ${error}` : ""}`;
    } else if (action === "worker.retryable" || action === "retry_scheduled") {
      summary = attempt && maxAttempts
        ? `Job enviado para retry — tentativa ${attempt} de ${maxAttempts}`
        : "Retry agendado para o job";
    } else if (batch !== null) {
      summary = `Worker processou lote com ${batch} jobs`;
    } else {
      summary = `Ação do worker: ${action}`;
    }

    out.push({
      id: `audit:${a.id}`,
      occurredAt: String(a.created_at),
      level,
      status: action,
      type: "outbox.audit",
      summary,
      durationMs: num(d.duration_ms ?? d.durationMs),
      attempt,
      maxAttempts,
      referenceId: a.job_id ?? a.event_id ?? null,
      severitySource: "audit",
      metadata: {
        integrationSlug: a.integration_slug ?? null,
        actor: a.actor ?? null,
        httpStatus,
        timeout: timedOut,
        error,
        integrationJobId: a.job_id ?? null,
        integrationEventId: a.event_id ?? null,
        organizationId: a.organization_id ?? null,
      },
    });
  }

  for (const e of rowsOf(eventsRes)) {
    const status = String(e.status ?? "unknown");
    out.push({
      id: `event:${e.id}`,
      occurredAt: String(e.occurred_at),
      level: status === "failed" ? "error" : "info",
      status,
      type: String(e.event_type ?? "integration.event"),
      summary: `Evento ${e.event_type ?? "desconhecido"} publicado com status ${status}`,
      durationMs: durationBetween(e.occurred_at, e.published_at),
      attempt: null,
      maxAttempts: null,
      referenceId: e.id,
      severitySource: "event",
      metadata: {
        aggregateType: e.aggregate_type ?? null,
        integrationEventId: e.id,
        publishedAt: e.published_at ?? null,
        organizationId: e.organization_id ?? null,
      },
    });
  }

  return out;
}

function inboundLevel(status: string): Level {
  if (status === "dead_letter") return "critical";
  if (status === "failed" || status === "parse_failed") return "error";
  if (status === "retry_scheduled" || status === "retrying" || status === "divergent") {
    return "warning";
  }
  return "info";
}

function inboundSummary(row: any, status: string, error: string | null): string {
  const source = row.source_event ?? "evento";
  switch (status) {
    case "processed":
      return `Evento ${source} processado com sucesso`;
    case "pending":
    case "received":
      return `Evento ${source} recebido e aguardando processamento`;
    case "failed":
      return `Falha ao processar ${source}${error ? ` — ${error}` : ""}`;
    case "dead_letter":
      return `Evento ${source} movido para dead letter${
        row.dead_letter_reason ? ` (${row.dead_letter_reason})` : ""
      }`;
    case "parse_failed":
      return `Falha de parse em ${source}${error ? ` — ${error}` : ""}`;
    default:
      return `Evento ${source} com status ${status}`;
  }
}

function inboundEvent(row: any, prefix: string): Event {
  const status = String(row.process_status ?? "unknown");
  const error = sanitizeError(row.process_error);
  return {
    id: `${prefix}:${row.id}`,
    // occurredAt IS the ordering/pagination column (received_at) so the keyset
    // stays consistent; processing timestamps live in metadata.
    occurredAt: String(row.received_at ?? row.last_attempt_at ?? row.processed_at),
    level: inboundLevel(status),
    status,
    type: `inbound.${row.source_event ?? "event"}`,
    summary: inboundSummary(row, status, error),
    durationMs: durationBetween(row.received_at, row.processed_at),
    attempt: num(row.retry_count),
    maxAttempts: num(row.max_attempts),
    referenceId: row.id,
    metadata: {
      integrationSlug: row.integration_slug ?? null,
      sourceEvent: row.source_event ?? null,
      handlerKey: row.handler_key ?? null,
      parserFunction: row.parser_function ?? null,
      errorClassification: row.error_classification ?? null,
      deadLetterReason: row.dead_letter_reason ?? null,
      parseAttempts: num(row.parse_attempts),
      replayCount: num(row.replay_count),
      shadowMode: row.shadow_mode ?? null,
      processedAt: row.processed_at ?? null,
      lastAttemptAt: row.last_attempt_at ?? null,
      traceId: row.trace_id ?? null,
      error,
      organizationId: row.organization_id ?? null,
    },
  };
}

const INBOUND_COLS =
  "id,organization_id,integration_slug,source_event,received_at,processed_at,last_attempt_at,process_status,process_error,error_classification,dead_letter_reason,retry_count,max_attempts,parse_attempts,replay_count,handler_key,parser_function,trace_id,shadow_mode";

const INBOUND_FAILURE_STATUSES = [
  "failed",
  "parse_failed",
  "dead_letter",
  "retry_scheduled",
  "retrying",
  "divergent",
];

async function inboxDispatcherEvents(ctx: Ctx): Promise<Event[]> {
  let inboundQ: any = ctx.supabase.from("integration_inbound_events").select(INBOUND_COLS);
  inboundQ = applyWindow(inboundQ, "received_at", ctx);
  if (ctx.status) inboundQ = inboundQ.eq("process_status", ctx.status);
  else if (severityFiltered(ctx) && !wantsLevel(ctx, "info")) {
    inboundQ = inboundQ.in("process_status", INBOUND_FAILURE_STATUSES);
  }
  inboundQ = inboundQ.order("received_at", { ascending: false }).limit(ctx.limit);

  let ingestQ = ctx.supabase
    .from("integration_inbound_ingest_errors")
    .select("id,organization_id,integration_slug,event_type,error_code,error_message,trace_id,created_at");
  ingestQ = applyWindow(ingestQ, "created_at", ctx);
  ingestQ = ingestQ.order("created_at", { ascending: false }).limit(ctx.limit);

  let dlqQ = ctx.supabase
    .from("integration_inbound_dead_letter_archive")
    .select(
      "id,organization_id,integration_slug,event_type,dead_letter_reason,retry_count,archived_at,archived_by,inbound_event_id",
    );
  dlqQ = applyWindow(dlqQ, "archived_at", ctx);
  dlqQ = dlqQ.order("archived_at", { ascending: false }).limit(ctx.limit);

  const [inboundRes, ingestRes, dlqRes] = await Promise.allSettled([
    withTimeout(inboundQ),
    withTimeout(ingestQ),
    withTimeout(dlqQ),
  ]);

  const out: Event[] = rowsOf(inboundRes).map((r) => inboundEvent(r, "inbound"));

  for (const e of rowsOf(ingestRes)) {
    out.push({
      id: `ingest-error:${e.id}`,
      occurredAt: String(e.created_at),
      level: "error",
      status: "ingest_error",
      type: `inbound.${e.event_type ?? "event"}`,
      summary: `Falha na ingestão de ${e.event_type ?? "evento"}${
        e.error_code ? ` (${e.error_code})` : ""
      }`,
      durationMs: null,
      attempt: null,
      maxAttempts: null,
      referenceId: e.id,
      metadata: {
        integrationSlug: e.integration_slug ?? null,
        errorCode: e.error_code ?? null,
        error: sanitizeError(e.error_message),
        traceId: e.trace_id ?? null,
        organizationId: e.organization_id ?? null,
      },
    });
  }

  for (const d of rowsOf(dlqRes)) {
    out.push({
      id: `dlq:${d.id}`,
      occurredAt: String(d.archived_at),
      level: "critical",
      status: "dead_letter_archived",
      type: `inbound.${d.event_type ?? "event"}`,
      summary: `Evento arquivado em dead letter${
        d.dead_letter_reason ? ` (${d.dead_letter_reason})` : ""
      }`,
      durationMs: null,
      attempt: num(d.retry_count),
      maxAttempts: null,
      referenceId: d.inbound_event_id ?? d.id,
      metadata: {
        integrationSlug: d.integration_slug ?? null,
        deadLetterReason: d.dead_letter_reason ?? null,
        archivedBy: d.archived_by ?? null,
        organizationId: d.organization_id ?? null,
      },
    });
  }

  return out;
}

async function inboxReaperEvents(ctx: Ctx): Promise<Event[]> {
  const res = await Promise.allSettled([
    withTimeout(
      ctx.supabase
        .from("outbox_system_heartbeats")
        .select("component,last_run_at,last_detail")
        .eq("component", "reaper")
        .limit(1),
    ),
  ]);
  const rows = rowsOf(res[0]);
  const row = rows[0];
  if (!row?.last_run_at) return [];

  const occurredAt = String(row.last_run_at);
  if (ctx.cursor && occurredAt >= ctx.cursor) return [];
  if (ctx.from && occurredAt < ctx.from) return [];
  if (ctx.to && occurredAt > ctx.to) return [];

  const detail = (row.last_detail ?? {}) as Record<string, unknown>;
  const reaped = num(detail.reaped) ?? 0;
  const error = sanitizeError(detail.error);
  const status = error ? "failed" : "completed";
  if (ctx.status && ctx.status !== status) return [];

  return [
    {
      id: `reaper:${occurredAt}`,
      occurredAt,
      level: error ? "error" : "info",
      status,
      type: "reaper.run",
      summary: error
        ? `Execução do reaper falhou — ${error}`
        : `Execução do reaper concluída — ${reaped} jobs reaproveitados`,
      durationMs: num(detail.duration_ms),
      attempt: null,
      maxAttempts: null,
      referenceId: null,
      metadata: { reaped, error },
    },
  ];
}

async function evolutionEvents(ctx: Ctx): Promise<Event[]> {
  let inboundQ: any = ctx.supabase
    .from("integration_inbound_events")
    .select(INBOUND_COLS)
    .eq("integration_slug", "evolution_api");
  inboundQ = applyWindow(inboundQ, "received_at", ctx);
  if (ctx.status) inboundQ = inboundQ.eq("process_status", ctx.status);
  else if (severityFiltered(ctx) && !wantsLevel(ctx, "info")) {
    inboundQ = inboundQ.in("process_status", INBOUND_FAILURE_STATUSES);
  }
  inboundQ = inboundQ.order("received_at", { ascending: false }).limit(ctx.limit);

  let instancesQ = ctx.supabase
    .from("evolution_instances")
    .select("id,organization_id,instance_name,last_known_state,last_state_checked_at,endpoint_id");
  instancesQ = applyWindow(instancesQ, "last_state_checked_at", ctx);
  instancesQ = instancesQ.order("last_state_checked_at", { ascending: false }).limit(ctx.limit);

  const [inboundRes, instancesRes, endpointsRes] = await Promise.allSettled([
    withTimeout(inboundQ),
    withTimeout(instancesQ),
    withTimeout(
      ctx.supabase
        .from("communication_endpoints")
        .select("id")
        .eq("provider", "evolution_api")
        .limit(100),
    ),
  ]);

  const out: Event[] = rowsOf(inboundRes).map((r) => inboundEvent(r, "evolution"));

  for (const i of rowsOf(instancesRes)) {
    if (!i.last_state_checked_at) continue;
    const state = String(i.last_known_state ?? "unknown").toLowerCase();
    const level: Level = state === "open" ? "info" : state === "close" ? "critical" : "warning";
    out.push({
      id: `evolution-instance:${i.id}:${i.last_state_checked_at}`,
      occurredAt: String(i.last_state_checked_at),
      level,
      status: state,
      type: "evolution.connection_state",
      summary: `Instância ${maskIdentifier(i.instance_name)} com estado "${state}"`,
      durationMs: null,
      attempt: null,
      maxAttempts: null,
      referenceId: i.id,
      metadata: {
        instance: maskIdentifier(i.instance_name),
        state,
        endpointId: i.endpoint_id ?? null,
        organizationId: i.organization_id ?? null,
      },
    });
  }

  // Outbound send failures already persisted on Evolution endpoints (no content).
  const endpointIds = rowsOf(endpointsRes).map((e) => e.id).filter(Boolean);
  if (endpointIds.length > 0) {
    let msgQ = ctx.supabase
      .from("messages")
      .select("id,organization_id,endpoint_id,whatsapp_status,error_code,error_message,sent_at,created_at")
      .in("endpoint_id", endpointIds)
      .not("error_code", "is", null);
    msgQ = applyWindow(msgQ, "created_at", ctx);
    msgQ = msgQ.order("created_at", { ascending: false }).limit(ctx.limit);
    const msgRes = await Promise.allSettled([withTimeout(msgQ)]);
    for (const m of rowsOf(msgRes[0])) {
      const error = sanitizeError(m.error_message);
      out.push({
        id: `evolution-send:${m.id}`,
        occurredAt: String(m.sent_at ?? m.created_at),
        level: "error",
        status: String(m.whatsapp_status ?? "failed"),
        type: "evolution.send_failed",
        summary: `Falha de envio pelo Evolution${m.error_code ? ` (${m.error_code})` : ""}${
          error ? ` — ${error}` : ""
        }`,
        durationMs: null,
        attempt: null,
        maxAttempts: null,
        referenceId: m.id,
        metadata: {
          errorCode: m.error_code ?? null,
          error,
          endpointId: m.endpoint_id ?? null,
          organizationId: m.organization_id ?? null,
        },
      });
    }
  }

  return out;
}

// ------------------------------------------------------------------- handler

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body, null, 2), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  const token = req.headers.get("x-health-token") ?? "";
  if (!HEALTH_TOKEN || token !== HEALTH_TOKEN) {
    return json({ error: "unauthorized" }, 401);
  }
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) return json({ error: "misconfigured" }, 500);

  const url = new URL(req.url);
  const slug = (url.searchParams.get("service") ?? "").trim();
  if (!slug) return json({ error: "missing_service" }, 400);
  if (!(slug in SERVICES)) return json({ error: "unknown_service" }, 400);

  const rawLimit = Number(url.searchParams.get("limit") ?? "50");
  const limit = Number.isFinite(rawLimit) ? Math.min(100, Math.max(1, Math.trunc(rawLimit))) : 50;

  const isoOrNull = (v: string | null) => {
    if (!v) return null;
    const t = new Date(v);
    return Number.isFinite(t.getTime()) ? t.toISOString() : null;
  };

  const VALID_LEVELS: Level[] = ["info", "warning", "error", "critical"];
  const rawLevel = (url.searchParams.get("level") ?? "").trim();
  const severityOnly = ["1", "true", "yes"].includes(
    (url.searchParams.get("severityOnly") ?? "").trim().toLowerCase(),
  );
  let levels: Set<Level> | null = null;
  if (rawLevel) {
    const parsed = rawLevel.split(",").map((v) => v.trim().toLowerCase()).filter(Boolean);
    const invalid = parsed.filter((v) => !VALID_LEVELS.includes(v as Level));
    if (invalid.length > 0) return json({ error: "invalid_level", invalid }, 400);
    levels = new Set(parsed as Level[]);
  } else if (severityOnly) {
    levels = new Set<Level>(["warning", "error", "critical"]);
  }

  const service = { slug, displayName: SERVICES[slug] };
  const base = { generated_at: new Date().toISOString(), service };

  if (NO_SOURCE.has(slug)) {
    return json({
      ...base,
      events: [],
      nextCursor: null,
      pagination: { mode: "per-source-keyset" },
    });
  }

  const ctx: Ctx = {
    supabase: createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } }),
    limit,
    cursor: isoOrNull(url.searchParams.get("cursor")),
    status: url.searchParams.get("status")?.trim() || null,
    from: isoOrNull(url.searchParams.get("from")),
    to: isoOrNull(url.searchParams.get("to")),
    levels,
  };

  try {
    let events: Event[] = [];
    if (slug === "outbox-worker") events = await outboxWorkerEvents(ctx);
    else if (slug === "inbox-dispatcher") events = await inboxDispatcherEvents(ctx);
    else if (slug === "inbox-reaper") events = await inboxReaperEvents(ctx);
    else if (slug === "evolution-api") events = await evolutionEvents(ctx);

    events = events
      .filter((e) => e.occurredAt && Number.isFinite(new Date(e.occurredAt).getTime()))
      // Severity filter is applied AFTER normalization, so it means the same
      // thing for every source.
      .filter((e) => (levels === null ? true : levels.has(e.level)))
      .sort((a, b) => (a.occurredAt < b.occurredAt ? 1 : a.occurredAt > b.occurredAt ? -1 : 0));

    const page = events.slice(0, limit);
    const nextCursor = page.length === limit && events.length > limit
      ? page[page.length - 1].occurredAt
      : null;

    return json({
      ...base,
      filters: {
        level: levels ? [...levels] : null,
        status: ctx.status,
        from: ctx.from,
        to: ctx.to,
      },
      events: page,
      nextCursor,
      pagination: { mode: "per-source-keyset" },
    });
  } catch (err) {
    console.error("service-events failed", sanitizeError((err as Error)?.message));
    return json({ error: "internal_error" }, 500);
  }
});
