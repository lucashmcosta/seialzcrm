// social-inbox — caixa de entrada de DMs do Instagram e Messenger do Facebook, pelo Seialz.
// Escopos: instagram_manage_messages (IG) e pages_messaging (Messenger — pode não estar
// concedido ainda). Independente da caixa Comercial (WhatsApp). Escrita real (responder).
// Auth: x-sync-token OU JWT + membership.
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
    const action = String(body.action ?? "conversations");
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

    const { data: c } = await admin.from("meta_connections").select("id")
      .eq("organization_id", organization_id).eq("status", "connected")
      .order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (!c) return json({ error: "no_connected_connection" }, 404);
    const connection_id = c.id;
    const { data: assets } = await admin.from("meta_assets")
      .select("external_id, asset_type").eq("connection_id", connection_id).eq("selection_state", "selected")
      .in("asset_type", ["page"]);
    const pageId = assets?.find((a: any) => a.asset_type === "page")?.external_id as string | undefined;
    if (!pageId) return json({ error: "no_page" }, 404);

    const accessToken = await resolveConnectionToken(admin, connection_id);
    const appSecret = facebookAppSecret();
    let pageToken: string | undefined;
    try {
      const r = await metaGraphGet(`/${pageId}`, { fields: "access_token" }, { accessToken, appSecret });
      pageToken = r?.access_token;
    } catch { /* segue */ }
    if (!pageToken) return json({ error: "no_page_token" }, 400);

    // Lista conversas de um canal (instagram|messenger); erros por canal não derrubam o outro.
    async function listConversations(platform: "instagram" | "messenger") {
      const params: Record<string, string | number> = {
        fields: "id,updated_time,participants,messages.limit(1){message,from,created_time}",
        limit: 25,
      };
      if (platform === "instagram") params.platform = "instagram";
      const r = await metaGraphGet(`/${pageId}/conversations`, params, { accessToken: pageToken!, appSecret });
      return (r?.data ?? []).map((cv: any) => {
        const parts = (cv.participants?.data ?? []).filter((p: any) => String(p.id) !== String(pageId));
        const other = parts[0] ?? {};
        const last = (cv.messages?.data ?? [])[0];
        return {
          id: cv.id, platform,
          participant_id: other.id ?? "",
          name: other.name || other.username || "Contato",
          updated_time: cv.updated_time,
          last_message: last?.message ?? "",
        };
      });
    }

    if (action === "conversations") {
      const out: any[] = [];
      const channels: Record<string, string | null> = {};
      for (const platform of ["instagram", "messenger"] as const) {
        try { out.push(...await listConversations(platform)); channels[platform] = null; }
        catch (e) { channels[platform] = errMsg(e); }
      }
      out.sort((a, b) => String(b.updated_time).localeCompare(String(a.updated_time)));
      return json({ ok: true, conversations: out, channels });
    }

    if (action === "messages") {
      const conversation_id = String(body.conversation_id ?? "");
      if (!conversation_id) return json({ error: "missing_conversation_id" }, 400);
      try {
        const r = await metaGraphGet(`/${conversation_id}`,
          { fields: "messages.limit(30){id,message,from,created_time}" },
          { accessToken: pageToken, appSecret });
        const msgs = (r?.messages?.data ?? []).map((m: any) => ({
          id: m.id, text: m.message ?? "", from_page: String(m.from?.id) === String(pageId),
          from_name: m.from?.name || m.from?.username || "", created_time: m.created_time,
        })).reverse();
        return json({ ok: true, messages: msgs });
      } catch (e) { return json({ ok: false, error: errMsg(e) }, 502); }
    }

    if (action === "send") {
      const recipient_id = String(body.recipient_id ?? "");
      const text = String(body.text ?? "").trim();
      const platform = String(body.platform ?? "messenger");
      if (!recipient_id || !text) return json({ error: "missing_fields" }, 400);
      try {
        const payload: Record<string, string> = {
          recipient: JSON.stringify({ id: recipient_id }),
          message: JSON.stringify({ text }),
          messaging_type: "RESPONSE",
        };
        const r = await metaGraphPost(`/${pageId}/messages`, payload, { accessToken: pageToken, appSecret });
        return json({ ok: true, id: r?.message_id, platform });
      } catch (e) { return json({ ok: false, error: errMsg(e) }, 502); }
    }

    return json({ error: "unknown_action" }, 400);
  } catch (e) {
    return json({ error: (e as Error)?.message ?? "internal_error" }, 500);
  }
});
