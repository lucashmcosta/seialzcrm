// marketing-page-webhooks — mostra e gerencia as assinaturas de webhook da Página do
// negócio (subscribed_apps) pelo Seialz. Escopo: pages_manage_metadata. Escrita real.
// Auth: x-sync-token OU JWT + membership.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { facebookAppSecret, resolveConnectionToken, resolveConnectionWithAsset } from "../_shared/meta/connection.ts";
import { metaGraphGet, metaGraphPost, MetaGraphError } from "../_shared/meta-graph.ts";

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}
const errMsg = (e: unknown): string =>
  e instanceof MetaGraphError ? (e.error?.message || `Meta error ${e.status}`) : (e as Error)?.message || "erro";

// Campos que o Seialz assina para receber eventos da Página em tempo real.
const DEFAULT_FIELDS = "feed,mention,messages,messaging_postbacks,message_reactions";

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const body = await req.json().catch(() => ({}));
    const organization_id = String(body.organization_id ?? "");
    const action = String(body.action ?? "list");
    if (!organization_id) return json({ error: "missing_organization_id" }, 400);

    const svcToken = req.headers.get("x-sync-token");
    const serviceMode = Boolean(svcToken && svcToken === Deno.env.get("META_SYNC_TRIGGER_TOKEN"));
    if (!serviceMode) {
      const authHeader = req.headers.get("Authorization");
      if (!authHeader?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);
      const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!,
        { global: { headers: { Authorization: authHeader } } });
      const { data: claims, error } = await supabase.auth.getClaims(authHeader.replace("Bearer ", ""));
      if (error || !claims?.claims) return json({ error: "Unauthorized" }, 401);
      const { data: user } = await admin.from("users").select("id").eq("auth_user_id", claims.claims.sub).maybeSingle();
      if (!user) return json({ error: "user_not_found" }, 403);
      const { data: m } = await admin.from("user_organizations").select("id")
        .eq("user_id", user.id).eq("organization_id", organization_id).maybeSingle();
      if (!m) return json({ error: "forbidden_org" }, 403);
    }

    const resolved = await resolveConnectionWithAsset(admin, organization_id, "page");
    if (!resolved) return json({ error: "no_page" }, 404);
    const connection_id = resolved.connection_id;
    const pageId = resolved.assets["page"] as string;

    const accessToken = await resolveConnectionToken(admin, connection_id);
    const appSecret = facebookAppSecret();
    let pageToken: string | undefined;
    try {
      const r = await metaGraphGet(`/${pageId}`, { fields: "access_token,name" }, { accessToken, appSecret });
      pageToken = r?.access_token;
    } catch { /* segue */ }
    if (!pageToken) return json({ error: "no_page_token" }, 400);

    if (action === "list") {
      try {
        const r = await metaGraphGet(`/${pageId}/subscribed_apps`, { fields: "subscribed_fields" }, { accessToken: pageToken, appSecret });
        const app = (r?.data ?? [])[0];
        const fields: string[] = app?.subscribed_fields ?? [];
        return json({ ok: true, subscribed: fields.length > 0, fields });
      } catch (e) { return json({ ok: false, error: errMsg(e) }, 502); }
    }

    if (action === "subscribe") {
      const subscribed_fields = String(body.fields ?? DEFAULT_FIELDS);
      try {
        await metaGraphPost(`/${pageId}/subscribed_apps`, { subscribed_fields }, { accessToken: pageToken, appSecret });
        return json({ ok: true, fields: subscribed_fields.split(",") });
      } catch (e) { return json({ ok: false, error: errMsg(e) }, 502); }
    }

    return json({ error: "unknown_action" }, 400);
  } catch (e) {
    return json({ error: (e as Error)?.message ?? "internal_error" }, 500);
  }
});
