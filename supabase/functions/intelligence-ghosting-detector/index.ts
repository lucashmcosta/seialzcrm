// Detects ghosting: open deals with no inbound message in N days.
// Inserts sales_events { event_type: 'ghosting' }. Idempotent per opportunity per day.
// Triggered hourly via pg_cron.

import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const WORKER_TOKEN = Deno.env.get("INTELLIGENCE_WORKER_TOKEN")!;

Deno.serve(async (req) => {
  if (req.headers.get("x-worker-token") !== WORKER_TOKEN) {
    return json({ error: "unauthorized" }, 401);
  }
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });

  // Read settings for all orgs (small table) and bucket thresholds
  const { data: orgs } = await admin
    .from("intelligence_settings")
    .select("organization_id, behavior, privacy");
  if (!orgs?.length) return json({ ok: true, scanned: 0 });

  let inserted = 0;
  for (const o of orgs) {
    if (o.privacy?.org_opt_out) continue;
    if (!o.behavior?.detect_ghosting) continue;
    const days = Number(o.behavior?.ghosting_threshold_days ?? 4);
    const cutoff = new Date(Date.now() - days * 86_400_000).toISOString();
    const todayKey = new Date().toISOString().slice(0, 10);

    // Open deals where last_inbound_at < cutoff (or null + old created)
    const { data: deals } = await admin
      .from("opportunities")
      .select("id, contact_id, owner_user_id, updated_at")
      .eq("organization_id", o.organization_id)
      .eq("status", "open")
      .is("deleted_at", null)
      .limit(500);

    for (const d of deals ?? []) {
      // Latest inbound message tied to this opportunity (via thread)
      const { data: thr } = await admin
        .from("message_threads")
        .select("last_inbound_at")
        .eq("opportunity_id", d.id)
        .order("last_inbound_at", { ascending: false, nullsFirst: false })
        .limit(1).maybeSingle();
      const lastInbound = thr?.last_inbound_at;
      if (lastInbound && lastInbound > cutoff) continue;

      // Skip if we already flagged today
      const { data: dup } = await admin
        .from("sales_events")
        .select("id")
        .eq("opportunity_id", d.id)
        .eq("event_type", "ghosting")
        .gte("occurred_at", `${todayKey}T00:00:00Z`)
        .limit(1).maybeSingle();
      if (dup) continue;

      await admin.from("sales_events").insert({
        organization_id: o.organization_id,
        opportunity_id: d.id,
        contact_id: d.contact_id,
        user_id: d.owner_user_id,
        event_type: "ghosting",
        occurred_at: new Date().toISOString(),
        payload: { threshold_days: days, last_inbound_at: lastInbound ?? null },
      });
      inserted++;
    }
  }

  return json({ ok: true, inserted });
});

function json(b: unknown, status = 200) {
  return new Response(JSON.stringify(b), { status, headers: { "Content-Type": "application/json" } });
}
