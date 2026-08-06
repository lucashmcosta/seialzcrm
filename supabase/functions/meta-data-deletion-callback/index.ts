// meta-data-deletion-callback — endpoint PÚBLICO (verify_jwt=false) que a Meta chama
// para solicitações de exclusão de dados. Valida o signed_request (HMAC com App Secret),
// registra a solicitação e responde no formato exigido { url, confirmation_code }.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

function b64urlToBytes(input: string): Uint8Array {
  const b64 = input.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((input.length + 3) % 4);
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
function bytesToB64url(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
async function hmacSha256(secret: string, message: string): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message)));
}

serve(async (req) => {
  try {
    if (req.method !== "POST") return new Response("ok", { status: 200 });
    const appSecret = Deno.env.get("FACEBOOK_APP_SECRET")?.trim();
    if (!appSecret) return new Response(JSON.stringify({ error: "not_configured" }), { status: 503 });

    const form = await req.formData().catch(() => null);
    const signed = form?.get("signed_request");
    if (typeof signed !== "string" || !signed.includes(".")) {
      return new Response(JSON.stringify({ error: "invalid_request" }), { status: 400 });
    }
    const [sigPart, payloadPart] = signed.split(".", 2);
    const expected = bytesToB64url(await hmacSha256(appSecret, payloadPart));
    if (expected !== sigPart) {
      return new Response(JSON.stringify({ error: "bad_signature" }), { status: 400 });
    }
    const payload = JSON.parse(new TextDecoder().decode(b64urlToBytes(payloadPart)));
    const metaUserId = payload?.user_id ? String(payload.user_id) : null;

    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: reqRow } = await admin.from("meta_data_deletion_requests").insert({
      origin: "meta_callback", status: "received", meta_user_id: metaUserId,
      evidence: { received_at: new Date().toISOString() },
    }).select("id").single();

    const base = Deno.env.get("PUBLIC_APP_BASE_URL") || "https://seialz.com";
    const code = reqRow?.id ?? crypto.randomUUID();
    // Formato exigido pela Meta: URL de status + código de confirmação.
    return new Response(JSON.stringify({
      url: `${base}/data-deletion?code=${code}`,
      confirmation_code: code,
    }), { status: 200, headers: { "Content-Type": "application/json" } });
  } catch (e) {
    console.error("meta-data-deletion-callback error", (e as Error).message);
    return new Response(JSON.stringify({ error: "internal_error" }), { status: 500 });
  }
});
