// Webhook Meta WhatsApp Cloud (verify_jwt=false).
// Estados:
//  - Pendente (secrets globais ausentes): GET/POST respondem 503 sem efeito colateral.
//  - Ativo: GET valida verify_token; POST valida X-Hub-Signature-256; processa messages[]/statuses[].
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { getPlatformStatus } from "../_shared/meta-whatsapp/platform.ts";

async function hmacSha256Hex(key: string, message: Uint8Array): Promise<string> {
  const cryptoKey = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(key), { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", cryptoKey, message);
  return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const platform = getPlatformStatus();

  const url = new URL(req.url);

  // ===== GET = verification handshake =====
  if (req.method === "GET") {
    if (!platform.webhookActive) {
      return new Response(JSON.stringify({ status: "pending_global_config" }), {
        status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const mode = url.searchParams.get("hub.mode");
    const token = url.searchParams.get("hub.verify_token");
    const challenge = url.searchParams.get("hub.challenge");
    if (mode === "subscribe" && token === Deno.env.get("META_WHATSAPP_VERIFY_TOKEN")) {
      return new Response(challenge ?? "", { status: 200, headers: corsHeaders });
    }
    return new Response("forbidden", { status: 403, headers: corsHeaders });
  }

  // ===== POST = inbound / status =====
  if (req.method !== "POST") {
    return new Response("method_not_allowed", { status: 405, headers: corsHeaders });
  }

  if (!platform.webhookActive) {
    return new Response(JSON.stringify({ status: "pending_global_config" }), {
      status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const rawBody = new Uint8Array(await req.arrayBuffer());
  const signature = req.headers.get("x-hub-signature-256") ?? "";
  const appSecret = Deno.env.get("META_WHATSAPP_APP_SECRET")!;
  const expected = "sha256=" + (await hmacSha256Hex(appSecret, rawBody));
  // timing-safe comparison
  if (signature.length !== expected.length) {
    return new Response("invalid_signature", { status: 401, headers: corsHeaders });
  }
  let diff = 0;
  for (let i = 0; i < signature.length; i++) diff |= signature.charCodeAt(i) ^ expected.charCodeAt(i);
  if (diff !== 0) {
    return new Response("invalid_signature", { status: 401, headers: corsHeaders });
  }

  let payload: any;
  try {
    payload = JSON.parse(new TextDecoder().decode(rawBody));
  } catch {
    return new Response("invalid_json", { status: 400, headers: corsHeaders });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  try {
    for (const entry of payload?.entry ?? []) {
      for (const change of entry?.changes ?? []) {
        const value = change?.value ?? {};
        const phoneNumberId = value?.metadata?.phone_number_id;
        if (!phoneNumberId) continue;

        const { data: endpoint } = await supabase
          .from("communication_endpoints")
          .select("id, organization_id, organization_integration_id")
          .eq("provider", "meta-cloud")
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
  const { data: existingContact } = await supabase
    .from("contacts")
    .select("id")
    .eq("organization_id", endpoint.organization_id)
    .eq("phone", fromE164)
    .maybeSingle();

  let contactId: string | null = existingContact?.id ?? null;
  if (!contactId) {
    const profileName = value?.contacts?.[0]?.profile?.name ?? null;
    const { data: created } = await supabase
      .from("contacts")
      .insert({
        organization_id: endpoint.organization_id,
        phone: fromE164,
        full_name: profileName ?? fromE164,
        lifecycle_stage: "lead",
      })
      .select("id")
      .single();
    contactId = created?.id ?? null;
  }
  if (!contactId) return;

  // Resolve / cria thread
  const { data: thread } = await supabase
    .from("message_threads")
    .select("id")
    .eq("organization_id", endpoint.organization_id)
    .eq("contact_id", contactId)
    .eq("channel", "whatsapp")
    .eq("primary_endpoint_id", endpoint.id)
    .maybeSingle();

  let threadId = thread?.id;
  if (!threadId) {
    const { data: created } = await supabase
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
    threadId = created?.id;
  }
  if (!threadId) return;

  const content = msg?.text?.body
    ?? msg?.button?.text
    ?? msg?.interactive?.button_reply?.title
    ?? msg?.interactive?.list_reply?.title
    ?? "[mensagem não-textual]";

  await supabase.from("messages").insert({
    organization_id: endpoint.organization_id,
    thread_id: threadId,
    content,
    direction: "inbound",
    whatsapp_status: "received",
    whatsapp_message_sid: wamid,
    endpoint_id: endpoint.id,
    sender_type: "contact",
    metadata: { meta_cloud: { raw: msg } },
  });

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
