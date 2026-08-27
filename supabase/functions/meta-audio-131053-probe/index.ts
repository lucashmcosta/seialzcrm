// SONDA TEMPORÁRIA — diagnóstico do erro 131053 (Media upload error) em áudio Meta.
//
// NÃO faz parte do fluxo de produção e deve ser REMOVIDA ao fim da investigação:
//   - não escreve em `messages`, `message_threads`, `activities` ou endpoints;
//   - não altera rotas, `active_endpoint_id`, credenciais ou integrações;
//   - só executa POST /{pnid}/media + POST /{pnid}/messages com o arquivo recebido.
//
// Segurança:
//   - autenticação exclusiva por segredo administrativo server-side
//     (`META_AUDIO_PROBE_SECRET`), comparado em tempo constante;
//   - nenhuma credencial (service-role key, access token Meta, appsecret_proof)
//     é devolvida na resposta nem escrita em log;
//   - sem chamador no frontend: a função nunca é invocada pelo browser.

import { createClient } from "jsr:@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { resolveMetaCredentials } from "../_shared/meta-whatsapp/credentials.ts";
import { META_WA_BASE } from "../_shared/meta-whatsapp/graph.ts";

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

/** Comparação em tempo constante (evita oráculo de timing no segredo). */
function safeEqual(a: string, b: string): boolean {
  const ea = new TextEncoder().encode(a);
  const eb = new TextEncoder().encode(b);
  if (ea.length !== eb.length) return false;
  let diff = 0;
  for (let i = 0; i < ea.length; i++) diff |= ea[i] ^ eb[i];
  return diff === 0;
}

async function hmacSha256Hex(key: string, message: string): Promise<string> {
  const enc = new TextEncoder();
  const k = await crypto.subtle.importKey("raw", enc.encode(key), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", k, enc.encode(message));
  return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes as unknown as ArrayBuffer);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "method_not_allowed" });

  const expected = Deno.env.get("META_AUDIO_PROBE_SECRET_V2") ?? "";
  const provided = req.headers.get("x-probe-secret") ?? "";
  if (!expected || !provided || !safeEqual(expected, provided)) {
    return json(401, { error: "unauthorized" });
  }

  const body = await req.json().catch(() => null) as {
    endpointId?: string;
    to?: string;
    tag?: string;
    filename?: string;
    uploadType?: string;
    partContentType?: string;
    sourceUrl?: string;
    fileBase64?: string;
    skipSend?: boolean;
  } | null;

  if (!body?.endpointId || !body?.to || !body?.uploadType || !body?.filename) {
    return json(400, { error: "invalid_payload", required: ["endpointId", "to", "uploadType", "filename"] });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  );

  const { data: endpoint } = await supabase
    .from("communication_endpoints")
    .select("id, organization_id, organization_integration_id, sender_sid, external_address, provider")
    .eq("id", body.endpointId)
    .maybeSingle();

  if (!endpoint || endpoint.provider !== "meta_cloud_api" || !endpoint.sender_sid) {
    return json(400, { error: "endpoint_invalid" });
  }

  let accessToken: string;
  let appSecret: string | undefined;
  try {
    const creds = await resolveMetaCredentials(supabase, endpoint.organization_integration_id);
    accessToken = creds.accessToken;
    appSecret = creds.appSecret ?? undefined;
  } catch (e) {
    return json(400, { error: "credentials_resolve_failed", reason: (e as Error).message });
  }

  // Bytes: base64 no payload ou download de uma URL pública do Storage.
  let bytes: Uint8Array;
  if (body.fileBase64) {
    const bin = atob(body.fileBase64);
    bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  } else if (body.sourceUrl) {
    const r = await fetch(body.sourceUrl);
    if (!r.ok) return json(400, { error: `source_fetch_failed_${r.status}` });
    bytes = new Uint8Array(await r.arrayBuffer());
  } else {
    return json(400, { error: "missing_file" });
  }

  const partCt = body.partContentType || body.uploadType;
  const out: Record<string, unknown> = {
    tag: body.tag ?? null,
    endpoint_id: endpoint.id,
    external_address: endpoint.external_address,
    phone_number_id: endpoint.sender_sid,
    graph_base: META_WA_BASE,
    file: {
      sha256: await sha256Hex(bytes),
      size: bytes.byteLength,
      filename: body.filename,
      part_content_type: partCt,
      upload_type_field: body.uploadType,
    },
  };

  const search = new URLSearchParams();
  search.set("access_token", accessToken);
  if (appSecret) search.set("appsecret_proof", await hmacSha256Hex(appSecret, accessToken));

  // 1) Upload — multipart idêntico ao metaWaUploadMedia de produção.
  const fd = new FormData();
  fd.append("messaging_product", "whatsapp");
  fd.append("type", body.uploadType);
  fd.append("file", new Blob([bytes as unknown as BlobPart], { type: partCt }), body.filename);

  const upRes = await fetch(`${META_WA_BASE}/${endpoint.sender_sid}/media?${search.toString()}`, {
    method: "POST",
    body: fd,
  });
  const upJson = await upRes.json().catch(() => ({}));
  out.media_response = { status: upRes.status, body: upJson };
  const mediaId = (upJson as Record<string, unknown>)?.id ?? null;
  out.media_id = mediaId;
  if (!mediaId || body.skipSend) return json(200, out);

  // 2) Envio — audio: { id }, sem caption nem filename (igual à produção).
  const msgPayload = {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to: body.to,
    type: "audio",
    audio: { id: mediaId },
  };
  out.messages_payload = msgPayload;

  const msgRes = await fetch(`${META_WA_BASE}/${endpoint.sender_sid}/messages?${search.toString()}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(msgPayload),
  });
  const msgJson = await msgRes.json().catch(() => ({}));
  out.messages_response = { status: msgRes.status, body: msgJson };
  out.wamid = (msgJson as { messages?: Array<{ id?: string }> })?.messages?.[0]?.id ?? null;

  return json(200, out);
});
