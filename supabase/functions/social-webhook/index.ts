// social-webhook — receptor de webhooks de mensagens do Instagram Direct e do
// Messenger. Persiste conversas/mensagens no store (social_conversations /
// social_messages) pra a caixa /social ler do banco (instantâneo). A doc da Meta
// recomenda webhooks pra evitar rate limit do endpoint de conversas.
// GET: verificação do subscribe (hub.challenge). POST: ingestão (assinatura HMAC).
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { facebookAppSecret } from "../_shared/meta/connection.ts";

const enc = new TextEncoder();

async function validSignature(raw: string, header: string | null, appSecret: string): Promise<boolean> {
  if (!header?.startsWith("sha256=")) return false;
  const sig = header.slice("sha256=".length);
  const key = await crypto.subtle.importKey("raw", enc.encode(appSecret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = await crypto.subtle.sign("HMAC", key, enc.encode(raw));
  const hex = [...new Uint8Array(mac)].map((b) => b.toString(16).padStart(2, "0")).join("");
  // comparação em tempo ~constante
  if (hex.length !== sig.length) return false;
  let diff = 0;
  for (let i = 0; i < hex.length; i++) diff |= hex.charCodeAt(i) ^ sig.charCodeAt(i);
  return diff === 0;
}

function mapWebhookAttachments(atts: any[]): { type: string; url: string }[] {
  const out: { type: string; url: string }[] = [];
  for (const a of atts ?? []) {
    const url = a?.payload?.url;
    if (!url) continue;
    const t = String(a.type || "");
    const type = t === "image" ? "image" : t === "video" ? "video" : t === "audio" ? "audio"
      : (t === "share" || t === "story_mention" || t === "template") ? "share" : "file";
    out.push({ type, url });
  }
  return out;
}

serve(async (req) => {
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  // 1) Verificação do subscribe (GET).
  if (req.method === "GET") {
    const u = new URL(req.url);
    const mode = u.searchParams.get("hub.mode");
    const token = u.searchParams.get("hub.verify_token");
    const challenge = u.searchParams.get("hub.challenge");
    const expected = Deno.env.get("META_WEBHOOK_VERIFY_TOKEN");
    if (mode === "subscribe" && expected && token === expected) {
      return new Response(challenge ?? "", { status: 200 });
    }
    return new Response("forbidden", { status: 403 });
  }

  if (req.method !== "POST") return new Response("ok", { status: 200 });

  // 2) Ingestão (POST). Verifica assinatura HMAC do corpo cru.
  const raw = await req.text();
  const appSecret = facebookAppSecret();
  if (!appSecret || !(await validSignature(raw, req.headers.get("x-hub-signature-256"), appSecret))) {
    return new Response("bad signature", { status: 401 });
  }

  let payload: any;
  try { payload = JSON.parse(raw); } catch { return new Response("bad json", { status: 400 }); }
  const objType = String(payload?.object ?? "");
  const platform = objType === "instagram" ? "instagram" : objType === "page" ? "messenger" : null;
  if (!platform) return new Response("ignored", { status: 200 });

  // Cache local: id do ativo (IGID/PAGEID) → organization_id.
  const orgCache = new Map<string, string | null>();
  const resolveOrg = async (assetId: string): Promise<string | null> => {
    if (orgCache.has(assetId)) return orgCache.get(assetId) ?? null;
    const assetType = platform === "instagram" ? "instagram_account" : "page";
    const { data } = await admin.from("meta_assets")
      .select("connection_id, meta_connections!inner(organization_id)")
      .eq("external_id", assetId).eq("asset_type", assetType).limit(1).maybeSingle();
    const org = (data as any)?.meta_connections?.organization_id ?? null;
    orgCache.set(assetId, org);
    return org;
  };

  try {
    for (const entry of payload?.entry ?? []) {
      const assetId = String(entry?.id ?? "");
      const organization_id = await resolveOrg(assetId);
      if (!organization_id) continue;
      for (const ev of entry?.messaging ?? []) {
        const msg = ev?.message;
        if (!msg?.mid) continue;                 // só eventos de mensagem
        const isEcho = !!msg.is_echo;             // nós enviamos
        const participant_id = String(isEcho ? ev?.recipient?.id : ev?.sender?.id);
        if (!participant_id) continue;
        const created = ev?.timestamp ? new Date(Number(ev.timestamp)).toISOString() : new Date().toISOString();
        const attachments = mapWebhookAttachments(msg.attachments);
        const bodyText = String(msg.text ?? "");

        await admin.from("social_messages").upsert({
          organization_id, message_id: String(msg.mid), platform, participant_id,
          from_page: isEcho, from_name: null, body: bodyText, attachments, created_time: created,
        }, { onConflict: "organization_id,message_id" });

        // Atualiza/insere a conversa (nome/avatar são preenchidos no refresh via API).
        await admin.from("social_conversations").upsert({
          organization_id, platform, participant_id,
          last_message: bodyText || (attachments[0] ? "[mídia]" : ""), updated_time: created,
          refreshed_at: new Date().toISOString(),
        }, { onConflict: "organization_id,platform,participant_id", ignoreDuplicates: false });
      }
    }
  } catch (_e) { /* nunca derruba o webhook: sempre 200 pra Meta não reentregar em loop */ }

  return new Response("ok", { status: 200 });
});
