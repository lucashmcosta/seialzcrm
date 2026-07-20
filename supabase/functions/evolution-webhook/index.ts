// Edge Function: evolution-webhook
// Fase 6A — Ingest inbound real (Piloto Viagi).
//
// Reutiliza a mesma arquitetura de ingest utilizada por Meta/Twilio:
//   • integration_inbound_events → idempotência persistente (UNIQUE).
//   • communication_endpoints (provider='evolution_api') → resolve org + settings.
//   • contacts / message_threads / messages → mesmos padrões de findOrCreate,
//     lookup ordenado por last_message_at, sender_type='contact', etc.
//   • ai_agents SDR + notifications + activities → mesmos triggers pós-insert.
//
// Escopo Fase 6A: SOMENTE inbound. Não envia mensagens, não altera dispatcher,
// composer, active_endpoint_id, Meta ou Twilio. Nenhum outro tenant pode
// receber tráfego (feature flag `evolution_api_enabled` habilitada apenas
// para Viagi).
//
// Eventos processados:
//   • CONNECTION_UPDATE      → atualiza evolution_instances (Fase 5).
//   • QRCODE_UPDATED         → atualiza evolution_instances (Fase 5).
//   • MESSAGES_UPSERT        → ingest inbound (novo — Fase 6A).
//   • MESSAGES_UPDATE        → status/receipt update (novo — Fase 6A).
//   • MESSAGE_RECEIPT_UPDATE → status/receipt update (novo — Fase 6A).
//
// verify_jwt=false; auth em código via EVOLUTION_WEBHOOK_SECRET.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient, SupabaseClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { featureFlagEnabled } from "../_shared/feature-flags.ts";
import { logEvolution, newRequestId } from "../_shared/evolution/logger.ts";
import { callerKey, rateLimit } from "../_shared/evolution/rate-limit.ts";
import {
  EVOLUTION_WEBHOOK_CONTRACT_VERSION,
  EvolutionWebhookEnvelope,
} from "../_shared/evolution/types.ts";

const FN = "evolution-webhook" as const;
const FLAG = "evolution_api_enabled";
const INTEGRATION_SLUG = "evolution_api";
const PROVIDER = "evolution_api";

const RL_LIMIT = 120;
const RL_WINDOW_MS = 60_000;
const INBOUND_EVENT_TTL_MS = 7 * 24 * 60 * 60_000;

const STATE_EVENTS = new Set(["CONNECTION_UPDATE", "QRCODE_UPDATED"]);
const MESSAGE_UPSERT_EVENTS = new Set(["MESSAGES_UPSERT"]);
const MESSAGE_STATUS_EVENTS = new Set([
  "MESSAGES_UPDATE",
  "MESSAGE_RECEIPT_UPDATE",
]);
const ALL_KNOWN = new Set<string>([
  ...STATE_EVENTS,
  ...MESSAGE_UPSERT_EVENTS,
  ...MESSAGE_STATUS_EVENTS,
]);

// ---------------------------------------------------------------------------
// Helpers utilitários
// ---------------------------------------------------------------------------

function json(status: number, body: Record<string, unknown>, extra?: HeadersInit): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "content-type": "application/json", ...(extra ?? {}) },
  });
}

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function extractInboundToken(req: Request): string | null {
  const h1 = req.headers.get("x-evolution-webhook-secret");
  if (h1) return h1;
  const h2 = req.headers.get("x-evolution-token");
  if (h2) return h2;
  const h3 = req.headers.get("apikey");
  if (h3) return h3;
  try {
    const url = new URL(req.url);
    const q = url.searchParams.get("token");
    if (q) return q;
  } catch { /* noop */ }
  return null;
}

function isString(v: unknown): v is string {
  return typeof v === "string";
}

// Normaliza (à la meta-whatsapp-webhook) variações BR do 9º dígito para
// evitar contatos duplicados quando a base foi importada com/sem o "9".
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

// remoteJid "5511999999999@s.whatsapp.net" → "+5511999999999".
// Retorna null para grupos ("@g.us"), broadcast, status@broadcast, etc.
function jidToE164(jid: string | null | undefined): string | null {
  if (!jid || !isString(jid)) return null;
  if (jid.endsWith("@g.us")) return null;
  if (jid === "status@broadcast") return null;
  const at = jid.indexOf("@");
  const raw = at >= 0 ? jid.slice(0, at) : jid;
  const digits = raw.replace(/[^\d]/g, "");
  if (!digits) return null;
  return "+" + digits;
}

type MediaKind = "image" | "audio" | "video" | "document" | "sticker";
const MEDIA_KINDS: MediaKind[] = ["image", "audio", "video", "document", "sticker"];

function placeholderForInbound(kind: MediaKind): string {
  switch (kind) {
    case "audio": return "[Áudio]";
    case "image": return "[Imagem]";
    case "video": return "[Vídeo]";
    case "document": return "[Documento]";
    case "sticker": return "[Sticker]";
  }
}

function extFromMime(mime: string): string {
  const m = (mime || "").toLowerCase().split(";")[0].trim();
  const map: Record<string, string> = {
    "audio/ogg": "ogg", "audio/mpeg": "mp3", "audio/mp4": "m4a", "audio/aac": "aac",
    "audio/wav": "wav", "audio/amr": "amr", "audio/webm": "webm",
    "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp",
    "video/mp4": "mp4", "video/3gpp": "3gp",
    "application/pdf": "pdf",
    "text/plain": "txt", "text/csv": "csv",
  };
  return map[m] || "bin";
}

// ---------------------------------------------------------------------------
// Interpretação da mensagem Baileys/Evolution
// ---------------------------------------------------------------------------

interface ParsedMessage {
  waMessageId: string;      // key.id
  remoteJid: string;        // key.remoteJid
  fromMe: boolean;
  participantJid: string | null;
  pushName: string | null;
  timestampMs: number;
  content: string;          // texto ou placeholder
  mediaKind: MediaKind | null;
  mediaMime: string | null;
  mediaFileName: string | null;
  mediaCaption: string | null;
  quotedId: string | null;  // contextInfo.stanzaId
  rawMessage: Record<string, unknown>;
}

// Extrai o payload Baileys real de dentro de `data.message`.
// Trata alguns wrappers comuns (ephemeralMessage, viewOnceMessageV2).
function unwrapMessage(msg: Record<string, unknown> | null | undefined):
  Record<string, unknown> | null
{
  if (!msg || typeof msg !== "object") return null;
  let cur = msg as Record<string, unknown>;
  for (let i = 0; i < 4; i++) {
    if ("ephemeralMessage" in cur && typeof (cur.ephemeralMessage as any)?.message === "object") {
      cur = ((cur.ephemeralMessage as any).message) as Record<string, unknown>;
      continue;
    }
    if ("viewOnceMessage" in cur && typeof (cur.viewOnceMessage as any)?.message === "object") {
      cur = ((cur.viewOnceMessage as any).message) as Record<string, unknown>;
      continue;
    }
    if ("viewOnceMessageV2" in cur && typeof (cur.viewOnceMessageV2 as any)?.message === "object") {
      cur = ((cur.viewOnceMessageV2 as any).message) as Record<string, unknown>;
      continue;
    }
    break;
  }
  return cur;
}

function parseMessagesUpsert(data: unknown): ParsedMessage | null {
  if (!data || typeof data !== "object") return null;
  const d = data as Record<string, unknown>;
  const key = (d.key ?? {}) as Record<string, unknown>;
  const waMessageId = isString(key.id) ? key.id : null;
  const remoteJid = isString(key.remoteJid) ? key.remoteJid : null;
  if (!waMessageId || !remoteJid) return null;
  const fromMe = key.fromMe === true;
  const participantJid = isString(key.participant) ? key.participant : null;
  const pushName = isString(d.pushName) ? d.pushName : null;
  const tsRaw = d.messageTimestamp;
  const tsSec = typeof tsRaw === "number"
    ? tsRaw
    : (typeof tsRaw === "string" ? parseInt(tsRaw, 10) : NaN);
  const timestampMs = Number.isFinite(tsSec) && tsSec > 0
    ? tsSec * 1000
    : Date.now();

  const message = unwrapMessage(d.message as Record<string, unknown> | undefined);
  let content = "";
  let mediaKind: MediaKind | null = null;
  let mediaMime: string | null = null;
  let mediaFileName: string | null = null;
  let mediaCaption: string | null = null;
  let quotedId: string | null = null;

  if (message) {
    // Texto simples
    if (isString(message.conversation)) {
      content = message.conversation as string;
    }
    const ext = message.extendedTextMessage as Record<string, unknown> | undefined;
    if (!content && ext && isString(ext.text)) {
      content = ext.text as string;
    }
    const extCtx = ext?.contextInfo as Record<string, unknown> | undefined;
    if (extCtx && isString(extCtx.stanzaId)) quotedId = extCtx.stanzaId as string;

    // Mídia
    const mediaMap: Array<[MediaKind, string]> = [
      ["image", "imageMessage"],
      ["audio", "audioMessage"],
      ["video", "videoMessage"],
      ["document", "documentMessage"],
      ["sticker", "stickerMessage"],
    ];
    for (const [kind, k] of mediaMap) {
      const m = message[k] as Record<string, unknown> | undefined;
      if (m && typeof m === "object") {
        mediaKind = kind;
        mediaMime = isString(m.mimetype) ? m.mimetype as string : null;
        mediaFileName = isString(m.fileName) ? m.fileName as string : null;
        mediaCaption = isString(m.caption) ? m.caption as string : null;
        const ctx = m.contextInfo as Record<string, unknown> | undefined;
        if (ctx && isString(ctx.stanzaId) && !quotedId) quotedId = ctx.stanzaId as string;
        if (!content) {
          if (mediaCaption) content = mediaCaption;
          else if (kind === "document" && mediaFileName) content = mediaFileName;
          else content = placeholderForInbound(kind);
        }
        break;
      }
    }

    // Reaction
    const reaction = message.reactionMessage as Record<string, unknown> | undefined;
    if (!mediaKind && reaction && isString(reaction.text)) {
      content = `${reaction.text} (reação)`;
    }

    // Location
    const loc = message.locationMessage as Record<string, unknown> | undefined;
    if (!mediaKind && loc) {
      const name = isString(loc.name) ? loc.name : null;
      const addr = isString(loc.address) ? loc.address : null;
      const lat = typeof loc.degreesLatitude === "number" ? loc.degreesLatitude : null;
      const lng = typeof loc.degreesLongitude === "number" ? loc.degreesLongitude : null;
      const label = name || addr || (lat != null && lng != null ? `${lat},${lng}` : null);
      content = `📍 Localização${label ? `: ${label}` : ""}`;
    }

    // Contact card
    const contact = message.contactMessage as Record<string, unknown> | undefined;
    if (!mediaKind && !content && contact) {
      const dn = isString(contact.displayName) ? contact.displayName : "";
      content = `👤 Contato compartilhado${dn ? `: ${dn}` : ""}`;
    }

    // Button/list reply
    const btn = message.buttonsResponseMessage as Record<string, unknown> | undefined;
    if (!content && btn && isString(btn.selectedDisplayText)) {
      content = btn.selectedDisplayText as string;
    }
    const list = message.listResponseMessage as Record<string, unknown> | undefined;
    if (!content && list && isString(list.title)) {
      content = list.title as string;
    }
  }

  if (!content) {
    content = `[mensagem não suportada]`;
  }

  return {
    waMessageId,
    remoteJid,
    fromMe,
    participantJid,
    pushName,
    timestampMs,
    content,
    mediaKind,
    mediaMime,
    mediaFileName,
    mediaCaption,
    quotedId,
    rawMessage: (message ?? (d.message as Record<string, unknown>) ?? {}) as Record<string, unknown>,
  };
}

// ---------------------------------------------------------------------------
// Inbound settings (mesmo modelo que meta-whatsapp-webhook)
// ---------------------------------------------------------------------------

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

async function resolveInboundSettings(
  service: SupabaseClient,
  endpointId: string,
): Promise<{ settings: InboundSettings; source: string }> {
  const { data: epRow } = await service
    .from("communication_endpoints")
    .select("inbound_settings, organization_integration_id")
    .eq("id", endpointId)
    .maybeSingle();
  const epInbound = ((epRow as any)?.inbound_settings ?? null) as InboundSettings | null;
  if (epInbound) {
    return { settings: { ...DEFAULT_INBOUND_SETTINGS, ...epInbound }, source: "endpoint" };
  }
  const oiId = (epRow as any)?.organization_integration_id as string | null | undefined;
  if (oiId) {
    const { data: oi } = await service
      .from("organization_integrations")
      .select("whatsapp_inbound_settings")
      .eq("id", oiId)
      .maybeSingle();
    const intInbound = ((oi as any)?.whatsapp_inbound_settings ?? null) as InboundSettings | null;
    if (intInbound) {
      return { settings: { ...DEFAULT_INBOUND_SETTINGS, ...intInbound }, source: "integration" };
    }
  }
  return { settings: { ...DEFAULT_INBOUND_SETTINGS }, source: "default" };
}

async function findOrCreateContact(
  service: SupabaseClient,
  organizationId: string,
  fromE164: string,
  profileName: string,
  inbound: InboundSettings,
): Promise<{ contactId: string | null; contactOwnerId: string | null; created: boolean }> {
  const variations = normalizePhoneForSearch(fromE164);
  const or = variations.map((p) => `phone.eq.${p}`).join(",");
  const { data: existing } = await service
    .from("contacts")
    .select("id, owner_user_id")
    .eq("organization_id", organizationId)
    .or(or)
    .is("deleted_at", null)
    .limit(1)
    .maybeSingle();
  if (existing) {
    return {
      contactId: (existing as any).id as string,
      contactOwnerId: ((existing as any).owner_user_id as string | null) ?? null,
      created: false,
    };
  }
  if (!inbound.auto_create_contact) {
    return { contactId: null, contactOwnerId: null, created: false };
  }
  const contactName = profileName || `WhatsApp ${fromE164}`;
  const { data: created, error } = await service
    .from("contacts")
    .insert({
      organization_id: organizationId,
      full_name: contactName,
      phone: fromE164,
      source: "whatsapp",
      lifecycle_stage: inbound.default_lifecycle_stage || "lead",
    })
    .select("id, owner_user_id")
    .single();
  if (error || !created) return { contactId: null, contactOwnerId: null, created: false };
  return {
    contactId: (created as any).id as string,
    contactOwnerId: ((created as any).owner_user_id as string | null) ?? null,
    created: true,
  };
}

async function autoCreateOpportunityIfEnabled(
  service: SupabaseClient,
  organizationId: string,
  contactId: string,
  contactName: string,
  contactOwnerId: string | null,
  inbound: InboundSettings,
): Promise<void> {
  if (!inbound.auto_create_opportunity) return;
  try {
    const { data: openOpp } = await service
      .from("opportunities")
      .select("id")
      .eq("organization_id", organizationId)
      .eq("contact_id", contactId)
      .eq("status", "open")
      .is("deleted_at", null)
      .limit(1)
      .maybeSingle();
    if (openOpp) return;

    let stageId: string | null = null;
    if (inbound.default_stage_id) {
      const { data: v } = await service
        .from("pipeline_stages")
        .select("id")
        .eq("id", inbound.default_stage_id)
        .eq("organization_id", organizationId)
        .maybeSingle();
      if (v) stageId = (v as any).id;
    }
    if (!stageId) {
      const { data: first } = await service
        .from("pipeline_stages")
        .select("id")
        .eq("organization_id", organizationId)
        .order("order_index", { ascending: true })
        .limit(1)
        .maybeSingle();
      if (first) stageId = (first as any).id;
    }
    if (!stageId) return;

    const oppData: Record<string, unknown> = {
      organization_id: organizationId,
      contact_id: contactId,
      title: `Oportunidade - ${contactName}`,
      status: "open",
      pipeline_stage_id: stageId,
    };
    if (contactOwnerId) oppData.owner_user_id = contactOwnerId;
    await service.from("opportunities").insert(oppData);
  } catch (e) {
    logEvolution("warn", { fn: FN, code: "INTERNAL_ERROR", message: `auto_opp_failed: ${(e as Error).message}` });
  }
}

async function findOrCreateThread(
  service: SupabaseClient,
  organizationId: string,
  contactId: string,
  endpointId: string,
  inboundAt: string,
): Promise<string | null> {
  // 1) Match preferencial: thread já vinculada a este endpoint Evolution.
  const { data: sameEndpoint } = await service
    .from("message_threads")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("contact_id", contactId)
    .eq("channel", "whatsapp")
    .eq("primary_endpoint_id", endpointId)
    .order("last_message_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
    .limit(1);
  const existingSame = (sameEndpoint as Array<{ id: string }> | null)?.[0]?.id;
  if (existingSame) return existingSame;

  // 2) Match de migração de provider: reutilizar a thread WhatsApp mais recente
  //    do contato na mesma org, mesmo que aponte pra Twilio/Meta. Migra
  //    primary_endpoint_id para o endpoint Evolution — histórico intacto.
  //    O divisor "📞 Número alterado" é renderizado automaticamente em
  //    MessagesList.tsx quando o endpoint_id da nova mensagem difere do
  //    da última mensagem anterior. Nada de mensagem de sistema aqui.
  const { data: anyThread } = await service
    .from("message_threads")
    .select("id, primary_endpoint_id")
    .eq("organization_id", organizationId)
    .eq("contact_id", contactId)
    .eq("channel", "whatsapp")
    .order("last_message_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
    .limit(1);
  const migratable = (anyThread as Array<{ id: string; primary_endpoint_id: string | null }> | null)?.[0];
  if (migratable) {
    const prevEndpoint = migratable.primary_endpoint_id;
    const { error: updErr } = await service
      .from("message_threads")
      .update({
        primary_endpoint_id: endpointId,
        whatsapp_last_inbound_at: inboundAt,
        last_inbound_at: inboundAt,
      })
      .eq("id", migratable.id);
    if (!updErr) {
      logEvolution("info", {
        fn: "findOrCreateThread",
        code: "THREAD_PROVIDER_MIGRATED",
        message: "reused existing whatsapp thread; migrated primary_endpoint_id",
        threadId: migratable.id,
        previousEndpointId: prevEndpoint,
        newEndpointId: endpointId,
      });
    }
    return migratable.id;
  }

  // 3) Fallback: nenhuma thread WhatsApp existente — criar nova.
  const { data: created } = await service
    .from("message_threads")
    .insert({
      organization_id: organizationId,
      contact_id: contactId,
      channel: "whatsapp",
      subject: "WhatsApp",
      primary_endpoint_id: endpointId,
      whatsapp_last_inbound_at: inboundAt,
      last_inbound_at: inboundAt,
    })
    .select("id")
    .single();
  return (created as { id: string } | null)?.id ?? null;
}

async function resolveReplyToMessageId(
  service: SupabaseClient,
  organizationId: string,
  waMessageId: string | null,
): Promise<string | null> {
  if (!waMessageId) return null;
  const { data } = await service
    .from("messages")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("whatsapp_message_sid", waMessageId)
    .maybeSingle();
  return (data as { id: string } | null)?.id ?? null;
}

async function notifyContactOwner(
  service: SupabaseClient,
  organizationId: string,
  contactOwnerId: string | null,
  profileName: string,
  fromE164: string,
  body: string,
  mediaType: MediaKind | null,
  threadId: string,
): Promise<void> {
  if (!contactOwnerId) return;
  let notif = body;
  if (mediaType && !body) {
    notif = mediaType === "audio" ? "🎵 Áudio"
      : mediaType === "image" ? "📷 Imagem"
      : mediaType === "video" ? "🎬 Vídeo"
      : mediaType === "sticker" ? "🩹 Sticker"
      : "📎 Mídia";
  }
  await service.from("notifications").insert({
    user_id: contactOwnerId,
    organization_id: organizationId,
    type: "whatsapp_message",
    title: "Nova mensagem WhatsApp",
    body: `${profileName || fromE164}: ${notif.slice(0, 100)}${notif.length > 100 ? "..." : ""}`,
    entity_type: "message",
    entity_id: threadId,
  });
}

async function insertActivity(
  service: SupabaseClient,
  organizationId: string,
  contactId: string,
  body: string,
  mediaType: MediaKind | null,
): Promise<void> {
  const title = mediaType ? `Mensagem WhatsApp recebida (${mediaType})` : "Mensagem WhatsApp recebida";
  await service.from("activities").insert({
    organization_id: organizationId,
    contact_id: contactId,
    activity_type: "message",
    title,
    body: body.slice(0, 200) || (mediaType ? "[Mídia]" : ""),
    occurred_at: new Date().toISOString(),
  });
}

async function triggerAiAgentOrFlagHuman(
  service: SupabaseClient,
  organizationId: string,
  threadId: string,
  contactId: string,
  body: string,
): Promise<void> {
  const { data: agents } = await service
    .from("ai_agents")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("agent_type", "sdr")
    .eq("is_enabled", true)
    .order("created_at", { ascending: false })
    .limit(1);
  const agent = (agents as Array<{ id: string }> | null)?.[0];
  if (agent && body) {
    const url = Deno.env.get("SUPABASE_URL");
    const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    fetch(`${url}/functions/v1/ai-agent-respond`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({ agentId: agent.id, contactId, threadId, message: body }),
    }).catch(() => {});
  } else if (!agent) {
    await service.from("message_threads").update({
      needs_human_attention: true,
      updated_at: new Date().toISOString(),
    }).eq("id", threadId);
  }
}

// ---------------------------------------------------------------------------
// Mídia — download best-effort via Evolution API
// ---------------------------------------------------------------------------

async function downloadEvolutionMedia(
  instanceName: string,
  rawEnvelopeData: unknown,
): Promise<{ base64: string; mimetype: string; fileName: string | null } | null> {
  const base = Deno.env.get("EVOLUTION_BASE_URL");
  const apiKey = Deno.env.get("EVOLUTION_GLOBAL_API_KEY");
  if (!base || !apiKey) return null;
  try {
    const url = `${base.replace(/\/+$/, "")}/chat/getBase64FromMediaMessage/${encodeURIComponent(instanceName)}`;
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), 15_000);
    const res = await fetch(url, {
      method: "POST",
      headers: { "apikey": apiKey, "content-type": "application/json" },
      body: JSON.stringify({ message: rawEnvelopeData, convertToMp4: false }),
      signal: controller.signal,
    });
    clearTimeout(t);
    if (!res.ok) return null;
    const j = await res.json() as Record<string, unknown>;
    const base64 = isString(j.base64) ? j.base64 as string : null;
    const mimetype = isString(j.mimetype) ? j.mimetype as string : "application/octet-stream";
    const fileName = isString(j.fileName) ? j.fileName as string : null;
    if (!base64) return null;
    return { base64, mimetype, fileName };
  } catch {
    return null;
  }
}

function base64ToBytes(b64: string): Uint8Array {
  const clean = b64.replace(/^data:[^;]+;base64,/, "");
  const bin = atob(clean);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

// ---------------------------------------------------------------------------
// Idempotência
// ---------------------------------------------------------------------------

function idempotencyKey(env: EvolutionWebhookEnvelope): string {
  const inst = isString(env.instance) ? env.instance : "?";
  const evt = isString(env.event) ? env.event.toUpperCase() : "?";
  const data = (env.data ?? {}) as Record<string, unknown>;
  const id =
    (typeof (data as { key?: { id?: string } }).key?.id === "string" &&
      (data as { key: { id: string } }).key.id) ||
    (isString((data as { id?: string }).id) ? (data as { id: string }).id : "") ||
    env.date_time || "";
  return `${inst}|${evt}|${id}`;
}

async function recordInboundEvent(
  service: SupabaseClient,
  args: {
    envelope: EvolutionWebhookEnvelope;
    idKey: string;
    orgId: string | null;
    req: Request;
    handlerKey: string;
  },
): Promise<
  | { duplicate: true }
  | { duplicate: false; id: string }
  | { error: string }
> {
  const { envelope, idKey, orgId, req, handlerKey } = args;
  const now = new Date();
  const expiresAt = new Date(now.getTime() + INBOUND_EVENT_TTL_MS);
  const data = (envelope.data ?? {}) as Record<string, unknown>;
  const externalId =
    (typeof (data as { key?: { id?: string } }).key?.id === "string"
      ? (data as { key: { id: string } }).key.id
      : (isString((data as { id?: string }).id) ? (data as { id: string }).id : null));

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    ?? req.headers.get("cf-connecting-ip")
    ?? req.headers.get("x-real-ip")
    ?? null;

  const { data: inserted, error } = await service
    .from("integration_inbound_events")
    .insert({
      organization_id: orgId,
      integration_slug: INTEGRATION_SLUG,
      source_event: isString(envelope.event) ? envelope.event : "unknown",
      external_id: externalId,
      idempotency_key: idKey,
      raw_payload: envelope as unknown as Record<string, unknown>,
      headers: {},
      http_method: "POST",
      request_path: "/functions/v1/evolution-webhook",
      received_at: now.toISOString(),
      process_status: "received",
      parser_function: FN,
      parser_version: 1,
      parse_attempts: 1,
      last_attempt_at: now.toISOString(),
      expires_at: expiresAt.toISOString(),
      event_version: 1,
      aggregate_type: "whatsapp_message",
      aggregate_id: isString(envelope.instance) ? envelope.instance : null,
      source_ip: ip,
      handler_key: handlerKey,
      shadow_mode: false,
    })
    .select("id")
    .maybeSingle();

  if (error) {
    if ((error as { code?: string }).code === "23505") return { duplicate: true };
    return { error: error.message };
  }
  if (!inserted) return { error: "insert_returned_no_row" };
  return { duplicate: false, id: (inserted as { id: string }).id };
}

async function markInboundEvent(
  service: SupabaseClient,
  auditId: string | null,
  patch: {
    processStatus: "processed" | "failed" | "skipped";
    processError?: string | null;
    resultingMessageId?: string | null;
    resultingThreadId?: string | null;
  },
): Promise<void> {
  if (!auditId) return;
  const now = new Date().toISOString();
  const update: Record<string, unknown> = {
    process_status: patch.processStatus,
    processed_at: now,
  };
  if (patch.processError) update.process_error = patch.processError;
  if (patch.resultingMessageId) update.resulting_message_id = patch.resultingMessageId;
  if (patch.resultingThreadId) update.aggregate_id = patch.resultingThreadId;
  await service.from("integration_inbound_events").update(update).eq("id", auditId);
}

// ---------------------------------------------------------------------------
// Resolução instância → endpoint
// ---------------------------------------------------------------------------

interface InstanceContext {
  instanceRowId: string;
  organizationId: string;
  endpointId: string;
}

async function resolveInstance(
  service: SupabaseClient,
  instanceName: string,
): Promise<InstanceContext | null> {
  const { data } = await service
    .from("evolution_instances")
    .select("id, organization_id, endpoint_id")
    .eq("instance_name", instanceName)
    .maybeSingle();
  if (!data) return null;
  return {
    instanceRowId: (data as any).id as string,
    organizationId: (data as any).organization_id as string,
    endpointId: (data as any).endpoint_id as string,
  };
}

// ---------------------------------------------------------------------------
// Efeitos colaterais em evolution_instances (Fase 5 — inalterado)
// ---------------------------------------------------------------------------

function extractConnectionState(env: EvolutionWebhookEnvelope):
  "open" | "connecting" | "close" | "unknown" | null {
  const d = (env.data ?? {}) as Record<string, unknown>;
  const raw = d.state ?? d.status ?? d.connection ?? null;
  if (!isString(raw)) return null;
  const s = raw.toLowerCase();
  if (s === "open" || s === "connected") return "open";
  if (s === "connecting" || s === "qr" || s === "pairing") return "connecting";
  if (s === "close" || s === "closed" || s === "disconnected" || s === "logout") return "close";
  return "unknown";
}
function extractQrExpiresAt(env: EvolutionWebhookEnvelope): Date {
  const d = (env.data ?? {}) as Record<string, unknown>;
  const ttlRaw = d.ttl ?? d.expires_in ?? d.expiresIn;
  const ttlSec = typeof ttlRaw === "number" && ttlRaw > 0 && ttlRaw < 3600 ? ttlRaw : 60;
  return new Date(Date.now() + ttlSec * 1000);
}
function extractInstanceIdRemote(env: EvolutionWebhookEnvelope): string | null {
  const d = (env.data ?? {}) as Record<string, unknown>;
  const inst = (d.instance ?? d.instanceId ?? d.instance_id) as
    | { instanceId?: string; id?: string } | string | undefined;
  if (isString(inst)) return inst;
  if (inst && typeof inst === "object") {
    if (isString(inst.instanceId)) return inst.instanceId;
    if (isString(inst.id)) return inst.id;
  }
  return null;
}
async function applyStateEvent(
  service: SupabaseClient,
  instanceRowId: string,
  event: string,
  envelope: EvolutionWebhookEnvelope,
): Promise<void> {
  const now = new Date().toISOString();
  const patch: Record<string, unknown> = { last_state_checked_at: now, updated_at: now };
  if (event === "CONNECTION_UPDATE") {
    const state = extractConnectionState(envelope);
    if (state) patch.last_known_state = state;
    const remoteId = extractInstanceIdRemote(envelope);
    if (remoteId) patch.instance_id_remote = remoteId;
  } else if (event === "QRCODE_UPDATED") {
    patch.last_qr_expires_at = extractQrExpiresAt(envelope).toISOString();
    patch.last_known_state = "connecting";
  }
  await service.from("evolution_instances").update(patch).eq("id", instanceRowId);
}

// ---------------------------------------------------------------------------
// Ingest inbound (MESSAGES_UPSERT)
// ---------------------------------------------------------------------------

async function ingestInboundMessage(
  service: SupabaseClient,
  ctx: InstanceContext,
  envelope: EvolutionWebhookEnvelope,
  parsed: ParsedMessage,
): Promise<{ messageId: string | null; threadId: string | null; error: string | null }> {
  const fromE164 = jidToE164(parsed.remoteJid);
  if (!fromE164) {
    return { messageId: null, threadId: null, error: "skipped_group_or_broadcast" };
  }

  // 1) Inbound settings
  const { settings } = await resolveInboundSettings(service, ctx.endpointId);

  // 2) Contato
  const { contactId, contactOwnerId, created } = await findOrCreateContact(
    service, ctx.organizationId, fromE164, parsed.pushName ?? "", settings,
  );
  if (!contactId) {
    return { messageId: null, threadId: null, error: "no_contact" };
  }

  // 3) Auto-oportunidade
  if (created) {
    await autoCreateOpportunityIfEnabled(
      service, ctx.organizationId, contactId,
      parsed.pushName || `WhatsApp ${fromE164}`,
      contactOwnerId, settings,
    );
  }

  // 4) Thread
  const inboundAtIso = new Date(parsed.timestampMs).toISOString();
  const threadId = await findOrCreateThread(
    service, ctx.organizationId, contactId, ctx.endpointId, inboundAtIso,
  );
  if (!threadId) {
    return { messageId: null, threadId: null, error: "no_thread_id" };
  }

  // 5) Idempotência de messages: se já existe wamid nesta org, no-op.
  const { data: existingMsg } = await service
    .from("messages")
    .select("id, thread_id")
    .eq("organization_id", ctx.organizationId)
    .eq("whatsapp_message_sid", parsed.waMessageId)
    .maybeSingle();
  if (existingMsg) {
    return {
      messageId: (existingMsg as any).id,
      threadId: (existingMsg as any).thread_id ?? threadId,
      error: null,
    };
  }

  // 6) Mídia (best-effort)
  let mediaUrls: string[] | null = null;
  const mediaInfo: Record<string, unknown> = {};
  if (parsed.mediaKind) {
    mediaInfo.media_kind = parsed.mediaKind;
    mediaInfo.mime_type = parsed.mediaMime;
    mediaInfo.file_name = parsed.mediaFileName;
    mediaInfo.caption = parsed.mediaCaption;
    try {
      const dl = await downloadEvolutionMedia(
        (envelope.instance as string), envelope.data,
      );
      if (dl) {
        const mime = dl.mimetype || parsed.mediaMime || "application/octet-stream";
        const bytes = base64ToBytes(dl.base64);
        const ext = extFromMime(mime);
        const path = `${ctx.organizationId}/evolution-inbound/${parsed.waMessageId}.${ext}`;
        const { error: upErr } = await service.storage
          .from("whatsapp-media")
          .upload(path, bytes, { contentType: mime, upsert: true });
        if (!upErr) {
          const { data: pub } = service.storage.from("whatsapp-media").getPublicUrl(path);
          if (pub?.publicUrl) mediaUrls = [pub.publicUrl];
          mediaInfo.storage_path = path;
          mediaInfo.mime_type = mime;
        } else {
          mediaInfo.media_upload_error = upErr.message;
        }
      } else {
        mediaInfo.media_download_error = "download_failed";
      }
    } catch (e) {
      mediaInfo.media_download_error = (e as Error).message;
    }
  }

  // 7) Reply-to
  const replyToId = await resolveReplyToMessageId(service, ctx.organizationId, parsed.quotedId);

  // 8) Insert
  const { data: inserted, error: insErr } = await service
    .from("messages")
    .insert({
      organization_id: ctx.organizationId,
      thread_id: threadId,
      content: parsed.content,
      direction: "inbound",
      whatsapp_message_sid: parsed.waMessageId,
      whatsapp_status: "delivered",
      endpoint_id: ctx.endpointId,
      sender_type: "contact",
      sender_name: parsed.pushName ?? null,
      media_urls: mediaUrls,
      media_type: parsed.mediaKind,
      reply_to_message_id: replyToId,
      sent_at: new Date(parsed.timestampMs).toISOString(),
      metadata: {
        evolution: {
          ...mediaInfo,
          push_name: parsed.pushName,
          remote_jid: parsed.remoteJid,
          participant_jid: parsed.participantJid,
          raw: parsed.rawMessage,
        },
      },
    })
    .select("id")
    .single();

  if (insErr) {
    // Race: outra execução inseriu simultaneamente. Buscar e retornar.
    if ((insErr as { code?: string }).code === "23505") {
      const { data: raced } = await service
        .from("messages").select("id")
        .eq("organization_id", ctx.organizationId)
        .eq("whatsapp_message_sid", parsed.waMessageId)
        .maybeSingle();
      return { messageId: (raced as any)?.id ?? null, threadId, error: null };
    }
    return { messageId: null, threadId, error: `message_insert:${insErr.message}` };
  }
  const messageId = (inserted as { id: string }).id;

  // 9) Update thread markers
  const nowIso = new Date().toISOString();
  await service.from("message_threads").update({
    whatsapp_last_inbound_at: nowIso,
    last_inbound_at: nowIso,
    updated_at: nowIso,
  }).eq("id", threadId);

  // 10) Notificação + activity + AI trigger
  await notifyContactOwner(
    service, ctx.organizationId, contactOwnerId,
    parsed.pushName ?? "", fromE164, parsed.content, parsed.mediaKind, threadId,
  );
  await insertActivity(service, ctx.organizationId, contactId, parsed.content, parsed.mediaKind);
  await triggerAiAgentOrFlagHuman(service, ctx.organizationId, threadId, contactId, parsed.content);

  return { messageId, threadId, error: null };
}

// ---------------------------------------------------------------------------
// Status update (MESSAGES_UPDATE / MESSAGE_RECEIPT_UPDATE)
// ---------------------------------------------------------------------------

function mapEvolutionStatus(raw: unknown): string | null {
  if (typeof raw === "number") {
    // Baileys numeric statuses: 0 error, 1 pending, 2 sent(server ack),
    // 3 delivered, 4 read, 5 played.
    switch (raw) {
      case 0: return "failed";
      case 1: return "queued";
      case 2: return "sent";
      case 3: return "delivered";
      case 4: return "read";
      case 5: return "read";
      default: return null;
    }
  }
  if (!isString(raw)) return null;
  const s = raw.toLowerCase();
  if (s.includes("read") || s === "played") return "read";
  if (s.includes("deliver")) return "delivered";
  if (s === "sent" || s === "server_ack") return "sent";
  if (s.includes("fail") || s.includes("error")) return "failed";
  if (s === "pending" || s === "queued") return "queued";
  return null;
}

async function applyMessageStatus(
  service: SupabaseClient,
  ctx: InstanceContext,
  envelope: EvolutionWebhookEnvelope,
): Promise<{ messageId: string | null; error: string | null }> {
  const data = (envelope.data ?? {}) as Record<string, unknown>;
  const key = (data.key ?? {}) as Record<string, unknown>;
  const wamid = isString(key.id) ? key.id : (isString(data.id) ? data.id as string : null);
  if (!wamid) return { messageId: null, error: "missing_wamid" };
  const rawStatus = data.status ?? data.update ?? data.ack ?? null;
  const mapped = mapEvolutionStatus(
    // preferir campo primitivo; alguns eventos aninham em update.status
    (typeof rawStatus === "object" && rawStatus && "status" in (rawStatus as any))
      ? (rawStatus as any).status
      : rawStatus,
  );
  if (!mapped) return { messageId: null, error: "unmapped_status" };
  const { data: updated } = await service
    .from("messages")
    .update({ whatsapp_status: mapped })
    .eq("organization_id", ctx.organizationId)
    .eq("whatsapp_message_sid", wamid)
    .select("id");
  return { messageId: (updated as Array<{ id: string }> | null)?.[0]?.id ?? null, error: null };
}

// ---------------------------------------------------------------------------
// HTTP handler
// ---------------------------------------------------------------------------

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "METHOD_NOT_ALLOWED" });

  const requestId = newRequestId();

  // Rate limit
  const rl = rateLimit(callerKey(req, "evo-wh"), RL_LIMIT, RL_WINDOW_MS);
  if (!rl.allowed) {
    logEvolution("warn", { fn: FN, requestId, code: "RATE_LIMITED" });
    return json(429, { error: "RATE_LIMITED" }, { "retry-after": String(rl.retryAfterSec) });
  }

  // Auth
  const expected = Deno.env.get("EVOLUTION_WEBHOOK_SECRET");
  if (!expected) {
    logEvolution("error", { fn: FN, requestId, code: "MISSING_SECRET" });
    return json(503, { error: "MISSING_SECRET" });
  }
  const presented = extractInboundToken(req);
  if (!presented || !safeEqual(presented, expected)) {
    logEvolution("warn", { fn: FN, requestId, code: "UNAUTHORIZED" });
    return json(401, { error: "UNAUTHORIZED" });
  }

  // Parse
  let envelope: EvolutionWebhookEnvelope;
  try {
    envelope = await req.json() as EvolutionWebhookEnvelope;
  } catch {
    return json(400, { error: "INVALID_INPUT", message: "invalid JSON" });
  }
  if (!envelope || typeof envelope !== "object") return json(400, { error: "INVALID_INPUT" });

  const eventRaw = isString(envelope.event) ? envelope.event : null;
  const event = eventRaw
    // Evolution v2 envia com pontos (ex.: "messages.upsert"). Normalizamos.
    ? eventRaw.toUpperCase().replace(/\./g, "_")
    : null;
  const instance = isString(envelope.instance) ? envelope.instance : null;
  const knownEvent = event ? ALL_KNOWN.has(event) : false;

  const service = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // Resolve instância → organização
  const ctx = instance ? await resolveInstance(service, instance) : null;
  const orgId = ctx?.organizationId ?? null;

  // Feature flag (per-org quando conhecemos a org; global caso contrário)
  const enabled = await featureFlagEnabled(service, FLAG, orgId);
  if (!enabled) {
    logEvolution("info", { fn: FN, requestId, event: eventRaw ?? undefined, instanceName: instance ?? undefined, orgId, code: "FEATURE_DISABLED" });
    return json(202, {
      accepted: true, processed: false, reason: "FEATURE_DISABLED",
      contract: EVOLUTION_WEBHOOK_CONTRACT_VERSION,
    });
  }

  // Idempotência: 1 insert por (integration_slug, idempotency_key)
  const idKey = idempotencyKey(envelope);
  const recorded = await recordInboundEvent(service, {
    envelope, idKey, orgId, req,
    handlerKey: `evolution:${event ?? "unknown"}`,
  });
  if ("error" in recorded) {
    logEvolution("error", { fn: FN, requestId, event: eventRaw ?? undefined, instanceName: instance ?? undefined, code: "INTERNAL_ERROR", message: `inbound insert failed: ${recorded.error}` });
    return json(500, { error: "INTERNAL_ERROR" });
  }
  if (recorded.duplicate) {
    logEvolution("info", { fn: FN, requestId, event: eventRaw ?? undefined, instanceName: instance ?? undefined, code: "DUPLICATE_EVENT" });
    return json(200, { ok: true, duplicate: true, contract: EVOLUTION_WEBHOOK_CONTRACT_VERSION });
  }

  const auditId = recorded.id;

  // Sem instância registrada: apenas loga.
  if (!ctx) {
    await markInboundEvent(service, auditId, {
      processStatus: "skipped",
      processError: "instance_not_registered",
    });
    logEvolution("info", { fn: FN, requestId, event: eventRaw ?? undefined, instanceName: instance ?? undefined, message: "instance not registered — logged only" });
    return json(200, { ok: true, processed: false, known: knownEvent, contract: EVOLUTION_WEBHOOK_CONTRACT_VERSION });
  }

  // Efeito colateral por tipo de evento.
  try {
    if (event && STATE_EVENTS.has(event)) {
      await applyStateEvent(service, ctx.instanceRowId, event, envelope);
      await markInboundEvent(service, auditId, { processStatus: "processed" });
      return json(200, { ok: true, processed: true, kind: "state", contract: EVOLUTION_WEBHOOK_CONTRACT_VERSION });
    }

    if (event && MESSAGE_UPSERT_EVENTS.has(event)) {
      const parsed = parseMessagesUpsert(envelope.data);
      if (!parsed) {
        await markInboundEvent(service, auditId, { processStatus: "failed", processError: "parse_failed" });
        return json(200, { ok: true, processed: false, kind: "message", reason: "PARSE_FAILED" });
      }
      if (parsed.fromMe) {
        // Fase 6A não processa outbound. Também não persiste — só loga.
        await markInboundEvent(service, auditId, { processStatus: "skipped", processError: "fromMe_true_outbound_ignored_phase6a" });
        return json(200, { ok: true, processed: false, kind: "message", reason: "FROM_ME_SKIPPED" });
      }
      const result = await ingestInboundMessage(service, ctx, envelope, parsed);
      await markInboundEvent(service, auditId, {
        processStatus: result.error ? "failed" : "processed",
        processError: result.error ?? null,
        resultingMessageId: result.messageId,
        resultingThreadId: result.threadId,
      });
      logEvolution("info", { fn: FN, requestId, event: eventRaw ?? undefined, instanceName: instance ?? undefined, orgId, message: result.error ? `inbound_failed:${result.error}` : "inbound_ingested" });
      return json(200, {
        ok: true,
        processed: !result.error,
        kind: "message",
        message_id: result.messageId,
        thread_id: result.threadId,
        contract: EVOLUTION_WEBHOOK_CONTRACT_VERSION,
      });
    }

    if (event && MESSAGE_STATUS_EVENTS.has(event)) {
      const result = await applyMessageStatus(service, ctx, envelope);
      await markInboundEvent(service, auditId, {
        processStatus: result.error ? "failed" : "processed",
        processError: result.error ?? null,
        resultingMessageId: result.messageId,
      });
      return json(200, {
        ok: true,
        processed: !result.error,
        kind: "status",
        contract: EVOLUTION_WEBHOOK_CONTRACT_VERSION,
      });
    }

    // Evento desconhecido: log-only.
    await markInboundEvent(service, auditId, { processStatus: "skipped", processError: "unknown_event" });
    return json(200, { ok: true, processed: false, known: false, contract: EVOLUTION_WEBHOOK_CONTRACT_VERSION });
  } catch (e) {
    const msg = (e as Error)?.message ?? String(e);
    logEvolution("error", { fn: FN, requestId, event: eventRaw ?? undefined, instanceName: instance ?? undefined, code: "INTERNAL_ERROR", message: msg });
    await markInboundEvent(service, auditId, { processStatus: "failed", processError: `exception:${msg}` });
    return json(500, { error: "INTERNAL_ERROR" });
  }
});
