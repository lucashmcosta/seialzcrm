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
