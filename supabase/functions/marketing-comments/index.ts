// marketing-comments — lista e MODERA comentários dos posts orgânicos da Página/Instagram
// pelo Seialz. Escopos: pages_read_user_content + pages_manage_engagement (Facebook),
// instagram_manage_comments + instagram_manage_engagement (Instagram). Escrita real.
// Auth: x-sync-token OU JWT + membership.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { facebookAppSecret, resolveConnectionToken, resolveConnectionWithAsset } from "../_shared/meta/connection.ts";
import { metaGraphGet, metaGraphPost, metaGraphDelete, MetaGraphError } from "../_shared/meta-graph.ts";

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}
const errMsg = (e: unknown): string =>
  e instanceof MetaGraphError ? (e.error?.message || `Meta error ${e.status}`) : (e as Error)?.message || "erro";

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
    const pageId = resolved.assets["page"] as string | undefined;
    const igId = resolved.assets["instagram_account"] as string | undefined;

    const accessToken = await resolveConnectionToken(admin, connection_id);
    const appSecret = facebookAppSecret();
    let pageToken: string | undefined;
    if (pageId) {
      try {
        const r = await metaGraphGet(`/${pageId}`, { fields: "access_token" }, { accessToken, appSecret });
        pageToken = r?.access_token;
      } catch { /* segue */ }
    }

    if (action === "list") {
      const comments: any[] = [];
      // Facebook: posts recentes + comentários aninhados.
      if (pageId && pageToken) {
        try {
          const r = await metaGraphGet(`/${pageId}/feed`,
            { fields: "message,permalink_url,comments.limit(15){id,message,from,created_time,is_hidden}", limit: 10 },
            { accessToken: pageToken, appSecret });
          for (const post of r?.data ?? []) {
            for (const cm of post?.comments?.data ?? []) {
              comments.push({
                id: cm.id, platform: "facebook", text: cm.message ?? "",
                author: cm.from?.name ?? "", created_time: cm.created_time, is_hidden: !!cm.is_hidden,
                post_id: post.id, post_excerpt: (post.message ?? "").slice(0, 80), permalink: post.permalink_url,
              });
            }
          }
        } catch { /* ignora */ }
      }
      // Instagram: mídias recentes + comentários aninhados.
      if (igId) {
        try {
          const r = await metaGraphGet(`/${igId}/media`,
            { fields: "caption,permalink,comments.limit(15){id,text,username,timestamp}", limit: 10 },
            { accessToken, appSecret });
          for (const media of r?.data ?? []) {
            for (const cm of media?.comments?.data ?? []) {
              comments.push({
                id: cm.id, platform: "instagram", text: cm.text ?? "",
                author: cm.username ?? "", created_time: cm.timestamp, is_hidden: false,
                post_id: media.id, post_excerpt: (media.caption ?? "").slice(0, 80), permalink: media.permalink,
              });
            }
          }
        } catch { /* ignora */ }
      }
      comments.sort((a, b) => String(b.created_time).localeCompare(String(a.created_time)));
      return json({ ok: true, comments });
    }

    const comment_id = String(body.comment_id ?? "");
    const platform = String(body.platform ?? "facebook");
    if (action !== "list" && !comment_id) return json({ error: "missing_comment_id" }, 400);
    const igToken = accessToken; // IG usa o token do system user
    const fbToken = pageToken;

    if (action === "reply") {
      const message = String(body.message ?? "").trim();
      if (!message) return json({ error: "empty_reply" }, 400);
      try {
        const r = platform === "instagram"
          ? await metaGraphPost(`/${comment_id}/replies`, { message }, { accessToken: igToken, appSecret })
          : await metaGraphPost(`/${comment_id}/comments`, { message }, { accessToken: fbToken!, appSecret });
        return json({ ok: true, id: r?.id });
      } catch (e) { return json({ ok: false, error: errMsg(e) }, 502); }
    }

    if (action === "hide") { // Facebook only
      if (platform !== "facebook") return json({ error: "hide_only_facebook" }, 400);
      const hidden = body.hidden !== false;
      try {
        await metaGraphPost(`/${comment_id}`, { is_hidden: hidden }, { accessToken: fbToken!, appSecret });
        return json({ ok: true });
      } catch (e) { return json({ ok: false, error: errMsg(e) }, 502); }
    }

    if (action === "delete") {
      try {
        await metaGraphDelete(`/${comment_id}`, { accessToken: platform === "instagram" ? igToken : fbToken!, appSecret });
        return json({ ok: true });
      } catch (e) { return json({ ok: false, error: errMsg(e) }, 502); }
    }

    return json({ error: "unknown_action" }, 400);
  } catch (e) {
    return json({ error: (e as Error)?.message ?? "internal_error" }, 500);
  }
});
