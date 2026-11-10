// Helpers Graph API para Meta WhatsApp Cloud.
// Reaproveita o padrão de _shared/meta-graph.ts mas com versão/escopo próprios
// para evitar acoplamento com integrações Meta CAPI / Lead Ads.

const API_VERSION = Deno.env.get("META_WHATSAPP_GRAPH_VERSION") || "v23.0";
export const META_WA_BASE = `https://graph.facebook.com/${API_VERSION}`;

async function hmacSha256Hex(key: string, message: string): Promise<string> {
  const enc = new TextEncoder();
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    enc.encode(key),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", cryptoKey, enc.encode(message));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export interface MetaWaCallOpts {
  accessToken: string;
  appSecret?: string;
}

export interface MetaWaError {
  message: string;
  type?: string;
  code?: number;
  error_subcode?: number;
  fbtrace_id?: string;
}

export class MetaWaGraphError extends Error {
  status: number;
  error: MetaWaError;
  constructor(status: number, error: MetaWaError) {
    super(error.message || `Meta Graph error ${status}`);
    this.status = status;
    this.error = error;
  }
}

async function appendProof(
  search: URLSearchParams,
  opts: MetaWaCallOpts,
): Promise<void> {
  search.set("access_token", opts.accessToken);
  if (opts.appSecret && opts.appSecret.length > 0) {
    search.set(
      "appsecret_proof",
      await hmacSha256Hex(opts.appSecret, opts.accessToken),
    );
  }
}

export async function metaWaGet(
  path: string,
  params: Record<string, string | number | undefined>,
  opts: MetaWaCallOpts,
): Promise<any> {
  const search = new URLSearchParams();
  await appendProof(search, opts);
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== "") {
      search.set(k, String(v));
    }
  }
  const url = `${META_WA_BASE}${path.startsWith("/") ? "" : "/"}${path}?${search.toString()}`;
  const res = await fetch(url, { method: "GET" });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json.error) {
    throw new MetaWaGraphError(res.status, json.error || { message: `HTTP ${res.status}` });
  }
  return json;
}

export async function metaWaPostJson(
  path: string,
  body: Record<string, unknown>,
  opts: MetaWaCallOpts,
): Promise<any> {
  const search = new URLSearchParams();
  await appendProof(search, opts);
  const url = `${META_WA_BASE}${path.startsWith("/") ? "" : "/"}${path}?${search.toString()}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json.error) {
    throw new MetaWaGraphError(res.status, json.error || { message: `HTTP ${res.status}` });
  }
  return json;
}

/**
 * Upload de mídia para /{phone_number_id}/media. Retorna { id } a ser usado
 * como media_id no envio de mensagens type=image|audio|video|document.
 */
export async function metaWaUploadMedia(
  phoneNumberId: string,
  fileBytes: Uint8Array,
  mimeType: string,
  filename: string,
  opts: MetaWaCallOpts,
): Promise<{ id: string }> {
  const search = new URLSearchParams();
  await appendProof(search, opts);
  const url = `${META_WA_BASE}/${phoneNumberId}/media?${search.toString()}`;
  const fd = new FormData();
  fd.append("messaging_product", "whatsapp");
  fd.append("type", mimeType);
  fd.append("file", new Blob([fileBytes as unknown as BlobPart], { type: mimeType }), filename);
  const res = await fetch(url, { method: "POST", body: fd });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json.error) {
    throw new MetaWaGraphError(res.status, json.error || { message: `HTTP ${res.status}` });
  }
  return json;
}

/**
 * Resumable Upload API: envia um arquivo de exemplo e devolve o handle usado em
 * example.header_handle na criação de templates com cabeçalho de mídia.
 * 1) POST /{app_id}/uploads → { id: "upload:..." }
 * 2) POST /{upload_session_id} (Authorization: OAuth, file_offset: 0) → { h }
 */
export async function metaWaResumableUpload(
  appId: string,
  fileBytes: Uint8Array,
  mimeType: string,
  fileName: string,
  opts: MetaWaCallOpts,
): Promise<string> {
  const search = new URLSearchParams();
  await appendProof(search, opts);
  search.set("file_name", fileName);
  search.set("file_length", String(fileBytes.byteLength));
  search.set("file_type", mimeType);
  const startRes = await fetch(`${META_WA_BASE}/${appId}/uploads?${search.toString()}`, { method: "POST" });
  const start = await startRes.json().catch(() => ({}));
  if (!startRes.ok || start.error || typeof start.id !== "string") {
    throw new MetaWaGraphError(startRes.status, start.error || { message: `Upload session HTTP ${startRes.status}` });
  }
  const upRes = await fetch(`${META_WA_BASE}/${start.id}`, {
    method: "POST",
    headers: { Authorization: `OAuth ${opts.accessToken}`, file_offset: "0" },
    body: fileBytes as unknown as BodyInit,
  });
  const up = await upRes.json().catch(() => ({}));
  if (!upRes.ok || up.error || typeof up.h !== "string" || !up.h) {
    throw new MetaWaGraphError(upRes.status, up.error || { message: `Upload HTTP ${upRes.status}` });
  }
  return up.h;
}

/** Lookup de URL temporária do Graph para um media_id inbound. */
export async function metaWaGetMediaUrl(
  mediaId: string,
  opts: MetaWaCallOpts,
): Promise<{ url: string; mime_type: string; sha256?: string; file_size?: number }> {
  return await metaWaGet(`/${mediaId}`, {}, opts);
}

/** Faz download da URL lookaside autenticada do Graph. */
export async function metaWaDownloadMedia(
  mediaUrl: string,
  opts: MetaWaCallOpts,
): Promise<{ bytes: Uint8Array; contentType: string | null }> {
  const res = await fetch(mediaUrl, {
    headers: { Authorization: `Bearer ${opts.accessToken}` },
  });
  if (!res.ok) {
    throw new MetaWaGraphError(res.status, {
      message: `Media download failed ${res.status}`,
    });
  }
  const buf = new Uint8Array(await res.arrayBuffer());
  return { bytes: buf, contentType: res.headers.get("content-type") };
}

/**
 * Valida o conjunto Phone Number ID + WABA + System User Token.
 * Faz 2 chamadas: /{phone_number_id} e /{waba_id}/phone_numbers.
 * Retorna metadados úteis para o ConnectedPanel.
 */
export async function validateCredentials(input: {
  phoneNumberId: string;
  wabaId: string;
  accessToken: string;
  appSecret?: string;
}): Promise<{
  display_phone_number: string;
  verified_name?: string;
  quality_rating?: string;
  messaging_limit_tier?: string;
  belongs_to_waba: boolean;
}> {
  const { phoneNumberId, wabaId, accessToken, appSecret } = input;
  const opts: MetaWaCallOpts = { accessToken, appSecret };

  const phone = await metaWaGet(
    `/${phoneNumberId}`,
    { fields: "id,display_phone_number,verified_name,quality_rating,messaging_limit_tier" },
    opts,
  );

  const wabaPhones = await metaWaGet(
    `/${wabaId}/phone_numbers`,
    { fields: "id,display_phone_number" },
    opts,
  );

  const belongs = Array.isArray(wabaPhones?.data)
    && wabaPhones.data.some((p: any) => String(p.id) === String(phoneNumberId));

  return {
    display_phone_number: phone.display_phone_number,
    verified_name: phone.verified_name,
    quality_rating: phone.quality_rating,
    messaging_limit_tier: phone.messaging_limit_tier,
    belongs_to_waba: belongs,
  };
}

/**
 * Inscreve o App atual (dono do access_token) para receber webhooks da WABA.
 * Executa POST /{wabaId}/subscribed_apps e confirma com GET /{wabaId}/subscribed_apps.
 * Retorna a resposta bruta do POST e a lista de apps inscritos após a operação.
 */
export async function metaWaSubscribeAppToWaba(
  wabaId: string,
  opts: MetaWaCallOpts,
): Promise<{
  post_response: any;
  subscribed_apps: Array<{ whatsapp_business_api_data?: { id?: string; name?: string; link?: string } }>;
  app_ids: string[];
}> {
  const postResponse = await metaWaPostJson(`/${wabaId}/subscribed_apps`, {}, opts);
  const listResponse = await metaWaGet(`/${wabaId}/subscribed_apps`, {}, opts);
  const apps: any[] = Array.isArray(listResponse?.data) ? listResponse.data : [];
  const appIds = apps
    .map((a) => a?.whatsapp_business_api_data?.id)
    .filter((v): v is string => typeof v === "string" && v.length > 0);
  return { post_response: postResponse, subscribed_apps: apps, app_ids: appIds };
}
