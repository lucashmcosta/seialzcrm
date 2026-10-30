// client-portal-otp-send — envio servidor-a-servidor do código de acesso do
// app de clientes (Central Trabalhista) pelo template AUTHENTICATION.
// verify_jwt=false: autenticação por HMAC (CLIENT_PORTAL_HMAC_SECRET).
// Não cria/atualiza message_threads nem messages; nunca grava/loga o código.
import { createClient } from "npm:@supabase/supabase-js@2";
import { metaWaPostJson } from "../_shared/meta-whatsapp/graph.ts";
import { resolveMetaCredentials } from "../_shared/meta-whatsapp/credentials.ts";
import {
  buildMetaTemplatePayload,
  FORBIDDEN_ENDPOINT_ID,
  maskPhone,
  MAX_SENDS_PER_HOUR,
  pickEligible,
  validateInput,
  verifySignature,
} from "./logic.ts";

function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
const err = (status: number, code: string) => json(status, { code });

Deno.serve(async (req) => {
  if (req.method !== "POST") return err(405, "method_not_allowed");
  if (!(req.headers.get("content-type") ?? "").toLowerCase().includes("application/json")) {
    return err(415, "unsupported_media_type");
  }

  const rawBody = await req.text();
  const ok = await verifySignature({
    secret: Deno.env.get("CLIENT_PORTAL_HMAC_SECRET"),
    timestampHeader: req.headers.get("x-portal-timestamp"),
    signatureHeader: req.headers.get("x-portal-signature"),
    rawBody,
    nowSeconds: Math.floor(Date.now() / 1000),
  });
  if (!ok) return err(401, "unauthorized");

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawBody);
  } catch {
    return err(400, "invalid_input");
  }
  const input = validateInput(parsed);
  if (!input) return err(400, "invalid_input");

  const orgId = Deno.env.get("CLIENT_PORTAL_ORGANIZATION_ID");
  const endpointId = Deno.env.get("CLIENT_PORTAL_OTP_ENDPOINT_ID");
  const templateName = Deno.env.get("CLIENT_PORTAL_OTP_TEMPLATE");
  if (!orgId || !endpointId || !templateName || endpointId === FORBIDDEN_ENDPOINT_ID) {
    console.error("[client-portal-otp-send] config_error");
    return err(500, "config_error");
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  try {
    const { data: contacts, error: cErr } = await supabase
      .from("contacts")
      .select("id, phone")
      .eq("organization_id", orgId)
      .is("deleted_at", null)
      .in("id", input.contactIds);
    if (cErr) throw new Error("contacts_lookup");
    const contactIds = (contacts ?? []).map((c) => c.id);
    if (contactIds.length === 0) return json(200, { sent: false, reason: "no_verified_whatsapp" });

    const { data: threads, error: tErr } = await supabase
      .from("message_threads")
      .select("contact_id, last_inbound_at")
      .eq("organization_id", orgId)
      .eq("channel", "whatsapp")
      .not("last_inbound_at", "is", null)
      .in("contact_id", contactIds);
    if (tErr) throw new Error("threads_lookup");

    const eligible = pickEligible(contacts ?? [], threads ?? []);
    if (!eligible) return json(200, { sent: false, reason: "no_verified_whatsapp" });

    const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const { count, error: rErr } = await supabase
      .from("client_portal_otp_log")
      .select("id", { count: "exact", head: true })
      .eq("contact_id", eligible.contactId)
      .gte("created_at", since);
    if (rErr) throw new Error("rate_lookup");
    if ((count ?? 0) >= MAX_SENDS_PER_HOUR) return err(429, "rate_limited");

    const { data: endpoint, error: eErr } = await supabase
      .from("communication_endpoints")
      .select("id, organization_id, organization_integration_id, sender_sid, provider, is_active")
      .eq("id", endpointId)
      .maybeSingle();
    if (
      eErr || !endpoint || endpoint.organization_id !== orgId || !endpoint.is_active ||
      endpoint.provider !== "meta_cloud_api" || !endpoint.sender_sid || !endpoint.organization_integration_id
    ) {
      console.error("[client-portal-otp-send] endpoint_unavailable");
      return err(503, "unavailable");
    }

    const { data: tpl } = await supabase
      .from("whatsapp_templates")
      .select("language")
      .eq("organization_id", orgId)
      .eq("organization_integration_id", endpoint.organization_integration_id)
      .eq("provider", "meta_cloud_api")
      .eq("meta_template_name", templateName)
      .eq("status", "approved")
      .eq("is_active", true)
      .limit(1)
      .maybeSingle();
    if (!tpl?.language) {
      console.error("[client-portal-otp-send] template_unavailable");
      return err(503, "unavailable");
    }

    const creds = await resolveMetaCredentials(supabase, endpoint.organization_integration_id);
    const payload = buildMetaTemplatePayload({
      to: eligible.phone,
      templateName,
      language: tpl.language,
      code: input.code,
    });

    const phoneLast4 = eligible.phone.slice(-4);
    let metaMessageId: string | null = null;
    try {
      const res = await metaWaPostJson(`/${endpoint.sender_sid}/messages`, payload, {
        accessToken: creds.accessToken,
        appSecret: creds.appSecret,
      });
      metaMessageId = res?.messages?.[0]?.id ?? null;
    } catch {
      await supabase.from("client_portal_otp_log").insert({
        organization_id: orgId,
        contact_id: eligible.contactId,
        phone_last4: phoneLast4,
        status: "failed",
      });
      console.error("[client-portal-otp-send] send_failed");
      return err(502, "send_failed");
    }

    await supabase.from("client_portal_otp_log").insert({
      organization_id: orgId,
      contact_id: eligible.contactId,
      phone_last4: phoneLast4,
      meta_message_id: metaMessageId,
      status: "sent",
    });

    return json(200, {
      sent: true,
      destination_masked: maskPhone(eligible.phone),
      meta_message_id: metaMessageId,
    });
  } catch (e) {
    console.error("[client-portal-otp-send] internal_error", (e as Error).name);
    return err(500, "internal_error");
  }
});
