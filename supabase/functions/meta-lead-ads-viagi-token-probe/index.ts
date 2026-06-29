// Disposable probe: tests whether Viagi's saved Meta Lead Ads System User token
// can be reused to reissue the Page Access Token, before asking for any new token.
//
// MODES:
//   { mode: "probe" }                                            -> read-only, no writes
//   { mode: "repair", confirm_token: "VIAGI_PAT_REISSUE_2026_06_29" }
//       -> writes new Page Access Token if reissue succeeds (NOT used yet — awaiting approval)
//
// Auth: service-role only. Hardcoded to Viagi org/integration/page. Delete after run.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { decryptSecret, encryptSecret } from "../_shared/crypto.ts";
import { metaGraphGet, MetaGraphError } from "../_shared/meta-graph.ts";
import { validateServiceRoleAuth } from "../_shared/auth.ts";

async function isAdminCaller(req: Request, admin: ReturnType<typeof createClient>): Promise<{ ok: boolean; reason?: string }> {
  // Accept either service_role JWT or an authenticated admin user.
  const sr = validateServiceRoleAuth(req);
  if (sr.ok) return { ok: true };
  const authHeader = req.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) return { ok: false, reason: "missing bearer" };
  const token = authHeader.replace("Bearer ", "").trim();
  try {
    const { data, error } = await (admin as any).auth.getUser(token);
    if (error || !data?.user) return { ok: false, reason: "invalid user token" };
    const userId = data.user.id;
    const { data: au } = await admin
      .from("admin_users")
      .select("id, is_active")
      .eq("auth_user_id", userId)
      .maybeSingle();
    if (au && (au as any).is_active !== false) return { ok: true };
    return { ok: false, reason: "not an active admin" };
  } catch (e) {
    return { ok: false, reason: (e as Error).message };
  }
}

const ORG_ID = "b246ef6f-6242-4011-a112-6d8783d2896a";
const ORG_INTEGRATION_ID = "e88cb37b-33c9-4802-a3d0-f99d611753f8";
const PAGE_ROW_ID = "1c11568d-fd83-4d5a-8dfe-86aa4588ce00";
const META_PAGE_ID = "713236591874041";
const REPAIR_CONFIRM = "VIAGI_PAT_REISSUE_2026_06_29";

const REQUIRED_SCOPES = [
  "pages_show_list",
  "pages_read_engagement",
  "pages_manage_metadata",
  "leads_retrieval",
  "ads_management",
  "business_management",
];

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function mask(s: string | null | undefined): string | null {
  if (!s) return null;
  if (s.length <= 12) return `${s.slice(0, 2)}***(len=${s.length})`;
  return `${s.slice(0, 6)}...${s.slice(-4)} (len=${s.length})`;
}

function describeMetaError(e: unknown) {
  if (e instanceof MetaGraphError) {
    return {
      status: e.status,
      code: e.error.code,
      subcode: e.error.error_subcode,
      type: e.error.type,
      message: e.error.message,
      fbtrace_id: e.error.fbtrace_id,
    };
  }
  return { message: (e as Error)?.message || String(e) };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const auth = await isAdminCaller(req, admin);
  if (!auth.ok) return json({ error: "Unauthorized", details: auth.reason }, 401);

  let body: any = {};
  try { body = await req.json(); } catch { /* ok */ }
  const mode: "probe" | "repair" = body?.mode === "repair" ? "repair" : "probe";
  if (mode === "repair" && body?.confirm_token !== REPAIR_CONFIRM) {
    return json({ error: `repair requires confirm_token="${REPAIR_CONFIRM}"` }, 400);
  }

  const out: any = {
    mode,
    org_id: ORG_ID,
    integration_id: ORG_INTEGRATION_ID,
    page_row_id: PAGE_ROW_ID,
    meta_page_id: META_PAGE_ID,
    steps: {},
    writes: { performed: false },
    next_step: null,
  };

  // 1) Load integration row
  const { data: oi, error: oiErr } = await admin
    .from("organization_integrations")
    .select("id, connected_account")
    .eq("id", ORG_INTEGRATION_ID)
    .maybeSingle();
  if (oiErr || !oi) {
    out.steps.load_integration = { ok: false, error: oiErr?.message || "not_found" };
    out.next_step = "abort: integration row missing";
    return json(out, 500);
  }
  const ca: any = oi.connected_account || {};
  out.steps.load_integration = {
    ok: true,
    has_system_user_token_encrypted: !!ca.system_user_token_encrypted,
    has_app_secret_encrypted: !!ca.app_secret_encrypted,
    app_id: ca.app_id ?? null,
    business_id: ca.business_id ?? null,
    meta_user_id: ca.meta_user_id ?? null,
    meta_user_name: ca.meta_user_name ?? null,
    status: ca.status ?? null,
    last_token_check_at: ca.last_token_check_at ?? null,
    last_token_check_error: ca.last_token_check_error ?? null,
  };

  if (!ca.system_user_token_encrypted) {
    out.next_step = "ask_for_reconnect: no system_user_token_encrypted saved";
    return json(out);
  }

  // 2) Decrypt SU token
  let suToken: string;
  let appSecret: string | undefined;
  try {
    suToken = await decryptSecret(ca.system_user_token_encrypted);
    out.steps.decrypt_system_user = { ok: true, token_preview: mask(suToken) };
  } catch (e) {
    out.steps.decrypt_system_user = { ok: false, error: (e as Error).message };
    out.next_step = "ask_for_reconnect: system_user_token cannot be decrypted with current META_TOKEN_ENCRYPTION_KEY";
    return json(out);
  }
  try {
    if (ca.app_secret_encrypted) appSecret = await decryptSecret(ca.app_secret_encrypted);
    out.steps.decrypt_app_secret = { ok: true, present: !!appSecret };
  } catch (e) {
    out.steps.decrypt_app_secret = { ok: false, error: (e as Error).message };
    appSecret = undefined;
  }

  // 3) /me
  try {
    const me = await metaGraphGet("/me", { fields: "id,name" }, { accessToken: suToken, appSecret });
    out.steps.graph_me = { ok: true, id: me.id, name: me.name };
  } catch (e) {
    out.steps.graph_me = { ok: false, error: describeMetaError(e) };
    out.next_step = "ask_for_reconnect: System User token rejected by Graph /me";
    return json(out);
  }

  // 4) /me/permissions
  try {
    const perms = await metaGraphGet("/me/permissions", {}, { accessToken: suToken, appSecret });
    const granted = (perms.data || [])
      .filter((p: any) => p.status === "granted")
      .map((p: any) => p.permission);
    const declined = (perms.data || [])
      .filter((p: any) => p.status !== "granted")
      .map((p: any) => ({ permission: p.permission, status: p.status }));
    out.steps.graph_me_permissions = {
      ok: true,
      granted_count: granted.length,
      granted,
      declined,
      missing_required: REQUIRED_SCOPES.filter((s) => !granted.includes(s)),
    };
  } catch (e) {
    out.steps.graph_me_permissions = { ok: false, error: describeMetaError(e) };
  }

  // 5) Page reissue attempt
  try {
    const owned = await metaGraphGet(
      `/${META_PAGE_ID}`,
      { fields: "id,name,tasks,access_token" },
      { accessToken: suToken, appSecret },
    );
    out.steps.graph_page = {
      ok: true,
      page_id: owned.id,
      page_name: owned.name,
      tasks: owned.tasks ?? null,
      page_access_token_returned: !!owned.access_token,
      page_access_token_preview: mask(owned.access_token),
    };

    if (owned.access_token) {
      // 6) Smoketest forms (read-only)
      const { data: forms } = await admin
        .from("lead_forms")
        .select("id, provider_form_id, provider_form_name")
        .eq("organization_id", ORG_ID)
        .eq("provider", "meta_lead_ads");
      const formResults: any[] = [];
      for (const f of forms || []) {
        try {
          const fr = await metaGraphGet(
            `/${f.provider_form_id}`,
            { fields: "id,name,status,leads_count" },
            { accessToken: owned.access_token, appSecret },
          );
          formResults.push({ form_id: f.provider_form_id, ok: true, name: fr.name, status: fr.status, leads_count: fr.leads_count });
        } catch (e) {
          formResults.push({ form_id: f.provider_form_id, ok: false, error: describeMetaError(e) });
        }
      }
      out.steps.graph_forms_smoketest = { ok: true, results: formResults };

      if (mode === "repair") {
        const newPatEncrypted = await encryptSecret(owned.access_token);
        const upd1 = await admin
          .from("meta_lead_pages")
          .update({
            page_access_token_encrypted: newPatEncrypted,
            last_health_check_status: "ok",
            last_health_check_error: null,
            last_health_check_at: new Date().toISOString(),
          })
          .eq("id", PAGE_ROW_ID);
        const newCa = {
          ...ca,
          status: "connected",
          last_token_check_at: new Date().toISOString(),
          last_token_check_error: null,
        };
        const upd2 = await admin
          .from("organization_integrations")
          .update({ connected_account: newCa })
          .eq("id", ORG_INTEGRATION_ID);
        const okForms = formResults.filter((r) => r.ok).map((r) => r.form_id);
        let resetCount = 0;
        if (okForms.length) {
          const { data: reset } = await admin
            .from("lead_forms")
            .update({ consecutive_errors: 0, last_sync_status: "success", last_sync_error: null })
            .eq("organization_id", ORG_ID)
            .eq("provider", "meta_lead_ads")
            .in("provider_form_id", okForms)
            .select("id");
          resetCount = (reset || []).length;
        }
        out.writes = {
          performed: true,
          meta_lead_pages_update_error: upd1.error?.message ?? null,
          organization_integrations_update_error: upd2.error?.message ?? null,
          forms_reset_count: resetCount,
        };
        out.next_step = "run recovery in mode=count for both forms";
      } else {
        out.next_step = "approve repair to persist new PAT";
      }
    } else {
      out.next_step = "graph_page returned no access_token — check System User page-level access in Business Manager";
    }
  } catch (e) {
    out.steps.graph_page = { ok: false, error: describeMetaError(e) };
    out.next_step =
      "fix Business Manager: assign Página Viagi (713236591874041) to this System User with full 'Manage Page' access, OR re-authorize app with missing scopes — DO NOT request new token yet";
  }

  return json(out);
});
