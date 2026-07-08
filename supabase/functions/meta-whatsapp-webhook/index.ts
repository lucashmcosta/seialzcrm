// Webhook Meta WhatsApp Cloud (verify_jwt=false).
// build: 2026-06-27 (Fase 4 — paridade funcional com Twilio inbound)
//
// Hotfix:
// - Honra inbound_settings (endpoint → integration → fallback)
// - Cria contato com normalizePhoneForSearch (variações BR do 9º dígito)
// - Auto-cria oportunidade quando configurado
// - Captura CTWA (messages[].referral) e popula ad_referral_*
// - Resolve reply_to_message_id via msg.context.id
// - Cria notification e activity
// - Dispara AI agent SDR ou marca needs_human_attention
//
// Mídia, outbound, templates e handleStatus permanecem inalterados.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { metaWaGetMediaUrl, metaWaDownloadMedia, MetaWaGraphError } from "../_shared/meta-whatsapp/graph.ts";
import {
  resolveVerifyTokenForOi,
  resolveMetaCredentials,
} from "../_shared/meta-whatsapp/credentials.ts";

type MediaKind = "image" | "audio" | "video" | "document" | "sticker";
const MEDIA_KINDS: MediaKind[] = ["image", "audio", "video", "document", "sticker"];

interface InboundSettings {
  auto_create_contact: boolean;
  default_lifecycle_stage: string;
  auto_create_opportunity: boolean;
  default_pipeline_id?: string | null;
  default_stage_id?: string | null;
  default_opportunity_owner?: string;
}

const DEFAULT_INBOUND_SETTINGS: InboundSettings = {
  auto_create_contact: true,
  default_lifecycle_stage: "lead",
  auto_create_opportunity: false,
  default_stage_id: null,
};

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

// ===== Phone matching BR (replicado do twilio-whatsapp-webhook) =====
function normalizePhoneForSearch(phone: string): string[] {
  const cleaned = phone.replace("whatsapp:", "").replace(/[^\d+]/g, "");
  const variations = new Set<string>();
  variations.add(phone);
  variations.add(cleaned);
  if (cleaned.startsWith("+")) variations.add(cleaned.slice(1));
  else variations.add("+" + cleaned);

  const digits = cleaned.replace("+", "");
  if (digits.startsWith("55") && digits.length >= 12) {
    const withoutCountry = digits.slice(2);
    variations.add(withoutCountry);
    variations.add("+55" + withoutCountry);
    variations.add("55" + withoutCountry);
  }
  if (!digits.startsWith("55") && digits.length >= 10 && digits.length <= 11) {
    variations.add("55" + digits);
    variations.add("+55" + digits);
  }
  if (digits.startsWith("55") && digits.length >= 12) {
    const ddd = digits.slice(2, 4);
    const local = digits.slice(4);
    if (local.length === 9 && local.startsWith("9")) {
      const without9 = ddd + local.slice(1);
      variations.add("+55" + without9);
      variations.add("55" + without9);
      variations.add(without9);
    } else if (local.length === 8) {
      const with9 = ddd + "9" + local;
      variations.add("+55" + with9);
      variations.add("55" + with9);
      variations.add(with9);
    }
  }
  return Array.from(variations);
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

    const { data: rows } = await supabase
      .from("organization_integrations")
      .select("id, connected_account, meta_credentials_id, admin_integrations!inner(slug)")
      .eq("is_enabled", true)
      .eq("admin_integrations.slug", "meta-whatsapp-cloud");

    let matched = false;
    let matchedIntegrationId: string | null = null;
    for (const row of rows ?? []) {
      const expected = await resolveVerifyTokenForOi(supabase, row as any);
      if (expected && timingSafeEqual(token, expected)) {
        matched = true;
        matchedIntegrationId = (row as any).id;
        break;
      }
    }

    console.log("[meta-wa-webhook] GET handshake", {
      matched,
      via: matched ? "per_integration" : "none",
      matched_integration_id: matchedIntegrationId,
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

  let peek: any = null;
  const peekedPhoneIds: string[] = [];
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
    via: "per_integration",
  }));

  if (!signatureMatch) {
    return new Response("invalid_signature", { status: 401, headers: corsHeaders });
  }

  const payload = peek;

  // Extrai headers relevantes para auditoria (não incluir Authorization/x-hub-signature)
  const auditHeaders: Record<string, string> = {};
  for (const [k, v] of req.headers.entries()) {
    const kl = k.toLowerCase();
    if (kl === "authorization" || kl === "cookie" || kl === "x-hub-signature-256" || kl === "x-hub-signature") continue;
    auditHeaders[k] = v;
  }

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

        const wabaId = entry?.id ?? null;

        if (!endpoint) {
          console.warn("[meta-wa-webhook] no_endpoint", { phoneNumberId });
          // PR-B: registrar mesmo sem endpoint resolvido, para auditoria
          await recordInboundEvent(supabase, {
            organizationId: null,
            endpointId: null,
            phoneNumberId,
            wabaId,
            fromE164: null,
            messageType: null,
            wamid: null,
            contextId: null,
            signatureValid: signatureMatch,
            rawPayload: change,
            rawHeaders: auditHeaders,
            kind: "unknown",
          }).then((auditId) => updateInboundEventStatus(supabase, auditId, {
            processStatus: "failed",
            processError: "no_endpoint_for_phone_number_id",
          }));
          continue;
        }

        for (const msg of value?.messages ?? []) {
          const messageType = msg?.type ?? "unknown";
          const fromE164 = msg?.from ? "+" + String(msg.from).replace(/^\+/, "") : null;
          const wamid = msg?.id ?? null;
          const contextId = msg?.context?.id ?? null;

          // PR-B: registrar ANTES do parse
          const auditId = await recordInboundEvent(supabase, {
            organizationId: endpoint.organization_id,
            endpointId: endpoint.id,
            phoneNumberId,
            wabaId,
            fromE164,
            messageType,
            wamid,
            contextId,
            signatureValid: signatureMatch,
            rawPayload: msg,
            rawHeaders: auditHeaders,
            kind: "message",
          });

          try {
            const result = await handleInbound(supabase, endpoint, msg, value);
            await updateInboundEventStatus(supabase, auditId, {
              processStatus: result.error ? "failed" : "processed",
              processError: result.error ?? null,
              resultingMessageId: result.messageId,
              resultingThreadId: result.threadId,
            });
          } catch (e) {
            const errMsg = (e as Error)?.message ?? String(e);
            console.error("[meta-wa-webhook] handleInbound_exception", { wamid, errMsg });
            await updateInboundEventStatus(supabase, auditId, {
              processStatus: "failed",
              processError: `exception:${errMsg}`,
            });
          }
        }

        for (const st of value?.statuses ?? []) {
          const wamid = st?.id ?? null;
          const auditId = await recordInboundEvent(supabase, {
            organizationId: endpoint.organization_id,
            endpointId: endpoint.id,
            phoneNumberId,
            wabaId,
            fromE164: st?.recipient_id ? "+" + String(st.recipient_id).replace(/^\+/, "") : null,
            messageType: st?.status ?? "unknown",
            wamid,
            contextId: null,
            signatureValid: signatureMatch,
            rawPayload: st,
            rawHeaders: auditHeaders,
            kind: "status",
          });

          try {
            const result = await handleStatus(supabase, endpoint, st);
            await updateInboundEventStatus(supabase, auditId, {
              processStatus: result.error ? "failed" : "processed",
              processError: result.error ?? null,
              resultingMessageId: result.messageId,
            });
          } catch (e) {
            const errMsg = (e as Error)?.message ?? String(e);
            console.error("[meta-wa-webhook] handleStatus_exception", { wamid, errMsg });
            await updateInboundEventStatus(supabase, auditId, {
              processStatus: "failed",
              processError: `exception:${errMsg}`,
            });
          }
        }
      }
    }
  } catch (e) {
    console.error("[meta-wa-webhook] processing error", e);
  }

  return new Response("ok", { status: 200, headers: corsHeaders });
});

// ============================================================
// Helpers de regra de negócio (paridade com Twilio inbound)
// ============================================================

async function resolveInboundSettings(
  supabase: any,
  endpoint: { id: string; organization_integration_id: string | null },
): Promise<{ settings: InboundSettings; source: string }> {
  const { data: epRow } = await supabase
    .from("communication_endpoints")
    .select("inbound_settings")
    .eq("id", endpoint.id)
    .maybeSingle();
  const epInbound = (epRow?.inbound_settings as InboundSettings | null) ?? null;
  if (epInbound) {
    return { settings: { ...DEFAULT_INBOUND_SETTINGS, ...epInbound }, source: "endpoint" };
  }

  if (endpoint.organization_integration_id) {
    const { data: oi } = await supabase
      .from("organization_integrations")
      .select("whatsapp_inbound_settings")
      .eq("id", endpoint.organization_integration_id)
      .maybeSingle();
    const intInbound = (oi?.whatsapp_inbound_settings as InboundSettings | null) ?? null;
    if (intInbound) {
      return { settings: { ...DEFAULT_INBOUND_SETTINGS, ...intInbound }, source: "integration" };
    }
  }

  return { settings: { ...DEFAULT_INBOUND_SETTINGS }, source: "default" };
}

async function findOrCreateContact(
  supabase: any,
  endpoint: { organization_id: string },
  fromE164: string,
  profileName: string,
  inbound: InboundSettings,
): Promise<{ contactId: string | null; contactOwnerId: string | null; created: boolean }> {
  const phoneVariations = normalizePhoneForSearch(fromE164);
  const orConditions = phoneVariations.map((p) => `phone.eq.${p}`).join(",");

  const { data: existing } = await supabase
    .from("contacts")
    .select("id, owner_user_id")
    .eq("organization_id", endpoint.organization_id)
    .or(orConditions)
    .is("deleted_at", null)
    .limit(1)
    .maybeSingle();

  if (existing) {
    return { contactId: existing.id, contactOwnerId: existing.owner_user_id ?? null, created: false };
  }

  if (!inbound.auto_create_contact) {
    return { contactId: null, contactOwnerId: null, created: false };
  }

  const contactName = profileName || `WhatsApp ${fromE164}`;
  const { data: newContact, error } = await supabase
    .from("contacts")
    .insert({
      organization_id: endpoint.organization_id,
      full_name: contactName,
      phone: fromE164,
      source: "whatsapp",
      lifecycle_stage: inbound.default_lifecycle_stage || "lead",
    })
    .select("id, owner_user_id")
    .single();

  if (error || !newContact) {
    console.error("[meta-wa-webhook] contact insert error", error);
    return { contactId: null, contactOwnerId: null, created: false };
  }
  return { contactId: newContact.id, contactOwnerId: newContact.owner_user_id ?? null, created: true };
}

async function autoCreateOpportunityIfEnabled(
  supabase: any,
  endpoint: { organization_id: string },
  contactId: string,
  contactName: string,
  contactOwnerId: string | null,
  inbound: InboundSettings,
): Promise<void> {
  if (!inbound.auto_create_opportunity) return;

  try {
    const { data: existingOpen } = await supabase
      .from("opportunities")
      .select("id")
      .eq("organization_id", endpoint.organization_id)
      .eq("contact_id", contactId)
      .eq("status", "open")
      .is("deleted_at", null)
      .limit(1)
      .maybeSingle();

    if (existingOpen) {
      console.log("[meta-wa-webhook] skip opp creation — open opp exists", existingOpen.id);
      return;
    }

    let resolvedStageId: string | null = null;
    if (inbound.default_stage_id) {
      const { data: validStage } = await supabase
        .from("pipeline_stages")
        .select("id")
        .eq("id", inbound.default_stage_id)
        .eq("organization_id", endpoint.organization_id)
        .maybeSingle();
      if (validStage) resolvedStageId = validStage.id;
    }
    if (!resolvedStageId) {
      const { data: firstStage } = await supabase
        .from("pipeline_stages")
        .select("id")
        .eq("organization_id", endpoint.organization_id)
        .order("order_index", { ascending: true })
        .limit(1)
        .maybeSingle();
      if (firstStage) resolvedStageId = firstStage.id;
    }
    if (!resolvedStageId) {
      console.error("[meta-wa-webhook] no pipeline_stages — skipping opp", endpoint.organization_id);
      return;
    }

    const oppData: Record<string, any> = {
      organization_id: endpoint.organization_id,
      contact_id: contactId,
      title: `Oportunidade - ${contactName}`,
      status: "open",
      pipeline_stage_id: resolvedStageId,
    };
    if (contactOwnerId) oppData.owner_user_id = contactOwnerId;

    const { data: newOpp, error } = await supabase
      .from("opportunities")
      .insert(oppData)
      .select("id")
      .single();
    if (error) {
      console.error("[meta-wa-webhook] auto-create opp error", error);
    } else if (newOpp) {
      console.log("[meta-wa-webhook] auto-created opportunity", newOpp.id);
    }
  } catch (e) {
    console.error("[meta-wa-webhook] auto-create opp exception", e);
  }
}

async function saveReferralFields(
  supabase: any,
  contactId: string,
  ref: {
    source_url: string | null;
    source_id: string | null;
    source_type: string | null;
    headline: string | null;
    body: string | null;
    media_url: string | null;
    ctwa_clid: string | null;
  },
): Promise<void> {
  const { error } = await supabase.from("contacts").update({
    ad_referral_source_url: ref.source_url,
    ad_referral_headline: ref.headline,
    ad_referral_body: ref.body,
    ad_referral_media_url: ref.media_url,
    ad_referral_source_id: ref.source_id,
    ad_referral_source_type: ref.source_type,
    ad_referral_ctwa_clid: ref.ctwa_clid,
    ad_referral_captured_at: new Date().toISOString(),
    source: "ctwa",
    utm_source: "meta_ads",
    utm_medium: "ctwa",
  } as any).eq("id", contactId);
  if (error) {
    console.error("[meta-wa-webhook] referral save error", error);
  } else {
    console.log("[meta-wa-webhook] CTWA referral saved for contact", contactId);
  }
}

async function resolveReplyToMessageId(
  supabase: any,
  organizationId: string,
  contextWamid: string | null | undefined,
): Promise<string | null> {
  if (!contextWamid) return null;
  const { data } = await supabase
    .from("messages")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("whatsapp_message_sid", contextWamid)
    .maybeSingle();
  return data?.id ?? null;
}

async function notifyContactOwner(
  supabase: any,
  organizationId: string,
  contactOwnerId: string | null,
  profileName: string,
  fromE164: string,
  body: string,
  mediaType: MediaKind | null,
  threadId: string,
): Promise<void> {
  if (!contactOwnerId) return;

  let notificationBody = body;
  if (mediaType && !body) {
    const label = mediaType === "audio" ? "🎵 Áudio"
      : mediaType === "image" ? "📷 Imagem"
      : mediaType === "video" ? "🎬 Vídeo"
      : mediaType === "sticker" ? "🩹 Sticker"
      : "📎 Mídia";
    notificationBody = label;
  }

  await supabase.from("notifications").insert({
    user_id: contactOwnerId,
    organization_id: organizationId,
    type: "whatsapp_message",
    title: "Nova mensagem WhatsApp",
    body: `${profileName || fromE164}: ${notificationBody.slice(0, 100)}${notificationBody.length > 100 ? "..." : ""}`,
    entity_type: "message",
    entity_id: threadId,
  });
}

async function insertActivity(
  supabase: any,
  organizationId: string,
  contactId: string,
  body: string,
  mediaType: MediaKind | null,
): Promise<void> {
  let title = "Mensagem WhatsApp recebida";
  if (mediaType) title = `Mensagem WhatsApp recebida (${mediaType})`;

  await supabase.from("activities").insert({
    organization_id: organizationId,
    contact_id: contactId,
    activity_type: "message",
    title,
    body: body.slice(0, 200) || (mediaType ? "[Mídia]" : ""),
    occurred_at: new Date().toISOString(),
  });
}

async function triggerAiAgentOrFlagHuman(
  supabase: any,
  organizationId: string,
  threadId: string,
  contactId: string,
  body: string,
): Promise<void> {
  const { data: aiAgents, error: agentError } = await supabase
    .from("ai_agents")
    .select("id, is_enabled, max_messages_per_conversation")
    .eq("organization_id", organizationId)
    .eq("agent_type", "sdr")
    .eq("is_enabled", true)
    .order("created_at", { ascending: false })
    .limit(1);
  if (agentError) console.error("[meta-wa-webhook] ai_agents fetch error", agentError);

  const aiAgent = aiAgents?.[0];

  if (aiAgent && body) {
    console.log("[meta-wa-webhook] AI Agent found", aiAgent.id, "- triggering response");
    try {
      const supabaseUrl = Deno.env.get("SUPABASE_URL");
      const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
      fetch(`${supabaseUrl}/functions/v1/ai-agent-respond`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${serviceKey}`,
        },
        body: JSON.stringify({
          agentId: aiAgent.id,
          contactId,
          threadId,
          message: body,
        }),
      }).catch((err) => console.error("[meta-wa-webhook] ai-agent-respond call failed", err));
    } catch (e) {
      console.error("[meta-wa-webhook] ai-agent trigger exception", e);
    }
  } else if (!aiAgent) {
    console.log("[meta-wa-webhook] no AI agent — flagging needs_human_attention", threadId);
    await supabase
      .from("message_threads")
      .update({
        needs_human_attention: true,
        updated_at: new Date().toISOString(),
      })
      .eq("id", threadId);
  }
}

// ============================================================
// Inbound principal
// ============================================================
async function handleInbound(
  supabase: any, endpoint: any, msg: any, value: any,
): Promise<{ messageId: string | null; threadId: string | null; error: string | null }> {
  const fromE164 = "+" + String(msg.from).replace(/^\+/, "");
  const wamid = msg.id as string;
  const profileName = value?.contacts?.[0]?.profile?.name ?? "";

  // 1) Resolver inbound_settings
  const { settings: inboundSettings, source: settingsSource } =
    await resolveInboundSettings(supabase, endpoint);
  console.log("[meta-wa-webhook] inbound_settings resolved", JSON.stringify({
    endpoint_id: endpoint.id,
    source: settingsSource,
    auto_create_contact: inboundSettings.auto_create_contact,
    auto_create_opportunity: inboundSettings.auto_create_opportunity,
  }));

  // 2) Parse CTWA referral
  const ref = msg?.referral;
  const referral = ref ? {
    source_url: ref.source_url ?? null,
    source_id: ref.source_id ?? null,
    source_type: ref.source_type ?? null,
    headline: ref.headline ?? null,
    body: ref.body ?? null,
    media_url: ref.image_url ?? ref.video_url ?? ref.thumbnail_url ?? null,
    ctwa_clid: ref.ctwa_clid ?? null,
  } : null;
  const hasReferral = !!(referral && (
    referral.source_url || referral.source_id || referral.ctwa_clid ||
    referral.headline || referral.body
  ));
  if (hasReferral) {
    console.log("[meta-wa-webhook] CTWA referral detected", JSON.stringify({
      has_source_id: !!referral!.source_id,
      has_ctwa_clid: !!referral!.ctwa_clid,
      has_headline: !!referral!.headline,
    }));
  }

  // 3) Find or create contact (honra auto_create_contact)
  const { contactId, contactOwnerId, created } = await findOrCreateContact(
    supabase, endpoint, fromE164, profileName, inboundSettings,
  );
  if (!contactId) {
    console.log("[meta-wa-webhook] no contactId (auto_create_contact disabled?) — skipping", { fromE164 });
    return { messageId: null, threadId: null, error: "no_contact" };
  }

  // 4) Auto-create opportunity quando contato foi recém-criado
  if (created) {
    await autoCreateOpportunityIfEnabled(
      supabase, endpoint, contactId,
      profileName || `WhatsApp ${fromE164}`,
      contactOwnerId, inboundSettings,
    );
  }

  // 5) Persistir campos CTWA no contato
  if (hasReferral && referral) {
    await saveReferralFields(supabase, contactId, referral);
  }

  // 6) Find or create thread — determinístico, tolera duplicatas históricas
  //    (PR-A: substitui .maybeSingle() por lookup ordenado com limit(5))
  const { data: threads, error: threadLookupErr } = await supabase
    .from("message_threads")
    .select("id, status, last_message_at, created_at")
    .eq("organization_id", endpoint.organization_id)
    .eq("contact_id", contactId)
    .eq("channel", "whatsapp")
    .eq("primary_endpoint_id", endpoint.id)
    .order("last_message_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
    .limit(5);

  if (threadLookupErr) {
    console.error("[meta-wa-webhook] thread_lookup_error", {
      contact_id: contactId,
      endpoint_id: endpoint.id,
      error: threadLookupErr,
    });
  }

  const threadCount = threads?.length ?? 0;
  let threadId: string | undefined = threads?.[0]?.id;

  if (threadCount > 1) {
    console.warn("[meta-wa-webhook] duplicate_thread_detected", JSON.stringify({
      contact_id: contactId,
      endpoint_id: endpoint.id,
      thread_count: threadCount,
      selected_thread_id: threadId,
      all_thread_ids: (threads ?? []).map((t: any) => t.id),
    }));
  }

  if (!threadId) {
    const { data: createdThread, error: threadInsErr } = await supabase
      .from("message_threads")
      .insert({
        organization_id: endpoint.organization_id,
        contact_id: contactId,
        channel: "whatsapp",
        subject: "WhatsApp",
        primary_endpoint_id: endpoint.id,
        whatsapp_last_inbound_at: new Date().toISOString(),
        last_inbound_at: new Date().toISOString(),
      })
      .select("id")
      .single();
    if (threadInsErr) console.error("[meta-wa-webhook] thread_insert_error", threadInsErr);
    threadId = createdThread?.id;
    if (threadId) {
      console.log("[meta-wa-webhook] thread_created", JSON.stringify({
        thread_id: threadId, contact_id: contactId, endpoint_id: endpoint.id,
      }));
    }
  } else {
    console.log("[meta-wa-webhook] thread_selected", JSON.stringify({
      thread_id: threadId, thread_count: threadCount, contact_id: contactId,
    }));
  }

  if (!threadId) {
    console.error("[meta-wa-webhook] no_thread_id_after_lookup_and_insert", {
      contact_id: contactId, endpoint_id: endpoint.id,
    });
    return { messageId: null, threadId: null, error: "no_thread_id" };
  }

  // 7) Mídia (inalterado)
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

        const meta = await metaWaGetMediaUrl(mediaId, { accessToken, appSecret });
        const mime = meta.mime_type || initialMime || "application/octet-stream";
        const { bytes } = await metaWaDownloadMedia(meta.url, { accessToken, appSecret });
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

  // 8) Conteúdo textual / placeholder
  let content: string;
  if (mediaKind) {
    const cap = mediaInfo.caption as string | undefined;
    const fname = mediaInfo.filename as string | undefined;
    if (mediaKind === "image" || mediaKind === "video") content = cap || placeholderForInbound(mediaKind);
    else if (mediaKind === "document") content = cap || fname || placeholderForInbound(mediaKind);
    else content = placeholderForInbound(mediaKind);
  } else {
    // Reaction: emoji + (reação). reaction.message_id fica preservado em metadata.raw.
    const reactionText = msg?.reaction?.emoji
      ? `${msg.reaction.emoji} (reação)`
      : undefined;

    // Location: nome > endereço > lat,lng
    let locationText: string | undefined;
    if (msg?.location) {
      const loc = msg.location as { name?: string; address?: string; latitude?: number; longitude?: number };
      const label = loc.name
        || loc.address
        || (loc.latitude != null && loc.longitude != null ? `${loc.latitude},${loc.longitude}` : null);
      locationText = `📍 Localização${label ? `: ${label}` : ""}`;
    }

    // Contacts: lista de formatted_name (singular/plural)
    let contactsText: string | undefined;
    if (Array.isArray(msg?.contacts) && msg.contacts.length > 0) {
      const names = (msg.contacts as Array<{ name?: { formatted_name?: string } }>)
        .map((c) => c?.name?.formatted_name)
        .filter((n): n is string => !!n);
      const label = names.length > 0 ? names.join(", ") : "";
      const prefix = msg.contacts.length > 1 ? "👤 Contatos compartilhados" : "👤 Contato compartilhado";
      contactsText = label ? `${prefix}: ${label}` : prefix;
    }

    // Sticker
    const stickerText = msg?.type === "sticker" || msg?.sticker ? "🏷️ Sticker" : undefined;

    // WhatsApp Flows / nfm_reply
    let flowReplyText: string | undefined;
    const nfm = msg?.interactive?.nfm_reply as { name?: string } | undefined;
    if (nfm) {
      flowReplyText = `📋 Resposta de formulário: ${nfm.name || "WhatsApp Flow"}`;
    }

    content = msg?.text?.body
      ?? msg?.button?.text
      ?? msg?.interactive?.button_reply?.title
      ?? msg?.interactive?.list_reply?.title
      ?? reactionText
      ?? locationText
      ?? contactsText
      ?? stickerText
      ?? flowReplyText
      ?? `[mensagem não suportada: ${msg?.type ?? "desconhecido"}]`;
  }

  // 9) Reply context
  const replyToMessageId = await resolveReplyToMessageId(
    supabase, endpoint.organization_id, msg?.context?.id,
  );

  // 10) Insert message
  const { data: insertedMsg, error: msgInsErr } = await supabase.from("messages").insert({
    organization_id: endpoint.organization_id,
    thread_id: threadId,
    content,
    direction: "inbound",
    whatsapp_message_sid: wamid,
    whatsapp_status: "delivered",
    endpoint_id: endpoint.id,
    sender_type: "contact",
    media_urls: mediaUrls,
    media_type: mediaType,
    reply_to_message_id: replyToMessageId,
    sent_at: new Date().toISOString(),
    metadata: { meta_cloud: { ...mediaInfo, raw: msg, referral } },
  }).select("id").single();
  if (msgInsErr) {
    console.error("[meta-wa-webhook] message insert error", msgInsErr);
    return { messageId: null, threadId, error: `message_insert_error:${msgInsErr.message ?? msgInsErr.code ?? "unknown"}` };
  }
  const insertedMessageId: string | null = insertedMsg?.id ?? null;

  await supabase
    .from("message_threads")
    .update({
      whatsapp_last_inbound_at: new Date().toISOString(),
      last_inbound_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", threadId);

  // 11) Notificação
  await notifyContactOwner(
    supabase, endpoint.organization_id, contactOwnerId,
    profileName, fromE164, content, mediaType, threadId,
  );

  // 12) Activity
  await insertActivity(
    supabase, endpoint.organization_id, contactId, content, mediaType,
  );

  // 13) AI agent ou needs_human_attention
  await triggerAiAgentOrFlagHuman(
    supabase, endpoint.organization_id, threadId, contactId, content,
  );

  return { messageId: insertedMessageId, threadId, error: null };
}

async function handleStatus(
  supabase: any, endpoint: any, st: any,
): Promise<{ messageId: string | null; error: string | null }> {
  const wamid = st.id;
  const status = st.status;
  if (!wamid || !status) return { messageId: null, error: "missing_wamid_or_status" };

  const update: Record<string, any> = { whatsapp_status: status };
  if (status === "failed" && st.errors?.length) {
    update.error_code = String(st.errors[0]?.code ?? "");
    update.error_message = st.errors[0]?.message ?? "Meta delivery failed";
  }
  const { data: updated, error } = await supabase
    .from("messages")
    .update(update)
    .eq("whatsapp_message_sid", wamid)
    .eq("organization_id", endpoint.organization_id)
    .select("id");
  if (error) return { messageId: null, error: error.message ?? "status_update_error" };
  return { messageId: updated?.[0]?.id ?? null, error: null };
}

// ============================================================
// PR-B: Observabilidade — persistência raw em integration_inbound_events
// ============================================================
async function recordInboundEvent(
  supabase: any,
  params: {
    organizationId: string | null;
    endpointId: string | null;
    phoneNumberId: string | null;
    wabaId: string | null;
    fromE164: string | null;
    messageType: string | null;
    wamid: string | null;
    contextId: string | null;
    threadId?: string | null;
    signatureValid: boolean;
    rawPayload: any;
    rawHeaders: Record<string, string>;
    kind: "message" | "status" | "unknown";
  },
): Promise<string | null> {
  try {
    const idemKey = params.kind === "status"
      ? `meta:${params.wamid ?? "no-wamid"}:status`
      : `meta:${params.wamid ?? crypto.randomUUID()}`;

    const { data, error } = await supabase
      .from("integration_inbound_events")
      .insert({
        organization_id: params.organizationId,
        integration_slug: "meta-whatsapp-cloud",
        source_event: `${params.kind}:${params.messageType ?? "unknown"}`,
        external_id: params.wamid,
        idempotency_key: idemKey,
        raw_payload: params.rawPayload,
        raw_headers: {
          phone_number_id: params.phoneNumberId,
          waba_id: params.wabaId,
          from: params.fromE164,
          endpoint_id: params.endpointId,
          thread_id: params.threadId ?? null,
          ...params.rawHeaders,
        },
        http_method: "POST",
        request_path: "/meta-whatsapp-webhook",
        received_at: new Date().toISOString(),
        process_status: "received",
        signature_valid: params.signatureValid,
        signature_algo: "sha256",
        aggregate_type: params.kind === "status" ? "message_status" : "whatsapp_message",
        aggregate_id: params.threadId ?? null,
        correlation_id: params.contextId ?? null,
        handler_key: "meta-whatsapp-webhook",
        parser_function: "meta-whatsapp-webhook",
        parser_version: "v1",
      })
      .select("id")
      .single();

    if (error) {
      console.error("[meta-wa-webhook] audit_insert_error", { error, wamid: params.wamid });
      return null;
    }
    return data?.id ?? null;
  } catch (e) {
    // Auditoria nunca deve bloquear o webhook
    console.error("[meta-wa-webhook] audit_insert_exception", e);
    return null;
  }
}

async function updateInboundEventStatus(
  supabase: any,
  auditId: string | null,
  fields: {
    processStatus: "processed" | "failed" | "skipped";
    processError?: string | null;
    resultingMessageId?: string | null;
    resultingThreadId?: string | null;
  },
): Promise<void> {
  if (!auditId) return;
  try {
    const patch: Record<string, any> = {
      process_status: fields.processStatus,
      processed_at: new Date().toISOString(),
    };
    if (fields.processError) patch.process_error = fields.processError;
    if (fields.resultingMessageId) patch.resulting_message_id = fields.resultingMessageId;
    if (fields.resultingThreadId) patch.aggregate_id = fields.resultingThreadId;

    const { error } = await supabase
      .from("integration_inbound_events")
      .update(patch)
      .eq("id", auditId);
    if (error) console.error("[meta-wa-webhook] audit_update_error", { error, auditId });
  } catch (e) {
    console.error("[meta-wa-webhook] audit_update_exception", e);
  }
}
