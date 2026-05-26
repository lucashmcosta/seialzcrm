// Daily rollup:
// 1) Refresh opportunity_behavior_snapshot for opportunities updated/closed in the last 36h.
// 2) Aggregate seller_metrics_daily for yesterday.

import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const WORKER_TOKEN = Deno.env.get("INTELLIGENCE_WORKER_TOKEN")!;

Deno.serve(async (req) => {
  if (req.headers.get("x-worker-token") !== WORKER_TOKEN) {
    return json({ error: "unauthorized" }, 401);
  }
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });

  const since = new Date(Date.now() - 36 * 3600_000).toISOString();
  const { data: opps } = await admin
    .from("opportunities")
    .select("id, organization_id, contact_id, owner_user_id, status, updated_at, created_at")
    .gte("updated_at", since)
    .is("deleted_at", null)
    .limit(2000);

  let snapshots = 0;
  for (const opp of opps ?? []) {
    await refreshSnapshot(admin, opp);
    snapshots++;
  }

  // Yesterday seller metrics
  const y = new Date(Date.now() - 86_400_000);
  const day = y.toISOString().slice(0, 10);
  const dayStart = `${day}T00:00:00Z`;
  const dayEnd = `${day}T23:59:59Z`;

  const { data: rt } = await admin
    .from("message_response_times")
    .select("organization_id, user_id, response_seconds")
    .gte("outbound_at", dayStart).lte("outbound_at", dayEnd);

  const agg = new Map<string, { org: string; user: string; values: number[] }>();
  for (const r of rt ?? []) {
    if (!r.user_id) continue;
    const k = `${r.organization_id}:${r.user_id}`;
    if (!agg.has(k)) agg.set(k, { org: r.organization_id, user: r.user_id, values: [] });
    agg.get(k)!.values.push(r.response_seconds);
  }

  let smd = 0;
  for (const v of agg.values()) {
    v.values.sort((a, b) => a - b);
    const avg = v.values.reduce((s, n) => s + n, 0) / v.values.length;
    const median = v.values[Math.floor(v.values.length / 2)];
    await admin.from("seller_metrics_daily").upsert({
      organization_id: v.org,
      user_id: v.user,
      day,
      avg_response_seconds: Math.round(avg),
      median_response_seconds: Math.round(median),
    }, { onConflict: "organization_id,user_id,day" });
    smd++;
  }

  return json({ ok: true, snapshots, seller_metrics: smd });
});

async function refreshSnapshot(admin: any, opp: any) {
  // Counts from messages (via threads)
  const { data: threads } = await admin
    .from("message_threads").select("id").eq("opportunity_id", opp.id);
  const threadIds = (threads ?? []).map((t: any) => t.id);
  if (threadIds.length === 0) return;

  const { data: msgs } = await admin
    .from("messages")
    .select("direction, media_type, sent_at, created_at")
    .in("thread_id", threadIds);

  let inbound = 0, outbound = 0, audIn = 0, audOut = 0, docs = 0;
  let lastIn: string | null = null, lastOut: string | null = null;
  const hours: Record<string, number> = {};
  for (const m of msgs ?? []) {
    const at = m.sent_at ?? m.created_at;
    const h = at ? String(new Date(at).getUTCHours()) : "0";
    hours[h] = (hours[h] ?? 0) + 1;
    if (m.direction === "inbound") {
      inbound++;
      if (m.media_type === "audio") audIn++;
      if (!lastIn || at > lastIn) lastIn = at;
    } else if (m.direction === "outbound") {
      outbound++;
      if (m.media_type === "audio") audOut++;
      if (m.media_type === "document") docs++;
      if (!lastOut || at > lastOut) lastOut = at;
    }
  }

  // Events counts
  const { data: ev } = await admin
    .from("sales_events").select("event_type")
    .eq("opportunity_id", opp.id);
  const evCount = (t: string) => (ev ?? []).filter((e: any) => e.event_type === t).length;

  // Response times averages
  const { data: rtIn } = await admin
    .from("message_response_times").select("response_seconds")
    .eq("opportunity_id", opp.id);
  const sellerAvg = rtIn?.length
    ? Math.round(rtIn.reduce((s: number, r: any) => s + r.response_seconds, 0) / rtIn.length)
    : null;

  const won = opp.status === "won" ? opp.updated_at : null;
  const lost = opp.status === "lost" ? opp.updated_at : null;
  const days_to_close = won || lost
    ? Math.max(0, Math.round((+new Date(won ?? lost!) - +new Date(opp.created_at)) / 86_400_000))
    : null;

  await admin.from("opportunity_behavior_snapshot").upsert({
    opportunity_id: opp.id,
    organization_id: opp.organization_id,
    contact_id: opp.contact_id,
    user_id: opp.owner_user_id,
    final_status: opp.status,
    total_messages_inbound: inbound,
    total_messages_outbound: outbound,
    audios_inbound: audIn,
    audios_outbound: audOut,
    documents_sent: docs,
    sent_documents: docs > 0,
    objections_count: evCount("objection"),
    buying_signals_count: evCount("buying_signal"),
    asked_price: evCount("price_question") > 0,
    asked_deadline: evCount("deadline_question") > 0,
    hours_distribution: hours,
    avg_seller_response_seconds: sellerAvg,
    days_to_close,
    last_inbound_at: lastIn,
    last_outbound_at: lastOut,
    won_at: won,
    lost_at: lost,
    updated_at: new Date().toISOString(),
  }, { onConflict: "opportunity_id" });
}

function json(b: unknown, status = 200) {
  return new Response(JSON.stringify(b), { status, headers: { "Content-Type": "application/json" } });
}
