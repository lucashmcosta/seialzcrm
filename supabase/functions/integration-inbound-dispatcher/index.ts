// =====================================================================
// Inbox v2 — Fase 2 read-only parity dispatcher
// =====================================================================
// Compara cada evento shadow do twilio-whatsapp com o registro real em
// `messages` e grava o resultado em `integration_inbound_dry_run_log`.
//
// NUNCA escreve em: messages, message_threads, contacts, opportunities.
// NUNCA muda process_status dos eventos shadow.
// NUNCA envia mensagens.
//
// Gateado por: integration_feature_flags.inbox_v2.dispatch.twilio-whatsapp
// =====================================================================

import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

const HANDLER_KEY = "twilio.whatsapp.parity_check.v1";
const FLAG_KEY = "inbox_v2.dispatch.twilio-whatsapp";
const INTEGRATION_SLUG = "twilio-whatsapp";
const DEFAULT_BATCH = 25;
const MAX_BATCH = 100;

type InboundEvent = {
  id: string;
  organization_id: string | null;
  integration_slug: string;
  source_event: string | null;
  external_id: string | null;
  raw_payload: Record<string, unknown> | null;
  received_at: string;
  trace_id: string | null;
  handler_key: string | null;
  shadow_mode: boolean;
};

type LegacyMessage = {
  id: string;
  organization_id: string | null;
  thread_id: string | null;
  direction: string | null;
  content: string | null;
  whatsapp_message_sid: string | null;
  created_at: string;
};

type Outcome =
  | "match"
  | "divergent"
  | "legacy_missing"
  | "v2_extra"
  | "error"
  | "v2_parse_error"
  | "unsupported_event_type"
  | "postgrest_lookup_failed";

// CHECK constraint on integration_inbound_dry_run_log.outcome only allows these:
const PERSISTED_OUTCOMES = new Set<string>([
  "match",
  "divergent",
  "legacy_missing",
  "v2_extra",
  "error",
]);

function persistOutcome(
  outcome: Outcome,
  diffSummary: Record<string, unknown> | null,
): { outcome: string; diffSummary: Record<string, unknown> | null } {
  if (PERSISTED_OUTCOMES.has(outcome)) {
    return { outcome, diffSummary };
  }
  return {
    outcome: "error",
    diffSummary: { ...(diffSummary ?? {}), error_type: outcome },
  };
}

const SELECT_COLS =
  "id, organization_id, thread_id, direction, content, whatsapp_message_sid, created_at";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function parseIntended(ev: InboundEvent): {
  ok: boolean;
  intended?: Record<string, unknown>;
  reason?: string;
  unsupported?: boolean;
} {
  try {
    const p = (ev.raw_payload ?? {}) as Record<string, unknown>;
    const messageSid = (p.MessageSid ?? p.SmsMessageSid ?? null) as string | null;

    if (ev.source_event !== "inbound_message") {
      return {
        ok: false,
        unsupported: true,
        reason: `source_event=${ev.source_event}`,
      };
    }
    if (!messageSid) {
      return { ok: false, reason: "missing MessageSid in raw_payload" };
    }

    return {
      ok: true,
      intended: {
        message_sid: messageSid,
        wa_id: p.WaId ?? null,
        from: p.From ?? null,
        to: p.To ?? null,
        body: p.Body ?? null,
        num_media: p.NumMedia ?? null,
        profile_name: p.ProfileName ?? null,
        organization_id: ev.organization_id,
        source_event: ev.source_event,
        expected_direction: "inbound",
      },
    };
  } catch (e) {
    return { ok: false, reason: `parse_exception: ${String(e)}` };
  }
}

function buildDiff(
  intended: Record<string, unknown>,
  legacy: LegacyMessage,
  crossOrg: boolean,
): { divergent: boolean; diff: Record<string, unknown> } {
  const fields: string[] = [];
  const detail: Record<string, unknown> = {};

  if (crossOrg) {
    fields.push("organization_id");
    detail.organization_id = {
      expected: intended.organization_id,
      legacy: legacy.organization_id,
      cross_org_leak: true,
    };
  } else if (
    intended.organization_id &&
    legacy.organization_id &&
    intended.organization_id !== legacy.organization_id
  ) {
    fields.push("organization_id");
    detail.organization_id = {
      expected: intended.organization_id,
      legacy: legacy.organization_id,
    };
  }

  if (legacy.direction !== "inbound") {
    fields.push("direction");
    detail.direction = { expected: "inbound", legacy: legacy.direction };
  }

  const intendedBody = (intended.body ?? "") as string;
  const legacyBody = legacy.content ?? "";
  const intendedHasText = intendedBody.length > 0;
  const numMedia = Number(intended.num_media ?? 0);
  const allowEmpty = !intendedHasText && numMedia > 0;
  if (!allowEmpty && intendedBody !== legacyBody) {
    fields.push("content");
    detail.content = {
      expected_len: intendedBody.length,
      legacy_len: legacyBody.length,
      equal_trimmed: intendedBody.trim() === legacyBody.trim(),
    };
  }

  if (!legacy.thread_id) {
    fields.push("thread_id");
    detail.thread_id = { legacy: null };
  }

  return {
    divergent: fields.length > 0,
    diff: { fields, detail, cross_org_leak: crossOrg },
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const startedAt = Date.now();
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );

  // Parâmetros opcionais
  type DispatcherFilters = {
    organization_id_not_null?: boolean;
    source_event?: string;
    received_after?: string;
    exclude_message_sid_prefix?: string;
  };

  let batchSize = DEFAULT_BATCH;
  let filters: DispatcherFilters | null = null;
  try {
    if (req.method === "POST") {
      const body = await req.json().catch(() => ({}));
      if (typeof body?.batch_size === "number") {
        batchSize = Math.max(1, Math.min(MAX_BATCH, Math.floor(body.batch_size)));
      }
      if (body?.filters && typeof body.filters === "object") {
        filters = body.filters as DispatcherFilters;
      }
    } else {
      const url = new URL(req.url);
      const bs = url.searchParams.get("batch_size");
      if (bs) batchSize = Math.max(1, Math.min(MAX_BATCH, parseInt(bs, 10) || DEFAULT_BATCH));
    }
  } catch { /* ignore */ }

  // 1) Gate por feature flag
  const { data: flagEnabled, error: flagErr } = await supabase.rpc(
    "fn_feature_flag_enabled",
    { _flag_key: FLAG_KEY, _organization_id: null },
  );
  if (flagErr) {
    console.error(JSON.stringify({
      level: "error",
      msg: "inbox_v2.parity.flag_check_failed",
      error: flagErr.message,
    }));
    return jsonResponse({ ok: false, error: "flag_check_failed" }, 500);
  }
  if (flagEnabled !== true) {
    return jsonResponse({
      ok: true,
      skipped: true,
      reason: "feature_flag_disabled",
      flag: FLAG_KEY,
    });
  }

  // 2) Claim — caminho filtrado (auditoria) ou legado (RPC)
  const workerId = `dispatcher-${crypto.randomUUID()}`;
  let events: InboundEvent[] = [];

  if (filters) {
    // (a) Pré-seleção sem efeitos colaterais
    let q = supabase
      .from("integration_inbound_events")
      .select(
        "id, organization_id, integration_slug, source_event, external_id, " +
        "raw_payload, received_at, trace_id, handler_key, shadow_mode",
      )
      .eq("integration_slug", INTEGRATION_SLUG)
      .eq("shadow_mode", true)
      .eq("process_status", "received")
      .order("received_at", { ascending: true })
      .limit(batchSize * 5);

    if (filters.organization_id_not_null) q = q.not("organization_id", "is", null);
    if (filters.source_event)             q = q.eq("source_event", filters.source_event);
    if (filters.received_after)           q = q.gt("received_at", filters.received_after);

    const { data: candidates, error: candErr } = await q;
    if (candErr) {
      console.error(JSON.stringify({
        level: "error", msg: "inbox_v2.parity.filter_select_failed",
        error: candErr.message,
      }));
      return jsonResponse({ ok: false, error: "filter_select_failed" }, 500);
    }

    // (b) Filtro de prefixo de SID em memória
    const prefix = filters.exclude_message_sid_prefix;
    const filteredBySid = (candidates ?? []).filter((row) => {
      if (!prefix) return true;
      const p = (row.raw_payload ?? {}) as Record<string, unknown>;
      const sid = String(p.MessageSid ?? p.SmsMessageSid ?? "");
      return !sid.startsWith(prefix);
    });

    // (c) Excluir eventos já logados em dry_run_log para o mesmo handler
    let notLogged = filteredBySid;
    if (filteredBySid.length > 0) {
      const candidateIds = filteredBySid.map((r) => r.id);
      const { data: alreadyLogged, error: logSelErr } = await supabase
        .from("integration_inbound_dry_run_log")
        .select("inbound_event_id")
        .eq("handler_key", HANDLER_KEY)
        .in("inbound_event_id", candidateIds);
      if (logSelErr) {
        console.error(JSON.stringify({
          level: "error", msg: "inbox_v2.parity.dry_run_log_check_failed",
          error: logSelErr.message,
        }));
        return jsonResponse({ ok: false, error: "dry_run_log_check_failed" }, 500);
      }
      const loggedSet = new Set((alreadyLogged ?? []).map((r) => r.inbound_event_id));
      notLogged = filteredBySid.filter((r) => !loggedSet.has(r.id));
    }

    // (d) Claim idempotente
    for (const row of notLogged) {
      if (events.length >= batchSize) break;
      const { error: claimErr } = await supabase
        .from("integration_inbound_event_claims")
        .insert({
          inbound_event_id: row.id,
          handler_key: HANDLER_KEY,
          claimed_by: workerId,
        });
      if (!claimErr) {
        events.push(row as InboundEvent);
      } else if (claimErr.code !== "23505") {
        console.error(JSON.stringify({
          level: "warn", msg: "inbox_v2.parity.claim_insert_failed",
          inbound_event_id: row.id, pg_code: claimErr.code, pg_message: claimErr.message,
        }));
      }
    }
  } else {
    const { data: claimed, error: claimErr } = await supabase.rpc(
      "rpc_claim_inbound_shadow_events",
      {
        _batch_size: batchSize,
        _integration_slug: INTEGRATION_SLUG,
        _handler_key: HANDLER_KEY,
        _worker_id: workerId,
      },
    );
    if (claimErr) {
      console.error(JSON.stringify({
        level: "error",
        msg: "inbox_v2.parity.claim_failed",
        error: claimErr.message,
      }));
      return jsonResponse({ ok: false, error: "claim_failed" }, 500);
    }
    events = (claimed ?? []) as InboundEvent[];
  }
  const counters = {
    claimed: events.length,
    processed: 0,
    match: 0,
    divergent: 0,
    legacy_missing: 0,
    v2_extra: 0,
    error: 0,
    v2_parse_error: 0,
    unsupported_event_type: 0,
    postgrest_lookup_failed: 0,
  };

  for (const ev of events) {
    try {
      const parsed = parseIntended(ev);

      let outcome: Outcome;
      let intendedActions: Record<string, unknown> = {};
      let legacyActual: Record<string, unknown> | null = null;
      let diffSummary: Record<string, unknown> | null = null;

      if (!parsed.ok) {
        outcome = parsed.unsupported ? "unsupported_event_type" : "v2_parse_error";
        intendedActions = {
          source_event: ev.source_event,
          external_id: ev.external_id,
          error: parsed.reason,
        };
      } else {
        intendedActions = parsed.intended!;
        const messageSid = intendedActions.message_sid as string;

        // 3a) Lookup org-scoped primeiro
        let legacy: LegacyMessage | null = null;
        let crossOrgLeak = false;
        let lookupError: { code?: string; message?: string } | null = null;

        if (ev.organization_id) {
          const { data: scoped, error: scopedErr } = await supabase
            .from("messages")
            .select(SELECT_COLS)
            .eq("whatsapp_message_sid", messageSid)
            .eq("organization_id", ev.organization_id)
            .maybeSingle();
          if (scopedErr) {
            lookupError = { code: scopedErr.code, message: scopedErr.message };
          } else {
            legacy = scoped as LegacyMessage | null;
          }
        }

        // 3b) Fallback global apenas para detectar cross-org leak
        if (!legacy && !lookupError) {
          const { data: globalRow, error: globalErr } = await supabase
            .from("messages")
            .select(SELECT_COLS)
            .eq("whatsapp_message_sid", messageSid)
            .limit(1)
            .maybeSingle();
          if (globalErr) {
            lookupError = { code: globalErr.code, message: globalErr.message };
          } else if (globalRow) {
            legacy = globalRow as LegacyMessage;
            crossOrgLeak = ev.organization_id != null
              && legacy.organization_id !== ev.organization_id;
          }
        }

        if (lookupError) {
          outcome = "postgrest_lookup_failed";
          diffSummary = {
            fields: ["lookup_error"],
            detail: {
              sid_used: messageSid,
              scoped_to_org: ev.organization_id,
              pg_code: lookupError.code ?? null,
              pg_message: lookupError.message ?? null,
            },
          };
        } else if (!legacy) {
          outcome = "legacy_missing";
          diffSummary = {
            fields: ["legacy_row"],
            detail: { searched_sid: messageSid, scoped_to_org: ev.organization_id },
          };
        } else {
          legacyActual = legacy as unknown as Record<string, unknown>;
          const { divergent, diff } = buildDiff(intendedActions, legacy, crossOrgLeak);
          outcome = divergent ? "divergent" : "match";
          diffSummary = diff;
        }
      }

      // Map outcome to one accepted by the CHECK constraint, preserving detail
      const persisted = persistOutcome(outcome, diffSummary);

      // 4) Grava resultado (idempotente via uniq_iidrl_event_handler)
      const { error: logErr } = await supabase
        .from("integration_inbound_dry_run_log")
        .insert({
          inbound_event_id: ev.id,
          integration_slug: INTEGRATION_SLUG,
          handler_key: HANDLER_KEY,
          event_version: 1,
          intended_actions: intendedActions,
          legacy_actual: legacyActual,
          diff_summary: persisted.diffSummary,
          outcome: persisted.outcome,
          trace_id: ev.trace_id,
        });

      if (logErr && logErr.code !== "23505") {
        console.error(JSON.stringify({
          level: "error",
          msg: "inbox_v2.parity.log_insert_failed",
          inbound_event_id: ev.id,
          pg_code: logErr.code,
          pg_message: logErr.message,
        }));
      }

      counters[outcome] = (counters[outcome] ?? 0) + 1;
      counters.processed += 1;

      // 5) Libera o claim (não obrigatório; expira em 5min de qualquer forma)
      await supabase
        .from("integration_inbound_event_claims")
        .delete()
        .eq("inbound_event_id", ev.id)
        .eq("handler_key", HANDLER_KEY);
    } catch (e) {
      counters.v2_parse_error += 1;
      counters.processed += 1;
      console.error(JSON.stringify({
        level: "error",
        msg: "inbox_v2.parity.event_exception",
        inbound_event_id: ev.id,
        exception: String(e),
      }));
      await supabase.from("integration_inbound_dry_run_log").insert({
        inbound_event_id: ev.id,
        integration_slug: INTEGRATION_SLUG,
        handler_key: HANDLER_KEY,
        event_version: 1,
        intended_actions: { error: String(e) },
        legacy_actual: null,
        diff_summary: {
          fields: ["exception"],
          detail: { exception: String(e) },
          error_type: "v2_parse_error",
        },
        outcome: "error",
        trace_id: ev.trace_id,
      }).then(() => {}, () => {});
    }
  }

  const durationMs = Date.now() - startedAt;
  const summary = {
    level: "info",
    msg: "inbox_v2.parity.batch",
    worker_id: workerId,
    batch_size: batchSize,
    duration_ms: durationMs,
    ...counters,
  };
  console.log(JSON.stringify(summary));

  return jsonResponse({ ok: true, ...counters, duration_ms: durationMs, worker_id: workerId, filters_applied: filters });
});
