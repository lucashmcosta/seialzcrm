// Purges audio_transcriptions older than each org's transcription_retention_days.

import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const WORKER_TOKEN = Deno.env.get("INTELLIGENCE_WORKER_TOKEN")!;

Deno.serve(async (req) => {
  if (req.headers.get("x-worker-token") !== WORKER_TOKEN) {
    return json({ error: "unauthorized" }, 401);
  }
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });

  const { data: orgs } = await admin
    .from("intelligence_settings")
    .select("organization_id, privacy");

  let deleted = 0;
  for (const o of orgs ?? []) {
    const days = Number(o.privacy?.transcription_retention_days ?? 180);
    if (days <= 0) continue;
    const cutoff = new Date(Date.now() - days * 86_400_000).toISOString();
    const { data: rows, error } = await admin
      .from("audio_transcriptions")
      .delete()
      .eq("organization_id", o.organization_id)
      .lt("created_at", cutoff)
      .select("id");
    if (error) continue;
    deleted += rows?.length ?? 0;
  }

  return json({ ok: true, deleted });
});

function json(b: unknown, status = 200) {
  return new Response(JSON.stringify(b), { status, headers: { "Content-Type": "application/json" } });
}
