// Helpers to call the Meta Graph API with appsecret_proof.

const API_VERSION = Deno.env.get("META_GRAPH_API_VERSION") || "v23.0";
const BASE_URL = `https://graph.facebook.com/${API_VERSION}`;

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

export interface MetaCallOpts {
  accessToken: string;
  appSecret?: string;
}

export interface MetaError {
  message: string;
  type?: string;
  code?: number;
  error_subcode?: number;
  fbtrace_id?: string;
}

export class MetaGraphError extends Error {
  status: number;
  error: MetaError;
  constructor(status: number, error: MetaError) {
    super(error.message || `Meta Graph error ${status}`);
    this.status = status;
    this.error = error;
  }
}

export async function metaGraphGet(
  path: string,
  params: Record<string, string | number | undefined>,
  opts: MetaCallOpts,
): Promise<any> {
  const search = new URLSearchParams();
  search.set("access_token", opts.accessToken);
  if (opts.appSecret) {
    search.set(
      "appsecret_proof",
      await hmacSha256Hex(opts.appSecret, opts.accessToken),
    );
  }
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== "") {
      search.set(k, String(v));
    }
  }
  const url = `${BASE_URL}${path.startsWith("/") ? "" : "/"}${path}?${search.toString()}`;
  const res = await fetch(url, { method: "GET" });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json.error) {
    throw new MetaGraphError(res.status, json.error || { message: `HTTP ${res.status}` });
  }
  return json;
}

const TOKEN_ERROR_CODES = new Set([190, 460, 463, 467, 102]);

export function isTokenError(err: unknown): boolean {
  if (err instanceof MetaGraphError) {
    return TOKEN_ERROR_CODES.has(err.error.code ?? -1);
  }
  return false;
}
