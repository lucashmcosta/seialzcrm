import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "method_not_allowed" });

  const url = Deno.env.get("SUPABASE_URL")!;
  const authorization = req.headers.get("authorization") ?? "";
  const accessToken = authorization.replace(/^Bearer\s+/i, "").trim();
  if (!accessToken) return json(401, { error: "missing_authorization" });
  const authClient = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false },
  });
  const { data: authData, error: authError } = await authClient.auth.getUser(accessToken);
  if (authError || !authData.user) return json(401, { error: "unauthorized" });

  const body = await req.json().catch(() => ({}));
  const organizationId = typeof body.organization_id === "string" ? body.organization_id : "";
  const dryRun = body.dry_run !== false;
  const limit = Math.min(Math.max(Number(body.limit) || 50, 1), 200);
  if (!organizationId) return json(400, { error: "organization_id_required" });

  const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false },
  });
  const { data: internalUser } = await admin
    .from("users")
    .select("id")
    .eq("auth_user_id", authData.user.id)
    .maybeSingle();
  const { data: membership } = internalUser
    ? await admin
      .from("user_organizations")
      .select("permission_profile_id")
      .eq("user_id", internalUser.id)
      .eq("organization_id", organizationId)
      .eq("is_active", true)
      .maybeSingle()
    : { data: null };
  const { data: profile } = membership
    ? await admin
      .from("permission_profiles")
      .select("permissions")
      .eq("id", membership.permission_profile_id)
      .maybeSingle()
    : { data: null };
  if ((profile?.permissions as Record<string, unknown> | null)?.can_manage_integrations !== true) {
    return json(403, { error: "forbidden" });
  }

  const [{ data: successfulJobs }, { data: snapshots }] = await Promise.all([
    admin
      .from("integration_jobs")
      .select("event_id")
      .eq("organization_id", organizationId)
      .eq("integration_slug", "nammux")
      .eq("target_action", "send_opportunity_won")
      .eq("status", "success")
      .order("created_at", { ascending: false })
      .limit(limit * 3),
    admin
      .from("nammux_process_snapshots")
      .select("opportunity_id")
      .eq("organization_id", organizationId)
      .limit(limit),
  ]);
  const eventIds = (successfulJobs ?? []).map((job) => job.event_id);
  const { data: events } = eventIds.length
    ? await admin
      .from("integration_events")
      .select("aggregate_id")
      .eq("organization_id", organizationId)
      .eq("event_type", "opportunity.won")
      .in("id", eventIds)
    : { data: [] as Array<{ aggregate_id: string }> };

  const candidateIds = Array.from(new Set([
    ...(events ?? []).map((event) => event.aggregate_id),
    ...(snapshots ?? []).map((snapshot) => snapshot.opportunity_id),
  ])).slice(0, limit);
  const { data: opportunities } = candidateIds.length
    ? await admin
      .from("opportunities")
      .select("id, status")
      .eq("organization_id", organizationId)
      .eq("status", "won")
      .is("deleted_at", null)
      .in("id", candidateIds)
    : { data: [] as Array<{ id: string; status: string }> };

  if (dryRun) {
    return json(200, {
      ok: true,
      dry_run: true,
      count: opportunities?.length ?? 0,
      opportunity_ids: (opportunities ?? []).map((opportunity) => opportunity.id),
    });
  }

  const runId = crypto.randomUUID();
  const queued: Array<{ opportunity_id: string; event_id: string }> = [];
  const errors: Array<{ opportunity_id: string; error: string }> = [];
  for (const opportunity of opportunities ?? []) {
    const { data: payload, error: payloadError } = await admin.rpc(
      "fn_build_opportunity_won_payload",
      { _opportunity_id: opportunity.id },
    );
    if (payloadError) {
      errors.push({ opportunity_id: opportunity.id, error: payloadError.message });
      continue;
    }
    const { data: event, error } = await admin
      .from("integration_events")
      .insert({
        organization_id: organizationId,
        aggregate_type: "opportunity",
        aggregate_id: opportunity.id,
        event_type: "opportunity.won",
        payload: {
          ...(payload as Record<string, unknown>),
          _replay: {
            replay: true,
            replay_reason: "tenant_reconciliation",
            reconciliation_run_id: runId,
            requested_by_user_id: internalUser!.id,
          },
        },
        idempotency_key:
          `seialz:opportunity.won:${organizationId}:${opportunity.id}:reconcile:${runId}`,
        status: "pending",
      })
      .select("id")
      .single();
    if (error || !event) {
      errors.push({ opportunity_id: opportunity.id, error: error?.message ?? "event_insert_failed" });
    } else {
      queued.push({ opportunity_id: opportunity.id, event_id: event.id });
    }
  }

  return json(200, {
    ok: errors.length === 0,
    dry_run: false,
    run_id: runId,
    queued,
    errors,
  });
});
