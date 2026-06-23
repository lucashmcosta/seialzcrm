// Nammux replay: re-publishes a won opportunity to Nammux with a freshly-built
// payload (current attachments + approved document_submissions).
//
// - Does NOT touch the original integration_events row (history preserved).
// - Inserts a new replay integration_event with event_type='opportunity.won.replay'
//   so the fanout trigger does NOT pick it up (only 'opportunity.won' subs match).
// - Manually inserts ONE integration_job for the Nammux subscription, with the
//   freshly-built payload. The handler reads ctx.event.payload, which is the
//   fresh payload we stored on the replay event.
// - Audit log + metadata flags: replay=true, replay_reason, requested_by_user_id.
// - Auth: requires Supabase JWT + caller must have can_manage_integrations
//   in the target organization.

import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "method_not_allowed" });

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;

  // --- 1. Auth: resolve caller from JWT ---
  const authHeader = req.headers.get("Authorization") ?? "";
  const jwt = authHeader.replace(/^Bearer\s+/i, "").trim();
  if (!jwt) return json(401, { error: "missing_authorization" });

  const authClient = createClient(SUPABASE_URL, ANON, {
    global: { headers: { Authorization: `Bearer ${jwt}` } },
    auth: { persistSession: false },
  });
  const { data: userData, error: userErr } = await authClient.auth.getUser();
  if (userErr || !userData?.user) return json(401, { error: "invalid_jwt" });
  const authUserId = userData.user.id;

  // --- 2. Parse body ---
  let body: { opportunity_id?: string; reason?: string };
  try {
    body = await req.json();
  } catch {
    return json(400, { error: "invalid_json" });
  }
  const opportunityId = (body.opportunity_id ?? "").trim();
  const reason = (body.reason ?? "documents_v2_backfill").trim();
  if (!opportunityId) return json(400, { error: "opportunity_id required" });

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { persistSession: false },
  });

  // --- 3. Load opportunity and validate status=won ---
  const { data: opp, error: oppErr } = await admin
    .from("opportunities")
    .select("id, organization_id, status, deleted_at")
    .eq("id", opportunityId)
    .maybeSingle();
  if (oppErr) return json(500, { error: "opp_lookup_failed", details: oppErr.message });
  if (!opp || opp.deleted_at) return json(404, { error: "opportunity_not_found" });
  if (opp.status !== "won") return json(400, { error: "opportunity_not_won" });

  const orgId = opp.organization_id as string;

  // --- 4. Resolve internal user (users table maps auth_user_id -> internal id) ---
  const { data: profile } = await admin
    .from("users")
    .select("id")
    .eq("auth_user_id", authUserId)
    .maybeSingle();
  const internalUserId = profile?.id ?? null;
  if (!internalUserId) return json(403, { error: "user_profile_not_found" });

  // --- 5. Validate caller belongs to org and has can_manage_integrations ---
  const { data: membership, error: memErr } = await admin
    .from("user_organizations")
    .select("permission_profile_id, is_active")
    .eq("user_id", internalUserId)
    .eq("organization_id", orgId)
    .eq("is_active", true)
    .maybeSingle();
  if (memErr) return json(500, { error: "membership_lookup_failed", details: memErr.message });
  if (!membership) return json(403, { error: "not_a_member_of_org" });

  const { data: perms } = await admin
    .from("permission_profiles")
    .select("permissions")
    .eq("id", membership.permission_profile_id)
    .maybeSingle();
  const canManage = (perms?.permissions as Record<string, unknown> | null)?.[
    "can_manage_integrations"
  ];
  if (canManage !== true) return json(403, { error: "forbidden" });

  // --- 6. Find active Nammux subscription for this org ---
  const { data: sub, error: subErr } = await admin
    .from("integration_subscriptions")
    .select("id, integration_slug, target_action, event_type, is_active")
    .eq("organization_id", orgId)
    .eq("integration_slug", "nammux")
    .eq("event_type", "opportunity.won")
    .eq("target_action", "send_opportunity_won")
    .eq("is_active", true)
    .maybeSingle();
  if (subErr) return json(500, { error: "subscription_lookup_failed", details: subErr.message });
  if (!sub) return json(400, { error: "nammux_subscription_not_active" });

  // --- 7. Build fresh payload from current data ---
  const { data: payloadRpc, error: payloadErr } = await admin.rpc(
    "fn_build_opportunity_won_payload",
    { _opportunity_id: opportunityId },
  );
  if (payloadErr) {
    return json(500, { error: "payload_build_failed", details: payloadErr.message });
  }
  const payload = (payloadRpc ?? {}) as Record<string, unknown>;
  const attachments = Array.isArray(payload.attachments) ? payload.attachments : [];
  const submissions = Array.isArray(payload.document_submissions)
    ? payload.document_submissions
    : [];

  // --- 8. Find original integration_event id (for audit only) ---
  const { data: originalEvt } = await admin
    .from("integration_events")
    .select("id, idempotency_key")
    .eq("organization_id", orgId)
    .eq("aggregate_id", opportunityId)
    .eq("event_type", "opportunity.won")
    .order("occurred_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const originalEventId = originalEvt?.id ?? null;

  // --- 9. Insert REPLAY integration_event.
  // event_type='opportunity.won.replay' so the fanout trigger doesn't fan out
  // to all subscriptions (no sub listens to .replay). We manually create the
  // single nammux job below.
  const replayTs = Date.now();
  const replayIdempotencyKey =
    `seialz:opportunity.won.replay:${orgId}:${opportunityId}:${replayTs}`;

  const enrichedPayload = {
    ...payload,
    _replay: {
      replay: true,
      replay_reason: reason,
      requested_by_user_id: internalUserId,
      original_event_id: originalEventId,
      requested_at: new Date().toISOString(),
    },
  };

  const { data: replayEvt, error: evtErr } = await admin
    .from("integration_events")
    .insert({
      organization_id: orgId,
      event_type: "opportunity.won.replay",
      aggregate_type: "opportunity",
      aggregate_id: opportunityId,
      payload: enrichedPayload,
      idempotency_key: replayIdempotencyKey,
      status: "pending",
    })
    .select("id, occurred_at, idempotency_key")
    .single();
  if (evtErr || !replayEvt) {
    return json(500, { error: "replay_event_insert_failed", details: evtErr?.message });
  }

  // --- 10. Insert ONE integration_job for the nammux subscription.
  // Worker uses idempotency_key UNIQUE constraint => use a fresh deterministic key.
  const jobIdemKey = `${replayIdempotencyKey}:${sub.id}`;
  const { data: job, error: jobErr } = await admin
    .from("integration_jobs")
    .insert({
      organization_id: orgId,
      event_id: replayEvt.id,
      subscription_id: sub.id,
      integration_slug: "nammux",
      target_action: "send_opportunity_won",
      payload: enrichedPayload,
      idempotency_key: jobIdemKey,
      status: "pending",
      attempts: 0,
      next_run_at: new Date().toISOString(),
    })
    .select("id, status, next_run_at")
    .single();
  if (jobErr || !job) {
    return json(500, { error: "job_insert_failed", details: jobErr?.message });
  }

  // Mark replay event as published (no other consumers).
  await admin
    .from("integration_events")
    .update({ status: "published", published_at: new Date().toISOString() })
    .eq("id", replayEvt.id);

  // --- 11. Audit log ---
  await admin.from("integration_audit_logs").insert({
    organization_id: orgId,
    job_id: job.id,
    event_id: replayEvt.id,
    integration_slug: "nammux",
    action: "nammux.opportunity_won.replay_requested",
    actor: `user:${internalUserId}`,
    details: {
      opportunity_id: opportunityId,
      original_event_id: originalEventId,
      replay_event_id: replayEvt.id,
      replay_idempotency_key: replayEvt.idempotency_key,
      job_id: job.id,
      job_idempotency_key: jobIdemKey,
      requested_by_user_id: internalUserId,
      requested_by_auth_user_id: authUserId,
      replay_reason: reason,
      attachments_count: attachments.length,
      document_submissions_count: submissions.length,
    },
  });

  return json(200, {
    ok: true,
    opportunity_id: opportunityId,
    original_event_id: originalEventId,
    replay_event_id: replayEvt.id,
    job_id: job.id,
    subscription_id: sub.id,
    attachments_count: attachments.length,
    document_submissions_count: submissions.length,
    replay_reason: reason,
    message:
      "Replay job queued. The integration-worker cron will pick it up within ~30s.",
  });
});
