// marketing-page-posts — publica e lista posts orgânicos da Página/Instagram do negócio,
// pelo Seialz, usando a conexão Meta canônica da org. Escopos: pages_manage_posts,
// instagram_content_publish (publicar); pages_read_engagement/user_content, instagram_basic
// (listar). Auth: x-sync-token OU JWT + membership. Escrita real na Graph API.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { facebookAppSecret, resolveConnectionToken } from "../_shared/meta/connection.ts";
import { metaGraphGet, metaGraphPost, MetaGraphError } from "../_shared/meta-graph.ts";

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

    // Auth: service token OU JWT + membership.
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

    // Conexão conectada + assets selecionados (Página/IG).
    const { data: c } = await admin.from("meta_connections").select("id")
      .eq("organization_id", organization_id).eq("status", "connected")
      .order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (!c) return json({ error: "no_connected_connection" }, 404);
    const connection_id = c.id;
    const { data: assets } = await admin.from("meta_assets")
      .select("external_id, asset_type").eq("connection_id", connection_id).eq("selection_state", "selected")
      .in("asset_type", ["page", "instagram_account"]);
    const pageId = assets?.find((a: any) => a.asset_type === "page")?.external_id as string | undefined;
    const igId = assets?.find((a: any) => a.asset_type === "instagram_account")?.external_id as string | undefined;

    const accessToken = await resolveConnectionToken(admin, connection_id);
    const appSecret = facebookAppSecret();

    // Page access token (necessário p/ escrever/ler no feed da Página).
    let pageToken: string | undefined;
    if (pageId) {
      try {
        const r = await metaGraphGet(`/${pageId}`, { fields: "access_token" }, { accessToken, appSecret });
        pageToken = r?.access_token;
      } catch { /* segue sem page token; erros aparecem por item */ }
    }

    if (action === "list") {
      const out: { facebook: any[]; instagram: any[] } = { facebook: [], instagram: [] };
      if (pageId && pageToken) {
        try {
          const r = await metaGraphGet(`/${pageId}/published_posts`,
            { fields: "message,created_time,permalink_url,full_picture", limit: 12 },
            { accessToken: pageToken, appSecret });
          out.facebook = (r?.data ?? []).map((p: any) => ({
            id: p.id, message: p.message ?? "", created_time: p.created_time,
            permalink: p.permalink_url, image: p.full_picture ?? null,
          }));
        } catch { /* ignora */ }
      }
      if (igId) {
        try {
          const r = await metaGraphGet(`/${igId}/media`,
            { fields: "caption,media_url,permalink,timestamp,media_type", limit: 12 },
            { accessToken, appSecret });
          out.instagram = (r?.data ?? []).map((m: any) => ({
            id: m.id, message: m.caption ?? "", created_time: m.timestamp,
            permalink: m.permalink, image: m.media_url ?? null, media_type: m.media_type,
          }));
        } catch { /* ignora */ }
      }
      return json({ ok: true, ...out });
    }

    if (action === "publish") {
      const message = String(body.message ?? "").trim();
      const image_url = String(body.image_url ?? "").trim();
      const targets: string[] = Array.isArray(body.targets) ? body.targets : [];
      if (!message && !image_url) return json({ error: "empty_content" }, 400);
      if (targets.length === 0) return json({ error: "no_targets" }, 400);

      const result: Record<string, { id?: string; permalink?: string; error?: string }> = {};

      if (targets.includes("facebook")) {
        if (!pageId || !pageToken) result.facebook = { error: "Página não conectada" };
        else {
          try {
            const r = image_url
              ? await metaGraphPost(`/${pageId}/photos`, { url: image_url, caption: message, published: true }, { accessToken: pageToken, appSecret })
              : await metaGraphPost(`/${pageId}/feed`, { message }, { accessToken: pageToken, appSecret });
            result.facebook = { id: r?.post_id ?? r?.id };
          } catch (e) { result.facebook = { error: errMsg(e) }; }
        }
      }

      if (targets.includes("instagram")) {
        if (!igId) result.instagram = { error: "Instagram não conectado" };
        else if (!image_url) result.instagram = { error: "Instagram exige uma imagem" };
        else {
          try {
            const container = await metaGraphPost(`/${igId}/media`, { image_url, caption: message }, { accessToken, appSecret });
            const creationId = container?.id;
            const pub = await metaGraphPost(`/${igId}/media_publish`, { creation_id: creationId }, { accessToken, appSecret });
            result.instagram = { id: pub?.id };
          } catch (e) { result.instagram = { error: errMsg(e) }; }
        }
      }

      const anyOk = Object.values(result).some((r) => r.id);
      return json({ ok: anyOk, result }, anyOk ? 200 : 502);
    }

    return json({ error: "unknown_action" }, 400);
  } catch (e) {
    return json({ error: (e as Error)?.message ?? "internal_error" }, 500);
  }
});
