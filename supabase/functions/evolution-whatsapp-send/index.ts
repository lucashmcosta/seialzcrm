// Envia mensagem WhatsApp via Evolution API (Baileys).
// Shape de entrada/saída compatível com twilio-whatsapp-send / meta-whatsapp-send
// para uso transparente pelo dispatcher `dispatchWhatsAppSend`.
//
// Escopo Production-Ready (final):
//   • texto, image, audio, video, document, sticker
//   • reply / quoted (via contextInfo/stanzaId)
//   • persistência simétrica (endpoint_id, provider, whatsapp_message_sid,
//     whatsapp_status, metadata.evolution)
//   • rotação por linha (messaging_lines) quando o endpoint da thread está
//     inativo — mesma lógica de meta/twilio.
//   • feature flag `evolution_api_enabled` bloqueia execução se off.
//   • NÃO envia templates aprovados Meta (Baileys não suporta). Retorna 400.
//   • NÃO altera Meta/Twilio.
//
// Auth: verify_jwt=false; validado em código via validateCallerAuth() no
// mesmo padrão dos demais senders. Rate-limit por caller usando helper
// compartilhado da Evolution.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { featureFlagEnabled } from "../_shared/feature-flags.ts";
import { validateCallerAuth, edgeAuthMode, logAuthObservation } from "../_shared/auth.ts";
import { logEvolution, newRequestId } from "../_shared/evolution/logger.ts";
import { callerKey, rateLimit } from "../_shared/evolution/rate-limit.ts";

const FN = "evolution-whatsapp-send" as const;
const FLAG = "evolution_api_enabled";
const PROVIDER = "evolution_api";
const RL_LIMIT = 60;
const RL_WINDOW_MS = 60_000;

type MediaKind = "image" | "audio" | "video" | "document" | "sticker";
const SUPPORTED_MEDIA: MediaKind[] = ["image", "audio", "video", "document", "sticker"];

function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function toE164Digits(phone: string): string {
  let d = String(phone).replace(/[^\d+]/g, "");
  if (d.startsWith("+")) d = d.slice(1);
  return d;
}

function placeholder(kind: MediaKind): string {
  return kind === "audio" ? "[Áudio]"
    : kind === "image" ? "[Imagem]"
    : kind === "video" ? "[Vídeo]"
    : kind === "sticker" ? "[Sticker]"
    : "[Documento]";
}

function inferMime(kind: MediaKind, url?: string, headerCt?: string | null): string {
  if (headerCt && headerCt.includes("/") && !headerCt.startsWith("application/octet-stream")) {
    return headerCt.split(";")[0].trim();
  }
  const ext = (url || "").toLowerCase().split("?")[0].split("#")[0].split(".").pop() || "";
  const map: Record<string, string> = {
    ogg: "audio/ogg", opus: "audio/ogg", mp3: "audio/mpeg", m4a: "audio/mp4",
    aac: "audio/aac", wav: "audio/wav", amr: "audio/amr", webm: "audio/webm",
    jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp",
    mp4: "video/mp4", "3gp": "video/3gpp",
    pdf: "application/pdf", doc: "application/msword",
    docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    xls: "application/vnd.ms-excel",
    xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    txt: "text/plain", csv: "text/csv",
  };
  if (map[ext]) return map[ext];
  return kind === "audio" ? "audio/ogg"
    : kind === "image" ? "image/jpeg"
    : kind === "video" ? "video/mp4"
    : kind === "sticker" ? "image/webp"
    : "application/pdf";
}

function fileNameFromUrl(url: string, fallback: string): string {
  try {
    const u = new URL(url);
    const tail = u.pathname.split("/").pop() || "";
    if (tail) return decodeURIComponent(tail);
  } catch { /* ignore */ }
  return fallback;
}

// ---------------------------------------------------------------------------
// Chamadas HTTP à Evolution API
// ---------------------------------------------------------------------------

interface EvoEnv { baseUrl: string; apiKey: string }

function readEvo(): EvoEnv | null {
  const baseUrl = Deno.env.get("EVOLUTION_BASE_URL");
  const apiKey = Deno.env.get("EVOLUTION_GLOBAL_API_KEY");
  if (!baseUrl || !apiKey) return null;
  return { baseUrl: baseUrl.trim().replace(/\/+$/, ""), apiKey };
}

async function evoPost(
  env: EvoEnv,
  path: string,
  body: Record<string, unknown>,
  requestId: string,
  op: string,
): Promise<{ ok: true; status: number; data: any } | { ok: false; status: number; error: string; data: any }> {
  const started = Date.now();
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), 20_000);
  try {
    const res = await fetch(`${env.baseUrl}${path}`, {
      method: "POST",
      headers: { apikey: env.apiKey, "content-type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const text = await res.text();
    let parsed: any = null;
    try { parsed = text ? JSON.parse(text) : null; } catch { parsed = text; }
    const dur = Date.now() - started;
    if (res.ok) {
      logEvolution("info", { fn: FN, op, requestId, status: res.status, durationMs: dur });
      return { ok: true, status: res.status, data: parsed };
    }
    logEvolution("warn", {
      fn: FN, op, requestId, status: res.status, durationMs: dur,
      code: res.status >= 500 ? "UPSTREAM_5XX" : "UPSTREAM_4XX",
      message: typeof parsed === "string" ? parsed : (parsed?.message ?? "upstream non-2xx"),
    });
    return { ok: false, status: res.status, error: typeof parsed === "string" ? parsed : JSON.stringify(parsed), data: parsed };
  } catch (e) {
    const isTimeout = e instanceof DOMException && e.name === "AbortError";
    logEvolution("error", {
      fn: FN, op, requestId, durationMs: Date.now() - started,
      code: isTimeout ? "UPSTREAM_TIMEOUT" : "UPSTREAM_ERROR",
      message: (e as Error).message,
    });
    return { ok: false, status: 504, error: (e as Error).message, data: null };
  } finally {
    clearTimeout(t);
  }
}

async function bytesToBase64(bytes: Uint8Array): Promise<string> {
  // Chunked to avoid stack blowups on large media.
  let bin = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + chunk)) as any);
  }
  return btoa(bin);
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "method_not_allowed" });

  const requestId = newRequestId();

  // Rate-limit por caller (mesmo helper usado pelo webhook / manager).
  const rl = rateLimit(callerKey(req), RL_LIMIT, RL_WINDOW_MS);
  if (!rl.allowed) {
    return new Response(JSON.stringify({ error: "rate_limited" }), {
      status: 429,
      headers: { ...corsHeaders, "content-type": "application/json", "retry-after": String(Math.ceil(rl.retryAfterMs / 1000)) },
    });
  }

  let body: any;
  try { body = await req.json(); } catch { return json(400, { error: "invalid_json" }); }
  if (!body) return json(400, { error: "invalid_json" });

  const {
    organizationId, contactId, threadId, message,
    mediaUrl, mediaUrls, mediaType, mimeType: payloadMime, filename: payloadFilename,
    userId, replyToMessageId, isAgentMessage, agentId, senderName,
    endpointId: explicitEndpointId,
    templateId,
    senderContext,
  } = body as Record<string, any>;

  if (!organizationId) return json(400, { error: "missing_organization" });
  if (!contactId) return json(400, { error: "missing_contact" });

  // Templates Meta não são suportados via Baileys — bloquear.
  if (templateId) {
    return json(400, {
      error: "templates_not_supported_on_evolution",
      details: "Templates aprovados só existem em Meta Cloud API. Envie texto livre ou mídia.",
    });
  }

  const edgeAuth = edgeAuthMode();
  if (edgeAuth !== "off") {
    const callerAuth = await validateCallerAuth(req, organizationId);
    if (!callerAuth.ok) {
      logAuthObservation(FN, req, callerAuth.error);
      if (edgeAuth === "enforce") return json(401, { error: "unauthorized", reason: callerAuth.error });
    }
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // Feature flag por org (bloqueia execução se off).
  const flagOn = await featureFlagEnabled(supabase, FLAG, organizationId);
  if (!flagOn) {
    return json(403, { error: "feature_disabled", flag: FLAG });
  }

  const evo = readEvo();
  if (!evo) return json(503, { error: "evolution_env_missing" });

  // -------------------------------------------------------------------------
  // Resolve endpoint (defense-in-depth: thread.primary_endpoint_id sempre vence)
  // -------------------------------------------------------------------------
  let effectiveEndpointId: string | null = typeof explicitEndpointId === "string" ? explicitEndpointId : null;
  if (threadId) {
    const { data: t } = await supabase
      .from("message_threads")
      .select("primary_endpoint_id")
      .eq("id", threadId)
      .maybeSingle();
    const pid = (t as any)?.primary_endpoint_id as string | null;
    if (pid) {
      if (effectiveEndpointId && effectiveEndpointId !== pid) {
        logEvolution("warn", { fn: FN, requestId, message: "endpoint_override_ignored", threadId });
      }
      effectiveEndpointId = pid;
    }
  }

  let endpoint: any = null;
  if (effectiveEndpointId) {
    const { data } = await supabase
      .from("communication_endpoints")
      .select("id, organization_id, sender_sid, external_address, provider, is_active, purpose")
      .eq("id", effectiveEndpointId)
      .maybeSingle();
    endpoint = data;
  }

  // Rotação por LINHA quando primary está inativo.
  if (endpoint && endpoint.is_active === false) {
    const lineKey = endpoint.purpose === "commercial" ? "commercial" : "customer_service";
    const { data: line } = await supabase
      .from("messaging_lines")
      .select("active_endpoint_id")
      .eq("organization_id", organizationId)
      .eq("key", lineKey)
      .eq("channel", "whatsapp")
      .maybeSingle();
    const activeId = (line as any)?.active_endpoint_id as string | null;
    if (activeId && activeId !== endpoint.id) {
      const { data: ep } = await supabase
        .from("communication_endpoints")
        .select("id, organization_id, sender_sid, external_address, provider, is_active, purpose")
        .eq("id", activeId).maybeSingle();
      if (ep && (ep as any).is_active) endpoint = ep;
    }
  }

  // Fallback: 1º endpoint evolution ativo da org (ordenado por purpose).
  if (!endpoint) {
    const desiredPurpose = senderContext === "messages" ? "commercial" : "customer_service";
    const { data: candidates } = await supabase
      .from("communication_endpoints")
      .select("id, organization_id, sender_sid, external_address, provider, is_active, purpose, created_at")
      .eq("organization_id", organizationId)
      .eq("provider", PROVIDER)
      .eq("is_active", true)
      .order("created_at", { ascending: true });
    const rows = (candidates ?? []) as any[];
    rows.sort((a, b) => {
      const s = (a.purpose === desiredPurpose ? -100 : 0) - (b.purpose === desiredPurpose ? -100 : 0);
      if (s !== 0) return s;
      return String(a.created_at).localeCompare(String(b.created_at));
    });
    endpoint = rows[0] ?? null;
  }

  if (!endpoint) return json(400, { error: "no_evolution_endpoint" });
  if (endpoint.organization_id !== organizationId) return json(403, { error: "endpoint_org_mismatch" });
  if (endpoint.provider !== PROVIDER) return json(400, { error: "endpoint_not_evolution" });
  if (!endpoint.sender_sid) return json(400, { error: "endpoint_missing_instance_name" });

  // Recupera instance_name da tabela evolution_instances
  const { data: instRow } = await supabase
    .from("evolution_instances")
    .select("instance_name, last_known_state")
    .eq("endpoint_id", endpoint.id)
    .maybeSingle();
  const instanceName = (instRow as any)?.instance_name ?? endpoint.sender_sid;
  if (!instanceName) return json(400, { error: "instance_not_found_for_endpoint" });

  // -------------------------------------------------------------------------
  // Normaliza payload
  // -------------------------------------------------------------------------
  const mediaUrlsArr: string[] = Array.isArray(mediaUrls) && mediaUrls.length
    ? mediaUrls.filter((u: any) => typeof u === "string" && u)
    : (typeof mediaUrl === "string" && mediaUrl ? [mediaUrl] : []);
  const hasMedia = mediaUrlsArr.length > 0 || !!mediaType;
  const trimmedMessage = typeof message === "string" ? message : "";

  if (hasMedia) {
    if (!mediaType || !SUPPORTED_MEDIA.includes(mediaType as MediaKind)) {
      return json(400, { error: "unsupported_media_type" });
    }
    if (mediaUrlsArr.length === 0) return json(400, { error: "missing_media_url" });
  } else {
    if (!trimmedMessage.trim()) return json(400, { error: "empty_message" });
    if (trimmedMessage.length > 4096) return json(400, { error: "message_too_long", max: 4096 });
  }

  // Contato + telefone
  const { data: contact } = await supabase
    .from("contacts")
    .select("phone, full_name")
    .eq("id", contactId)
    .eq("organization_id", organizationId)
    .maybeSingle();
  if (!contact?.phone) return json(404, { error: "contact_phone_missing" });
  const to = toE164Digits(contact.phone);
  if (!/^\d{8,15}$/.test(to)) return json(400, { error: "invalid_contact_phone" });

  // Thread reuse (mesmo padrão do meta-send).
  let currentThreadId: string | null = typeof threadId === "string" ? threadId : null;
  if (!currentThreadId) {
    const { data: existing } = await supabase
      .from("message_threads")
      .select("id")
      .eq("organization_id", organizationId)
      .eq("contact_id", contactId)
      .eq("channel", "whatsapp")
      .eq("primary_endpoint_id", endpoint.id)
      .is("merged_into_thread_id", null)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (existing) {
      currentThreadId = (existing as any).id;
    } else {
      const { data: created, error: tErr } = await supabase
        .from("message_threads")
        .insert({
          organization_id: organizationId,
          contact_id: contactId,
          channel: "whatsapp",
          subject: "WhatsApp",
          primary_endpoint_id: endpoint.id,
        })
        .select("id").single();
      if (tErr || !created) return json(500, { error: "thread_create_failed", details: tErr?.message });
      currentThreadId = (created as any).id;
    }
  }

  // Self-heal primary_endpoint_id.
  if (currentThreadId) {
    await supabase.from("message_threads")
      .update({ primary_endpoint_id: endpoint.id })
      .eq("id", currentThreadId)
      .eq("organization_id", organizationId)
      .is("primary_endpoint_id", null)
      .catch(() => {});
  }

  // Reply context (quoted).
  let quoted: Record<string, unknown> | undefined;
  if (replyToMessageId) {
    const { data: original } = await supabase
      .from("messages")
      .select("whatsapp_message_sid, direction, content, metadata")
      .eq("id", replyToMessageId)
      .maybeSingle();
    const wamid = (original as any)?.whatsapp_message_sid as string | null;
    if (wamid) {
      const fromMe = (original as any)?.direction === "outbound";
      quoted = {
        key: { id: wamid, remoteJid: `${to}@s.whatsapp.net`, fromMe },
        message: { conversation: (original as any)?.content ?? "" },
      };
    }
  }

  const kind = hasMedia ? (mediaType as MediaKind) : null;
  const initialContent = hasMedia
    ? (trimmedMessage.trim() || placeholder(kind!))
    : trimmedMessage;

  const resolvedSenderName = typeof senderName === "string" && senderName ? senderName : null;
  const baseMeta: Record<string, unknown> = {
    evolution: {
      instance_name: instanceName,
      endpoint_id: endpoint.id,
      to,
    },
  };

  // Insere mensagem outbound com whatsapp_status='sending'.
  const { data: insertedMsg, error: insErr } = await supabase
    .from("messages")
    .insert({
      organization_id: organizationId,
      thread_id: currentThreadId,
      content: initialContent,
      direction: "outbound",
      sender_user_id: userId || null,
      whatsapp_status: "sending",
      sent_at: new Date().toISOString(),
      reply_to_message_id: replyToMessageId || null,
      sender_type: isAgentMessage ? "agent" : "user",
      sender_name: resolvedSenderName,
      sender_agent_id: isAgentMessage && agentId ? agentId : null,
      endpoint_id: endpoint.id,
      media_urls: hasMedia ? mediaUrlsArr : null,
      media_type: hasMedia ? kind : null,
      metadata: baseMeta,
    })
    .select("id").single();
  if (insErr || !insertedMsg) return json(500, { error: "message_insert_failed", details: insErr?.message });

  // -------------------------------------------------------------------------
  // Chama Evolution
  // -------------------------------------------------------------------------
  try {
    let evoRes;
    if (hasMedia) {
      const sourceUrl = mediaUrlsArr[0];
      // Download → base64 (Evolution aceita URL, mas base64 é mais confiável
      // com Storage assinado / bytes de curta vida).
      const fetchRes = await fetch(sourceUrl);
      if (!fetchRes.ok) throw new Error(`source_fetch_failed_${fetchRes.status}`);
      const bytes = new Uint8Array(await fetchRes.arrayBuffer());
      const headerCt = fetchRes.headers.get("content-type");
      const mimeUsed = (typeof payloadMime === "string" && payloadMime.includes("/"))
        ? payloadMime : inferMime(kind!, sourceUrl, headerCt);
      const fileName = (typeof payloadFilename === "string" && payloadFilename)
        ? payloadFilename : fileNameFromUrl(sourceUrl, `file-${Date.now()}`);
      const base64 = await bytesToBase64(bytes);

      if (kind === "audio") {
        evoRes = await evoPost(evo, `/message/sendWhatsAppAudio/${encodeURIComponent(instanceName)}`, {
          number: to,
          audio: base64,
          ...(quoted ? { quoted } : {}),
        }, requestId, "sendWhatsAppAudio");
      } else if (kind === "sticker") {
        evoRes = await evoPost(evo, `/message/sendSticker/${encodeURIComponent(instanceName)}`, {
          number: to,
          sticker: base64,
          ...(quoted ? { quoted } : {}),
        }, requestId, "sendSticker");
      } else {
        // image | video | document
        const caption = trimmedMessage.trim();
        evoRes = await evoPost(evo, `/message/sendMedia/${encodeURIComponent(instanceName)}`, {
          number: to,
          mediatype: kind,
          mimetype: mimeUsed,
          media: base64,
          fileName,
          ...(caption ? { caption } : {}),
          ...(quoted ? { quoted } : {}),
        }, requestId, "sendMedia");
      }
      (baseMeta.evolution as any).mime_type = mimeUsed;
      (baseMeta.evolution as any).file_name = fileName;
      (baseMeta.evolution as any).media_kind = kind;
      (baseMeta.evolution as any).media_source_url = sourceUrl;
    } else {
      evoRes = await evoPost(evo, `/message/sendText/${encodeURIComponent(instanceName)}`, {
        number: to,
        text: trimmedMessage,
        ...(quoted ? { quoted } : {}),
      }, requestId, "sendText");
    }

    if (!evoRes.ok) {
      await supabase.from("messages").update({
        whatsapp_status: "failed",
        error_code: String(evoRes.status),
        error_message: (typeof evoRes.error === "string" ? evoRes.error : "evolution_send_failed").slice(0, 500),
        metadata: { ...baseMeta, evolution_error: evoRes.data ?? evoRes.error },
      }).eq("id", (insertedMsg as any).id);
      return json(502, {
        error: "evolution_send_failed",
        status: evoRes.status,
        details: evoRes.data ?? evoRes.error,
      });
    }

    // Extrai wamid (Baileys retorna key.id em `data.key.id`).
    const d = evoRes.data ?? {};
    const wamid = d?.key?.id
      ?? d?.messageId
      ?? d?.id
      ?? null;
    const finalMeta = {
      ...baseMeta,
      evolution: {
        ...(baseMeta.evolution as any),
        wamid,
        response: d,
      },
    };
    await supabase.from("messages").update({
      whatsapp_status: "sent",
      whatsapp_message_sid: wamid,
      metadata: finalMeta,
    }).eq("id", (insertedMsg as any).id);

    return json(200, {
      success: true,
      messageId: (insertedMsg as any).id,
      wamid,
      threadId: currentThreadId,
      provider: PROVIDER,
    });
  } catch (e) {
    const msg = (e as Error).message ?? String(e);
    await supabase.from("messages").update({
      whatsapp_status: "failed",
      error_message: msg.slice(0, 500),
      metadata: { ...baseMeta, evolution_exception: msg },
    }).eq("id", (insertedMsg as any).id);
    logEvolution("error", { fn: FN, requestId, code: "INTERNAL_ERROR", message: msg });
    return json(500, { error: "internal_error", message: msg });
  }
});
