import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { decryptSecret } from "../_shared/crypto.ts";

const META_API_VERSION = Deno.env.get("META_GRAPH_API_VERSION") || "v23.0";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function sha256Hex(input: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function normEmail(s?: string | null) {
  return s ? s.trim().toLowerCase() : null;
}
function normPhone(s?: string | null) {
  if (!s) return null;
  const d = s.replace(/\D+/g, "");
  return d.length ? d : null;
}
function normName(s?: string | null) {
  return s ? s.trim().toLowerCase() : null;
}

async function buildUserData(contact: any | null) {
  const ud: Record<string, string[]> = {};
  if (!contact) return ud;
  const email = normEmail(contact.email);
  const phone = normPhone(contact.phone);
  const fn = normName(contact.first_name);
  const ln = normName(contact.last_name);
  if (email) ud.em = [await sha256Hex(email)];
  if (phone) ud.ph = [await sha256Hex(phone)];
  if (fn) ud.fn = [await sha256Hex(fn)];
  if (ln) ud.ln = [await sha256Hex(ln)];
  return ud;
}

async function getAccessToken(admin: any, orgId: string, ca: any): Promise<string | null> {
  if (ca?.token_source === "meta-lead-ads") {
    const { data } = await admin
      .from("organization_integrations")
      .select("connected_account, admin_integrations!inner(slug)")
      .eq("organization_id", orgId)
      .eq("admin_integrations.slug", "meta-lead-ads")
      .eq("is_enabled", true)
      .maybeSingle();
    const enc = (data?.connected_account as any)?.system_user_token_encrypted;
    if (!enc) return null;
    return await decryptSecret(enc);
  }
  if (ca?.access_token_encrypted) {
    return await decryptSecret(ca.access_token_encrypted);
  }
  return null;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    // Accept any Bearer (user JWT or service-role from pg_net)
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return json({ error: "Invalid auth" }, 401);

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const body = await req.json().catch(() => ({}));
    let {
      organization_id,
      event_name,
      contact_id,
      opportunity_id,
      capi_event_log_id,
      test,
    } = body || {};

    // Reprocess from existing log row
    let logRow: any = null;
    if (capi_event_log_id) {
      const { data } = await admin
        .from("capi_event_log")
        .select("*")
        .eq("id", capi_event_log_id)
        .maybeSingle();
      if (!data) return json({ error: "Log não encontrado" }, 404);
      logRow = data;
      organization_id = data.organization_id;
      event_name = data.event_name;
      contact_id = data.contact_id;
      opportunity_id = data.opportunity_id;
    }

    if (!organization_id || !event_name) {
      return json({ error: "organization_id e event_name são obrigatórios" }, 400);
    }

    // Load CAPI integration
    const { data: oi } = await admin
      .from("organization_integrations")
      .select("id, connected_account, admin_integrations!inner(slug)")
      .eq("organization_id", organization_id)
      .eq("admin_integrations.slug", "meta-capi")
      .eq("is_enabled", true)
      .maybeSingle();

    if (!oi) return json({ error: "Meta CAPI não habilitado pra essa org" }, 400);
    const ca = (oi.connected_account || {}) as any;
    const pixelId = ca.pixel_id;
    if (!pixelId) return json({ error: "Pixel ID não configurado" }, 400);

    const accessToken = await getAccessToken(admin, organization_id, ca);
    if (!accessToken) return json({ error: "Access token não disponível" }, 400);

    // Load contact
    let contact: any = null;
    if (contact_id) {
      const { data } = await admin
        .from("contacts")
        .select("id, first_name, last_name, full_name, email, phone")
        .eq("id", contact_id)
        .maybeSingle();
      contact = data;
    }

    // Load opportunity
    let opportunity: any = null;
    if (opportunity_id) {
      const { data } = await admin
        .from("opportunities")
        .select("id, title, amount, currency")
        .eq("id", opportunity_id)
        .maybeSingle();
      opportunity = data;
    }

    const eventTime = Math.floor(Date.now() / 1000);
    const eventId = logRow?.event_id ||
      `${organization_id}:${event_name}:${contact_id || "x"}:${opportunity_id || "x"}:${eventTime}`;
    const sourceUrl = ca.default_event_source_url || undefined;
    const userData: Record<string, unknown> = await buildUserData(contact);

    // Fallback matching params (Meta requires at least one) — use request headers
    const clientUa = req.headers.get("user-agent") || undefined;
    const xff = req.headers.get("x-forwarded-for") || "";
    const clientIp = xff.split(",")[0]?.trim() || undefined;
    if (clientUa) userData.client_user_agent = clientUa;
    if (clientIp) userData.client_ip_address = clientIp;
    // Ensure at least one matching key for manual tests without contact
    const hasMatchKey = (userData as any).em || (userData as any).ph || (userData as any).fn || (userData as any).ln;
    if (!hasMatchKey) {
      userData.external_id = [await sha256Hex(`org:${organization_id}`)];
    }

    const customData: Record<string, unknown> = {};
    if (opportunity?.amount) customData.value = Number(opportunity.amount);
    if (opportunity?.currency) customData.currency = opportunity.currency;
    if (opportunity?.title) customData.content_name = opportunity.title;
    // Purchase requires value + currency — fallback defaults
    if (event_name === "Purchase") {
      if (customData.value === undefined) customData.value = 0;
      if (!customData.currency) customData.currency = "BRL";
    }

    const eventPayload: Record<string, unknown> = {
      event_name,
      event_time: eventTime,
      event_id: eventId,
      action_source: "system_generated",
      user_data: userData,
    };
    if (sourceUrl) eventPayload.event_source_url = sourceUrl;
    if (Object.keys(customData).length > 0) eventPayload.custom_data = customData;

    const requestBody: Record<string, unknown> = { data: [eventPayload] };
    if (test && !ca.test_event_code) {
      // Manual test without configured test code — still send, just mark
    }
    if (ca.test_event_code) requestBody.test_event_code = ca.test_event_code;

    // Insert/update log row (status=pending) BEFORE sending
    let logId = logRow?.id as string | undefined;
    const baseLog = {
      organization_id,
      event_id: eventId,
      event_name,
      event_time: new Date(eventTime * 1000).toISOString(),
      event_source_url: sourceUrl || null,
      contact_id: contact_id || null,
      opportunity_id: opportunity_id || null,
      payload: requestBody,
      test_event_code: ca.test_event_code || null,
    };

    if (logId) {
      await admin.from("capi_event_log").update({
        ...baseLog,
        status: "pending",
        attempt_count: (logRow?.attempt_count || 0) + 1,
        last_attempt_at: new Date().toISOString(),
        meta_error: null,
        meta_response: null,
      }).eq("id", logId);
    } else {
      const { data: ins, error } = await admin
        .from("capi_event_log")
        .insert({
          ...baseLog,
          status: "pending",
          attempt_count: 1,
          last_attempt_at: new Date().toISOString(),
        })
        .select("id")
        .single();
      if (error) throw error;
      logId = ins.id;
    }

    // POST to Meta
    const url = `https://graph.facebook.com/${META_API_VERSION}/${pixelId}/events?access_token=${encodeURIComponent(accessToken)}`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(requestBody),
    });
    const respJson = await res.json().catch(() => ({}));

    if (!res.ok || respJson.error) {
      const errMsg = respJson?.error?.message || `HTTP ${res.status}`;
      const errCode = respJson?.error?.code;
      const isPermanent = errCode === 100 || errCode === 190;
      await admin.from("capi_event_log").update({
        status: isPermanent ? "permanent_failure" : "failed",
        meta_response: respJson,
        meta_error: errMsg,
        next_retry_at: isPermanent ? null : new Date(Date.now() + 5 * 60 * 1000).toISOString(),
      }).eq("id", logId!);
      return json({ error: errMsg, meta_error_code: errCode, capi_event_log_id: logId }, 200);
    }

    await admin.from("capi_event_log").update({
      status: "sent",
      meta_response: respJson,
      meta_error: null,
      next_retry_at: null,
    }).eq("id", logId!);

    return json({ success: true, capi_event_log_id: logId, meta_response: respJson });
  } catch (e: any) {
    console.error("meta-capi-send-event error", e);
    return json({ error: e.message || "Internal error" }, 500);
  }
});
