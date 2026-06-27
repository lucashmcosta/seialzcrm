// Webhook Meta WhatsApp Cloud (verify_jwt=false).
// build: 2026-06-27 (Fase 3 — per-integration estrito, sem fallback global)
// Estados:
//  - GET handshake: aceita match somente contra organization_integrations
//    habilitadas que tenham verify_token_encrypted.
//  - POST: identifica a integração pelo phone_number_id do payload e
//    valida X-Hub-Signature-256 com o App Secret cifrado da própria
//    integração. Sem app_secret_encrypted = 401 invalid_signature.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { decryptSecret } from "../_shared/crypto.ts";
import { metaWaGetMediaUrl, metaWaDownloadMedia, MetaWaGraphError } from "../_shared/meta-whatsapp/graph.ts";
import {
  resolveAppSecretForIntegration,
  resolveVerifyTokenForIntegration,
} from "../_shared/meta-whatsapp/credentials.ts";

type MediaKind = "image" | "audio" | "video" | "document" | "sticker";
const MEDIA_KINDS: MediaKind[] = ["image", "audio", "video", "document", "sticker"];

function extFromMime(mime: string): string {
  const m = (mime || "").toLowerCase().split(";")[0].trim();
  const map: Record<string, string> = {
    "audio/ogg": "ogg", "audio/mpeg": "mp3", "audio/mp4": "m4a", "audio/aac": "aac",
    "audio/wav": "wav", "audio/amr": "amr", "audio/webm": "webm",
    "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp",
    "video/mp4": "mp4", "video/3gpp": "3gp",
    "application/pdf": "pdf",
    "application/msword": "doc",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
    "application/vnd.ms-excel": "xls",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
    "text/plain": "txt", "text/csv": "csv",
  };
  return map[m] || "bin";
}

function placeholderForInbound(kind: MediaKind): string {
  switch (kind) {
    case "audio": return "[Áudio]";
    case "image": return "[Imagem]";
    case "video": return "[Vídeo]";
    case "document": return "[Documento]";
    case "sticker": return "[Sticker]";
  }
}

async function hmacSha256Hex(key: string, message: Uint8Array): Promise<string> {
  const cryptoKey = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(key), { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", cryptoKey, message);
  return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
  const url = new URL(req.url);

  // ===== GET = verification handshake =====
  if (req.method === "GET") {
    const mode = url.searchParams.get("hub.mode");
    const token = url.searchParams.get("hub.verify_token");
    const challenge = url.searchParams.get("hub.challenge");

    if (mode !== "subscribe" || !token) {
      return new Response("forbidden", { status: 403, headers: corsHeaders });
    }

    // 1) Tenta match per-integration
    const { data: rows } = await supabase
      .from("organization_integrations")
      .select("id, connected_account, admin_integrations!inner(slug)")
      .eq("is_enabled", true)
      .eq("admin_integrations.slug", "meta-whatsapp-cloud");

    let matched = false;
    let matchedIntegrationId: string | null = null;
    for (const row of rows ?? []) {
      const expected = await resolveVerifyTokenForIntegration((row as any).connected_account);
      if (expected && timingSafeEqual(token, expected)) {
        matched = true;
        matchedIntegrationId = (row as any).id;
        break;
      }
    }

    // 2) Fallback global (Central durante migração)
    if (!matched) {
      const g = globalVerifyToken();
      if (g && timingSafeEqual(token, g)) matched = true;
    }

    console.log("[meta-wa-webhook] GET handshake", {
      matched,
      via: matched ? (matchedIntegrationId ? "per_integration" : "global") : "none",
    });

    if (matched) {
      return new Response(challenge ?? "", { status: 200, headers: corsHeaders });
    }
    return new Response("forbidden", { status: 403, headers: corsHeaders });
  }

  // ===== POST = inbound / status =====
  if (req.method !== "POST") {
    return new Response("method_not_allowed", { status: 405, headers: corsHeaders });
  }

  const rawBody = new Uint8Array(await req.arrayBuffer());
  const signature = req.headers.get("x-hub-signature-256") ?? "";

  // Peek do payload sem confiar ainda — só para descobrir phone_number_id.
  let peek: any = null;
  let peekedPhoneIds: string[] = [];
  try {
    peek = JSON.parse(new TextDecoder().decode(rawBody));
    for (const entry of peek?.entry ?? []) {
      for (const change of entry?.changes ?? []) {
        const pid = change?.value?.metadata?.phone_number_id;
        if (pid) peekedPhoneIds.push(String(pid));
      }
    }
  } catch {
    return new Response("invalid_json", { status: 400, headers: corsHeaders });
  }

  // Resolve App Secret a partir do primeiro phone_number_id encontrado.
  // Em um único POST a Meta agrupa apenas eventos do mesmo App, então o
  // mesmo App Secret valida todos os entries.
  let appSecret: string | undefined;
  let matchedIntegrationId: string | null = null;
  if (peekedPhoneIds.length > 0) {
    const { data: ep } = await supabase
      .from("communication_endpoints")
      .select("organization_integration_id")
      .eq("provider", "meta_cloud_api")
      .eq("sender_sid", peekedPhoneIds[0])
      .maybeSingle();
    if (ep?.organization_integration_id) {
      const { data: oi } = await supabase
        .from("organization_integrations")
        .select("connected_account")
        .eq("id", ep.organization_integration_id)
        .maybeSingle();
      appSecret = await resolveAppSecretForIntegration(
        (oi?.connected_account as any) ?? null,
      );
      matchedIntegrationId = ep.organization_integration_id;
    }
  }
  // Fallback global (Central durante migração)
  if (!appSecret) appSecret = globalAppSecret();

  if (!appSecret) {
    console.warn("[meta-wa-webhook] no_app_secret_available", { peekedPhoneIds });
    return new Response("invalid_signature", { status: 401, headers: corsHeaders });
  }

  const expected = "sha256=" + (await hmacSha256Hex(appSecret, rawBody));
  const signatureMatch = timingSafeEqual(signature, expected);

  console.log("[meta-wa-webhook] POST", JSON.stringify({
    has_x_hub_signature_256: !!signature,
    content_length: rawBody.length,
    signature_match: signatureMatch,
    phone_number_ids: peekedPhoneIds,
    matched_integration_id: matchedIntegrationId,
    via: matchedIntegrationId ? "per_integration" : "global_fallback",
  }));

  if (!signatureMatch) {
    return new Response("invalid_signature", { status: 401, headers: corsHeaders });
  }

  const payload = peek;

  try {
    for (const entry of payload?.entry ?? []) {
      for (const change of entry?.changes ?? []) {
        const value = change?.value ?? {};
        const phoneNumberId = value?.metadata?.phone_number_id;
        if (!phoneNumberId) continue;

        const { data: endpoint } = await supabase
          .from("communication_endpoints")
          .select("id, organization_id, organization_integration_id")
          .eq("provider", "meta_cloud_api")
          .eq("sender_sid", phoneNumberId)
          .maybeSingle();
        if (!endpoint) {
          console.warn("[meta-wa-webhook] no_endpoint", { phoneNumberId });
          continue;
        }

        // Inbound messages
        for (const msg of value?.messages ?? []) {
          await handleInbound(supabase, endpoint, msg, value);
        }
        // Statuses (sent/delivered/read/failed)
        for (const st of value?.statuses ?? []) {
          await handleStatus(supabase, endpoint, st);
        }
      }
    }
  } catch (e) {
    console.error("[meta-wa-webhook] processing error", e);
  }

  // Meta espera 200 mesmo em erro interno para evitar retentativa em loop.
  return new Response("ok", { status: 200, headers: corsHeaders });
});

async function handleInbound(
  supabase: any, endpoint: any, msg: any, value: any,
): Promise<void> {
  const fromE164 = "+" + String(msg.from).replace(/^\+/, "");
  const wamid = msg.id as string;

  // Resolve / cria contato
  const { data: existingContact, error: contactSelErr } = await supabase
    .from("contacts")
    .select("id")
    .eq("organization_id", endpoint.organization_id)
    .eq("phone", fromE164)
    .maybeSingle();
  if (contactSelErr) console.error("[meta-wa-webhook] contact select error", contactSelErr);

  let contactId: string | null = existingContact?.id ?? null;
  if (!contactId) {
    const profileName = value?.contacts?.[0]?.profile?.name ?? null;
    const { data: created, error: contactInsErr } = await supabase
      .from("contacts")
      .insert({
        organization_id: endpoint.organization_id,
        phone: fromE164,
        full_name: profileName ?? fromE164,
        lifecycle_stage: "lead",
      })
      .select("id")
      .single();
    if (contactInsErr) console.error("[meta-wa-webhook] contact insert error", contactInsErr);
    contactId = created?.id ?? null;
  }
  if (!contactId) { console.error("[meta-wa-webhook] no contactId"); return; }

  // Resolve / cria thread
  const { data: thread, error: threadSelErr } = await supabase
    .from("message_threads")
    .select("id")
    .eq("organization_id", endpoint.organization_id)
    .eq("contact_id", contactId)
    .eq("channel", "whatsapp")
    .eq("primary_endpoint_id", endpoint.id)
    .maybeSingle();
  if (threadSelErr) console.error("[meta-wa-webhook] thread select error", threadSelErr);

  let threadId = thread?.id;
  if (!threadId) {
    const { data: created, error: threadInsErr } = await supabase
      .from("message_threads")
      .insert({
        organization_id: endpoint.organization_id,
        contact_id: contactId,
        channel: "whatsapp",
        subject: "WhatsApp",
        primary_endpoint_id: endpoint.id,
      })
      .select("id")
      .single();
    if (threadInsErr) console.error("[meta-wa-webhook] thread insert error", threadInsErr);
    threadId = created?.id;
  }
  if (!threadId) { console.error("[meta-wa-webhook] no threadId"); return; }

  // Detecta tipo de mídia
  const mediaKind = MEDIA_KINDS.find((k) => msg?.[k]) as MediaKind | undefined;

  let mediaUrls: string[] | null = null;
  let mediaType: MediaKind | null = null;
  let mediaInfo: Record<string, any> = {};

  if (mediaKind) {
    mediaType = mediaKind;
    const mediaObj = msg[mediaKind] ?? {};
    const mediaId = mediaObj?.id as string | undefined;
    const initialMime = mediaObj?.mime_type as string | undefined;
    const sha256 = mediaObj?.sha256 as string | undefined;
    const caption = mediaObj?.caption as string | undefined;
    const filename = mediaObj?.filename as string | undefined;
    mediaInfo = { media_id: mediaId, mime_type: initialMime, sha256, filename, caption };

    if (mediaId) {
      try {
        // Carrega access token e app_secret da integração (per-tenant)
        const { data: oi } = await supabase
          .from("organization_integrations")
          .select("connected_account")
          .eq("id", endpoint.organization_integration_id)
          .maybeSingle();
        const ca = (oi?.connected_account as any) ?? null;
        const enc = ca?.access_token_encrypted;
        if (!enc) throw new Error("missing_access_token");
        const accessToken = (await decryptSecret(enc)).trim();
        const appSecret = await resolveAppSecretForIntegration(ca);

        // 1) Resolve URL temporária
        const meta = await metaWaGetMediaUrl(mediaId, { accessToken, appSecret });
        const mime = meta.mime_type || initialMime || "application/octet-stream";
        // 2) Download
        const { bytes } = await metaWaDownloadMedia(meta.url, { accessToken, appSecret });
        // 3) Upload Storage
        const ext = extFromMime(mime);
        const path = `${endpoint.organization_id}/meta-inbound/${mediaId}.${ext}`;
        const { error: upErr } = await supabase.storage
          .from("whatsapp-media")
          .upload(path, bytes, { contentType: mime, upsert: true });
        if (upErr) throw upErr;
        const { data: pub } = supabase.storage.from("whatsapp-media").getPublicUrl(path);
        mediaUrls = pub?.publicUrl ? [pub.publicUrl] : null;
        mediaInfo.mime_type = mime;
        mediaInfo.storage_path = path;
      } catch (e) {
        const errMsg = e instanceof MetaWaGraphError ? e.error.message : (e as Error).message;
        console.error("[meta-wa-webhook] media download/store failed", { mediaId, errMsg });
        mediaInfo.media_download_error = errMsg;
      }
    } else {
      mediaInfo.media_download_error = "missing_media_id";
    }
  }

  // Conteúdo textual / placeholder
  let content: string;
  if (mediaKind) {
    const cap = mediaInfo.caption as string | undefined;
    const fname = mediaInfo.filename as string | undefined;
    if (mediaKind === "image" || mediaKind === "video") content = cap || placeholderForInbound(mediaKind);
    else if (mediaKind === "document") content = cap || fname || placeholderForInbound(mediaKind);
    else content = placeholderForInbound(mediaKind);
  } else {
    content = msg?.text?.body
      ?? msg?.button?.text
      ?? msg?.interactive?.button_reply?.title
      ?? msg?.interactive?.list_reply?.title
      ?? "[mensagem não-textual]";
  }

  const { error: msgInsErr } = await supabase.from("messages").insert({
    organization_id: endpoint.organization_id,
    thread_id: threadId,
    content,
    direction: "inbound",
    whatsapp_message_sid: wamid,
    endpoint_id: endpoint.id,
    sender_type: "contact",
    media_urls: mediaUrls,
    media_type: mediaType,
    metadata: { meta_cloud: { ...mediaInfo, raw: msg } },
  });
  if (msgInsErr) console.error("[meta-wa-webhook] message insert error", msgInsErr);

  await supabase
    .from("message_threads")
    .update({ whatsapp_last_inbound_at: new Date().toISOString() })
    .eq("id", threadId);

}


async function handleStatus(supabase: any, endpoint: any, st: any): Promise<void> {
  const wamid = st.id;
  const status = st.status; // sent / delivered / read / failed
  if (!wamid || !status) return;

  const update: Record<string, any> = { whatsapp_status: status };
  if (status === "failed" && st.errors?.length) {
    update.error_code = String(st.errors[0]?.code ?? "");
    update.error_message = st.errors[0]?.message ?? "Meta delivery failed";
  }
  await supabase
    .from("messages")
    .update(update)
    .eq("whatsapp_message_sid", wamid)
    .eq("organization_id", endpoint.organization_id);
}
