// whatsapp-otp-send — envio genérico S2S de código de login por template
// AUTHENTICATION da Meta, para orgs habilitadas em ORG_SECRET_NAMES.
// verify_jwt=false: HMAC por organização. Não toca message_threads/messages;
// nunca grava/loga o código nem o telefone completo.
import { createClient } from "npm:@supabase/supabase-js@2";
import { metaWaPostJson, MetaWaGraphError } from "../_shared/meta-whatsapp/graph.ts";
import { resolveMetaCredentials } from "../_shared/meta-whatsapp/credentials.ts";
import {
  buildPayload, FORBIDDEN_ENDPOINT_ID, isRateLimited, peekOrgId, secretNameForOrg,
  sha256Hex, validateInput, verifySignature,
} from "./logic.ts";

const fail = (status: number, code: string) =>
  new Response(JSON.stringify({ sent: false, code }), { status, headers: { "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method !== "POST") return fail(405, "method_not_allowed");
  if (!(req.headers.get("content-type") ?? "").toLowerCase().includes("application/json")) {
    return fail(415, "unsupported_media_type");
  }
  const raw = await req.text();
  const secretName = secretNameForOrg(peekOrgId(raw));
  const ok = await verifySignature({
    secret: secretName ? Deno.env.get(secretName) : undefined,
    timestampHeader: req.headers.get("x-portal-timestamp"),
    signatureHeader: req.headers.get("x-portal-signature"),
    rawBody: raw,
    nowSeconds: Math.floor(Date.now() / 1000),
  });
  if (!ok) return fail(401, "unauthorized");

  let input;
  try { input = validateInput(JSON.parse(raw)); } catch { input = null; }
  if (!input) return fail(400, "invalid_input");
  const orgId = input.organizationId;

  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  try {
    const { data: eps, error: eErr } = await sb
      .from("communication_endpoints")
      .select("id, organization_integration_id, sender_sid")
      .eq("organization_id", orgId).eq("provider", "meta_cloud_api").eq("is_active", true)
      .not("sender_sid", "is", null).not("organization_integration_id", "is", null)
      .neq("id", FORBIDDEN_ENDPOINT_ID)
      .order("created_at", { ascending: true }).limit(1);
    if (eErr) throw new Error("endpoint_lookup");
    const ep = eps?.[0];
    if (!ep) return fail(503, "whatsapp_not_connected");

    const { data: tpl } = await sb
      .from("whatsapp_templates").select("id")
      .eq("organization_id", orgId).eq("organization_integration_id", ep.organization_integration_id)
      .eq("provider", "meta_cloud_api").eq("meta_template_name", input.template)
      .eq("language", input.language).eq("status", "approved").eq("is_active", true)
      .ilike("category", "AUTHENTICATION").limit(1).maybeSingle();
    if (!tpl) return fail(422, "template_not_found");

    const phoneHash = await sha256Hex(`${orgId}:${input.phoneDigits}`);
    const since = new Date(Date.now() - 3600_000).toISOString();
    const { count, error: rErr } = await sb.from("whatsapp_otp_send_log")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", orgId).eq("phone_hash", phoneHash).gte("created_at", since);
    if (rErr) throw new Error("rate_lookup");
    if (isRateLimited(count ?? 0)) return fail(429, "rate_limited");

    const log = { organization_id: orgId, phone_hash: phoneHash, phone_last4: input.phoneDigits.slice(-4), template_name: input.template };
    const creds = await resolveMetaCredentials(sb, ep.organization_integration_id);
    try {
      const res = await metaWaPostJson(`/${ep.sender_sid}/messages`,
        buildPayload({ to: input.phoneDigits, template: input.template, language: input.language, code: input.code }),
        { accessToken: creds.accessToken, appSecret: creds.appSecret });
      await sb.from("whatsapp_otp_send_log").insert({ ...log, status: "sent", meta_message_id: res?.messages?.[0]?.id ?? null });
    } catch (e) {
      const metaCode = e instanceof MetaWaGraphError && e.error?.code ? `meta_${e.error.code}` : "send_failed";
      await sb.from("whatsapp_otp_send_log").insert({ ...log, status: "failed", error_code: metaCode });
      console.error("[whatsapp-otp-send] send_failed", metaCode);
      return fail(502, "send_failed");
    }
    return new Response(JSON.stringify({ sent: true }), { status: 200, headers: { "Content-Type": "application/json" } });
  } catch (e) {
    console.error("[whatsapp-otp-send] internal_error", (e as Error).message);
    return fail(500, "internal_error");
  }
});
