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

// Cache do page token por isolate (chave = pageId). Evita 1 chamada Graph por request.
const pageTokenCache = new Map<string, { token: string; exp: number }>();

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

    const appSecret = facebookAppSecret();
    // Cache do page token por isolate (evita 1 chamada Graph por request — vale p/
    // todas as actions). O token de página derivado do system user é estável.
    let pageToken: string | undefined = pageTokenCache.get(pageId)?.token;
    if (pageToken && (pageTokenCache.get(pageId)!.exp < Date.now())) pageToken = undefined;
    if (!pageToken) {
      const accessToken = await resolveConnectionToken(admin, connection_id);
      try {
        const r = await metaGraphGet(`/${pageId}`, { fields: "access_token" }, { accessToken, appSecret });
        pageToken = r?.access_token;
        if (pageToken) pageTokenCache.set(pageId, { token: pageToken, exp: Date.now() + 10 * 60_000 });
      } catch { /* segue */ }
    }
    if (!pageToken) return json({ error: "no_page_token" }, 400);

    // Lista conversas de um canal (instagram|messenger); erros por canal não derrubam o outro.
    // O endpoint platform=instagram é bem mais sensível ao volume de dados que o
    // Messenger: com fields pesados + limit alto retorna "reduce the amount of data".
    // Por isso o IG usa fields enxutos e limit menor.
    async function listConversations(platform: "instagram" | "messenger") {
      // Payload enxuto nos dois canais (a lista só precisa de nome + última msg + hora).
      const params: Record<string, string | number> = platform === "instagram"
        ? { fields: "id,updated_time,participants,messages.limit(1){message}", platform: "instagram", limit: 10 }
        : { fields: "id,updated_time,participants,messages.limit(1){message}", limit: 20 };
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

    // ---- Store (stale-while-revalidate): serve do banco e atualiza por trás ----
    const bg = (p: Promise<unknown>) => {
      const rt = (globalThis as any).EdgeRuntime;
      if (rt?.waitUntil) rt.waitUntil(p.catch(() => {})); else p.catch(() => {});
    };
    async function fetchAndEnrich(wanted: ("instagram" | "messenger")[]) {
      const channels: Record<string, string | null> = {};
      const perChannel = await Promise.all(wanted.map(async (platform) => {
        try { const r = await listConversations(platform); channels[platform] = null; return r; }
        catch (e) { channels[platform] = errMsg(e); return []; }
      }));
      const out = perChannel.flat();
      out.sort((a, b) => String(b.updated_time).localeCompare(String(a.updated_time)));
      const igToEnrich = out.filter((c) => c.platform === "instagram" && c.participant_id).slice(0, 20);
      await Promise.all(igToEnrich.map(async (c) => {
        try {
          const p = await metaGraphGet(`/${c.participant_id}`, { fields: "name,username,profile_pic" }, { accessToken: pageToken, appSecret });
          if (p?.profile_pic) c.avatar_url = p.profile_pic;
          if (p?.name) c.name = p.name;
          if (p?.username) c.username = p.username;
        } catch { /* mantém fallback */ }
      }));
      return { out, channels };
    }
    async function upsertConversations(convs: any[]) {
      const rows = convs.filter((c) => c.participant_id).map((c) => ({
        organization_id, platform: c.platform, participant_id: String(c.participant_id),
        conversation_id: c.id ?? null, name: c.name ?? null, username: c.username ?? null,
        avatar_url: c.avatar_url ?? null, profile_link: c.profile_link ?? null,
        last_message: c.last_message ?? "", updated_time: c.updated_time ?? null,
        refreshed_at: new Date().toISOString(),
      }));
      if (rows.length) await admin.from("social_conversations").upsert(rows, { onConflict: "organization_id,platform,participant_id" });
    }
    async function liveFetchMessages(conversation_id: string) {
      const r = await metaGraphGet(`/${conversation_id}`,
        { fields: "messages.limit(30){id,message,from,created_time,attachments{id,mime_type,name,image_data,video_data,file_url},shares{link,name}}" },
        { accessToken: pageToken, appSecret });
      return (r?.messages?.data ?? []).map((m: any) => ({
        id: m.id, text: m.message ?? "", from_page: selfIds.has(String(m.from?.id)),
        from_name: m.from?.name || m.from?.username || "", created_time: m.created_time,
        attachments: mapAttachments(m),
      })).reverse();
    }
    async function upsertMessages(msgs: any[], participant_id: string, platform: string) {
      const rows = msgs.filter((m) => m.id).map((m) => ({
        organization_id, message_id: String(m.id), platform, participant_id: String(participant_id),
        from_page: !!m.from_page, from_name: m.from_name ?? null, body: m.text ?? "",
        attachments: m.attachments ?? [], created_time: m.created_time ?? null,
      }));
      if (rows.length) await admin.from("social_messages").upsert(rows, { onConflict: "organization_id,message_id" });
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
      // DB-first: serve do store (instantâneo) e atualiza por trás com a Graph.
      // O endpoint do Instagram é ~8s (latência da Meta); assim o usuário não espera.
      const only = String(body.platform ?? "");
      const wanted: ("instagram" | "messenger")[] = (only === "instagram" || only === "messenger")
        ? [only] : ["instagram", "messenger"];
      let q = admin.from("social_conversations").select("*").eq("organization_id", organization_id);
      if (only === "instagram" || only === "messenger") q = q.eq("platform", only);
      const { data: rows } = await q.order("updated_time", { ascending: false }).limit(60);
      const fromDb = (rows ?? []).map((r: any) => ({
        id: r.conversation_id || r.participant_id, platform: r.platform, participant_id: r.participant_id,
        name: r.name || "Contato", username: r.username, avatar_url: r.avatar_url, profile_link: r.profile_link,
        updated_time: r.updated_time, last_message: r.last_message ?? "",
      }));
      if (fromDb.length > 0) {
        bg(fetchAndEnrich(wanted).then(({ out }) => upsertConversations(out)));
        return json({ ok: true, conversations: fromDb, channels: {}, source: "db" });
      }
      // Cold start (store vazio): busca ao vivo, persiste e devolve.
      const { out, channels } = await fetchAndEnrich(wanted);
      await upsertConversations(out);
      return json({ ok: true, conversations: out, channels, source: "live" });
    }

    if (action === "messages") {
      // DB-first pela thread (participant_id + platform). Faz backfill/refresh via
      // conversation_id quando disponível.
      const participant_id = String(body.participant_id ?? "");
      const platform = String(body.platform ?? "");
      const conversation_id = String(body.conversation_id ?? "");
      if (!participant_id && !conversation_id) return json({ error: "missing_conversation_id" }, 400);

      let dbMsgs: any[] = [];
      if (participant_id && platform) {
        const { data } = await admin.from("social_messages").select("*")
          .eq("organization_id", organization_id).eq("platform", platform).eq("participant_id", participant_id)
          .order("created_time", { ascending: true }).limit(60);
        dbMsgs = (data ?? []).map((m: any) => ({
          id: m.message_id, text: m.body ?? "", from_page: !!m.from_page,
          from_name: m.from_name ?? "", created_time: m.created_time, attachments: m.attachments ?? [],
        }));
      }
      if (dbMsgs.length > 0) {
        if (conversation_id) bg(liveFetchMessages(conversation_id).then((live) => upsertMessages(live, participant_id, platform)));
        return json({ ok: true, messages: dbMsgs, source: "db" });
      }
      if (!conversation_id) return json({ ok: true, messages: [] });
      try {
        const live = await liveFetchMessages(conversation_id);
        if (participant_id && platform) await upsertMessages(live, participant_id, platform);
        return json({ ok: true, messages: live, source: "live" });
      } catch (e) { return json({ ok: false, error: errMsg(e) }, 502); }
    }

    if (action === "send") {
      const recipient_id = String(body.recipient_id ?? "");
      const text = String(body.text ?? "").trim();
      const platform = String(body.platform ?? "messenger");
      // Anexo opcional: { type: image|video|audio|file, url } — a Meta busca a URL pública.
      const att = body.attachment as { type?: string; url?: string } | undefined;
      const attUrl = att?.url ? String(att.url) : "";
      const attType = ["image", "video", "audio", "file"].includes(String(att?.type)) ? String(att!.type) : "file";
      if (!recipient_id || (!text && !attUrl)) return json({ error: "missing_fields" }, 400);
      const sendMessage = async (message: Record<string, unknown>) => {
        const payload: Record<string, string> = {
          recipient: JSON.stringify({ id: recipient_id }),
          message: JSON.stringify(message),
          messaging_type: "RESPONSE",
        };
        const r = await metaGraphPost(`/${pageId}/messages`, payload, { accessToken: pageToken, appSecret });
        return r?.message_id as string | undefined;
      };
      try {
        const now = new Date().toISOString();
        const sent: any[] = [];
        // Anexo primeiro (a Meta manda texto e anexo em mensagens separadas).
        if (attUrl) {
          const id = await sendMessage({ attachment: { type: attType, payload: { url: attUrl, is_reusable: false } } });
          if (id) sent.push({ id, text: "", from_page: true, from_name: "", created_time: now, attachments: [{ type: attType, url: attUrl }] });
        }
        if (text) {
          const id = await sendMessage({ text });
          if (id) sent.push({ id, text, from_page: true, from_name: "", created_time: now, attachments: [] });
        }
        // Persiste no store (thread + lista ficam consistentes na hora).
        try {
          if (sent.length) await upsertMessages(sent, recipient_id, platform);
          await admin.from("social_conversations").update({
            last_message: text || "[mídia]", updated_time: now, refreshed_at: now,
          }).eq("organization_id", organization_id).eq("platform", platform).eq("participant_id", recipient_id);
        } catch { /* store é best-effort */ }
        return json({ ok: true, ids: sent.map((s) => s.id), platform });
      } catch (e) { return json({ ok: false, error: errMsg(e) }, 502); }
    }

    return json({ error: "unknown_action" }, 400);
  } catch (e) {
    return json({ error: (e as Error)?.message ?? "internal_error" }, 500);
  }
});
