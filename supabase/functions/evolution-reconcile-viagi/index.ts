// TEMPORARY reconciliation function — pilot Viagi only.
// Auth: header `x-reconcile-token` must equal EVOLUTION_WEBHOOK_SECRET.
// Behavior (single-shot):
//   1. Load evolution_instances row for pilot (by id).
//   2. Call Evolution /instance/fetchInstances (no filter).
//   3. Locate `dev-int`. Optionally verify collisions across other rows.
//   4. If dry_run=false, update the row with real name/id/state/owner.
// No creates. No deletes. No writes to any other table.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-reconcile-token",
};

const VIAGI_ROW_ID = "042018fe-41b9-4c45-b140-d9f149e7fd56";
const TARGET_INSTANCE = "dev-int";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  const token = req.headers.get("x-reconcile-token") ?? "";
  const expected = Deno.env.get("RECONCILE_VIAGI_TOKEN") ?? "";
  if (!token || token !== expected) {
    return new Response(JSON.stringify({ error: "UNAUTHORIZED" }), {
      status: 401,
      headers: { ...corsHeaders, "content-type": "application/json" },
    });
  }

  let body: { dry_run?: boolean } = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }
  const dryRun = body.dry_run !== false; // default DRY RUN

  const baseUrl = (Deno.env.get("EVOLUTION_BASE_URL") ?? "").trim().replace(
    /\/+$/,
    "",
  );
  const apiKey = Deno.env.get("EVOLUTION_GLOBAL_API_KEY") ?? "";
  if (!baseUrl || !apiKey) {
    return new Response(
      JSON.stringify({ error: "MISSING_SECRET" }),
      { status: 503, headers: { ...corsHeaders, "content-type": "application/json" } },
    );
  }

  const service = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // 1. Current row
  const { data: before, error: beforeErr } = await service
    .from("evolution_instances")
    .select("*")
    .eq("id", VIAGI_ROW_ID)
    .maybeSingle();
  if (beforeErr || !before) {
    return new Response(
      JSON.stringify({ error: "ROW_NOT_FOUND", details: beforeErr }),
      { status: 404, headers: { ...corsHeaders, "content-type": "application/json" } },
    );
  }

  // 2. Fetch all instances from Evolution
  const res = await fetch(`${baseUrl}/instance/fetchInstances`, {
    headers: { apikey: apiKey, "content-type": "application/json" },
  });
  const text = await res.text();
  let list: unknown = null;
  try {
    list = JSON.parse(text);
  } catch {
    list = text;
  }
  if (!res.ok || !Array.isArray(list)) {
    return new Response(
      JSON.stringify({
        error: "UPSTREAM_ERROR",
        status: res.status,
        body: list,
      }),
      { status: 502, headers: { ...corsHeaders, "content-type": "application/json" } },
    );
  }

  const summary = (list as Array<Record<string, unknown>>).map((i) => ({
    id: i.id,
    name: i.name,
    connectionStatus: i.connectionStatus,
    number: i.number,
    ownerJid: i.ownerJid,
    profileName: i.profileName,
    integration: i.integration,
  }));

  const target = summary.find((i) => i.name === TARGET_INSTANCE);
  if (!target) {
    return new Response(
      JSON.stringify({
        error: "TARGET_NOT_FOUND",
        target: TARGET_INSTANCE,
        instances: summary,
      }),
      { status: 404, headers: { ...corsHeaders, "content-type": "application/json" } },
    );
  }

  // 3. Collision check: no other evolution_instances row uses dev-int or
  //    its remote id.
  const { data: collisions } = await service
    .from("evolution_instances")
    .select("id, organization_id, endpoint_id, instance_name, instance_id_remote")
    .or(
      `instance_name.eq.${TARGET_INSTANCE},instance_id_remote.eq.${
        String(target.id)
      }`,
    );
  const externalCollisions = (collisions ?? []).filter((c) =>
    c.id !== VIAGI_ROW_ID
  );

  const proposed = {
    instance_name: TARGET_INSTANCE,
    instance_id_remote: String(target.id),
    last_known_state: String(target.connectionStatus ?? "unknown"),
    last_state_checked_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  let after: unknown = null;
  if (!dryRun && externalCollisions.length === 0) {
    const { data: updated, error: updErr } = await service
      .from("evolution_instances")
      .update(proposed)
      .eq("id", VIAGI_ROW_ID)
      .select("*")
      .maybeSingle();
    if (updErr) {
      return new Response(
        JSON.stringify({ error: "UPDATE_FAILED", details: updErr }),
        { status: 500, headers: { ...corsHeaders, "content-type": "application/json" } },
      );
    }
    after = updated;
  }

  return new Response(
    JSON.stringify({
      dry_run: dryRun,
      before,
      evolution_target: target,
      evolution_all: summary,
      collisions: externalCollisions,
      proposed,
      after,
    }, null, 2),
    { status: 200, headers: { ...corsHeaders, "content-type": "application/json" } },
  );
});
