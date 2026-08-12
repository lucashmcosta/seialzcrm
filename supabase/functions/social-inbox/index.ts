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

// Normaliza os anexos de uma mensagem (imagem/vídeo/áudio/arquivo/compartilhamento)
// num formato simples pro front: { type, url, name?, mime? }.
type SocialAttachment = { type: "image" | "video" | "audio" | "file" | "share"; url: string; name?: string; mime?: string };
function mapAttachments(m: any): SocialAttachment[] {
  const out: SocialAttachment[] = [];
  for (const a of m?.attachments?.data ?? []) {
    const mime: string = a.mime_type || "";
    const imgUrl = a.image_data?.url;
    const vidUrl = a.video_data?.url;
    if (imgUrl) out.push({ type: "image", url: imgUrl, name: a.name, mime });
    else if (vidUrl) out.push({ type: "video", url: vidUrl, name: a.name, mime });
    else if (a.file_url) {
      const type = mime.startsWith("audio") ? "audio" : mime.startsWith("video") ? "video" : mime.startsWith("image") ? "image" : "file";
      out.push({ type, url: a.file_url, name: a.name, mime });
    }
  }
  for (const s of m?.shares?.data ?? []) {
    if (s.link) out.push({ type: "share", url: s.link, name: s.name });
  }
  return out;
}

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

    // Pode haver mais de uma conexão 'connected' (ex.: re-auth incompleta sem
    // assets). Escolhemos a conexão mais recente que TENHA uma página selecionada
    // — não a mais recente em absoluto — para não cair numa conexão vazia.
    const { data: conns } = await admin.from("meta_connections").select("id")
      .eq("organization_id", organization_id).eq("status", "connected")
      .order("created_at", { ascending: false });
    if (!conns?.length) return json({ error: "no_connected_connection" }, 404);
    let connection_id: string | undefined;
    let pageId: string | undefined;
    for (const cand of conns) {
      const { data: a } = await admin.from("meta_assets")
        .select("external_id").eq("connection_id", cand.id).eq("selection_state", "selected")
        .eq("asset_type", "page").limit(1).maybeSingle();
      if (a?.external_id) { connection_id = cand.id; pageId = a.external_id; break; }
    }
    if (!connection_id || !pageId) return json({ error: "no_page" }, 404);

    // Nas conversas do Instagram, "nós" somos identificados pelo id da CONTA do
    // Instagram (não pelo id da Página do Facebook). Precisamos dele para (a) não
    // nos escolhermos como destinatário e (b) marcar corretamente as nossas mensagens.
    const { data: igAsset } = await admin.from("meta_assets")
      .select("external_id").eq("connection_id", connection_id).eq("selection_state", "selected")
      .eq("asset_type", "instagram_account").limit(1).maybeSingle();
    const igId = igAsset?.external_id as string | undefined;
    const selfIds = new Set([String(pageId), ...(igId ? [String(igId)] : [])]);

    const accessToken = await resolveConnectionToken(admin, connection_id);
    const appSecret = facebookAppSecret();
    let pageToken: string | undefined;
    try {
      const r = await metaGraphGet(`/${pageId}`, { fields: "access_token" }, { accessToken, appSecret });
      pageToken = r?.access_token;
    } catch { /* segue */ }
    if (!pageToken) return json({ error: "no_page_token" }, 400);

    // Lista conversas de um canal (instagram|messenger); erros por canal não derrubam o outro.
    // O endpoint platform=instagram é bem mais sensível ao volume de dados que o
    // Messenger: com fields pesados + limit alto retorna "reduce the amount of data".
    // Por isso o IG usa fields enxutos e limit menor.
    async function listConversations(platform: "instagram" | "messenger") {
      const params: Record<string, string | number> = platform === "instagram"
        ? { fields: "id,updated_time,participants,messages.limit(1){message}", platform: "instagram", limit: 10 }
        : { fields: "id,updated_time,participants,messages.limit(1){message,from,created_time}", limit: 25 };
      const r = await metaGraphGet(`/${pageId}/conversations`, params, { accessToken: pageToken!, appSecret });
      return (r?.data ?? []).map((cv: any) => {
        const parts = (cv.participants?.data ?? []).filter((p: any) => !selfIds.has(String(p.id)));
        const other = parts[0] ?? {};
        const last = (cv.messages?.data ?? [])[0];
        const username = other.username as string | undefined;
        return {
          id: cv.id, platform,
          participant_id: other.id ?? "",
          name: other.name || username || "Contato",
          username: username ?? null,
          avatar_url: null as string | null,
          // Instagram expõe link público por username; Facebook/Messenger não expõe
          // URL pública por PSID, então fica null.
          profile_link: platform === "instagram" && username ? `https://instagram.com/${username}` : null,
          updated_time: cv.updated_time,
          last_message: last?.message ?? "",
        };
      });
    }

    if (action === "profile") {
      // Perfil do contato de uma conversa aberta (1 chamada, sob demanda).
      // Instagram (User Profile API): foto, followers, verificado, follow status.
      // Messenger: foto/nome exigem a feature "Business Asset User Profile Access"
      // (Advanced Access via App Review) — sem ela, retorna null sem quebrar.
      const participant_id = String(body.participant_id ?? "");
      const platform = String(body.platform ?? "");
      if (!participant_id) return json({ error: "missing_participant_id" }, 400);
      try {
        if (platform === "instagram") {
          const r = await metaGraphGet(`/${participant_id}`,
            { fields: "name,username,profile_pic,follower_count,is_verified_user,is_user_follow_business,is_business_follow_user" },
            { accessToken: pageToken, appSecret });
          return json({ ok: true, profile: {
            name: r?.name ?? null, username: r?.username ?? null, avatar_url: r?.profile_pic ?? null,
            follower_count: r?.follower_count ?? null, is_verified: !!r?.is_verified_user,
            follows_us: !!r?.is_user_follow_business, we_follow: !!r?.is_business_follow_user,
            profile_link: r?.username ? `https://instagram.com/${r.username}` : null,
          } });
        }
        // messenger
        const r = await metaGraphGet(`/${participant_id}`,
          { fields: "first_name,last_name,name,profile_pic" }, { accessToken: pageToken, appSecret });
        return json({ ok: true, profile: {
          name: r?.name || [r?.first_name, r?.last_name].filter(Boolean).join(" ") || null,
          avatar_url: r?.profile_pic ?? null, profile_link: null,
        } });
      } catch (e) {
        // perfil indisponível (ex.: feature não aprovada) não é erro fatal
        return json({ ok: true, profile: null, note: errMsg(e) });
      }
    }

    if (action === "conversations") {
      const out: any[] = [];
      const channels: Record<string, string | null> = {};
      for (const platform of ["instagram", "messenger"] as const) {
        try { out.push(...await listConversations(platform)); channels[platform] = null; }
        catch (e) { channels[platform] = errMsg(e); }
      }
      out.sort((a, b) => String(b.updated_time).localeCompare(String(a.updated_time)));

      // Enriquece conversas do Instagram com foto + nome real do contato
      // (User Profile API, em paralelo, com teto). Messenger não tem foto via API
      // sem a feature "Business Asset User Profile Access" — fica com nome+iniciais.
      const igToEnrich = out.filter((c) => c.platform === "instagram" && c.participant_id).slice(0, 20);
      await Promise.all(igToEnrich.map(async (c) => {
        try {
          const p = await metaGraphGet(`/${c.participant_id}`,
            { fields: "name,username,profile_pic" }, { accessToken: pageToken, appSecret });
          if (p?.profile_pic) c.avatar_url = p.profile_pic;
          if (p?.name) c.name = p.name;        // nome real no lugar do username
          if (p?.username) c.username = p.username;
        } catch { /* mantém fallback (username/iniciais) */ }
      }));

      return json({ ok: true, conversations: out, channels });
    }

    if (action === "messages") {
      const conversation_id = String(body.conversation_id ?? "");
      if (!conversation_id) return json({ error: "missing_conversation_id" }, 400);
      try {
        const r = await metaGraphGet(`/${conversation_id}`,
          { fields: "messages.limit(30){id,message,from,created_time,attachments{id,mime_type,name,image_data,video_data,file_url},shares{link,name}}" },
          { accessToken: pageToken, appSecret });
        const msgs = (r?.messages?.data ?? []).map((m: any) => ({
          id: m.id, text: m.message ?? "", from_page: selfIds.has(String(m.from?.id)),
          from_name: m.from?.name || m.from?.username || "", created_time: m.created_time,
          attachments: mapAttachments(m),
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
