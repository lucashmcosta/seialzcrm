import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { decryptSecret } from "../_shared/crypto.ts";

const META_API_VERSION = Deno.env.get("META_GRAPH_API_VERSION") || "v25.0";

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
  return s ? s.trim().toLowerCase().replace(/\s+/g, "") : null;
}
function normPhone(s?: string | null) {
  if (!s) return null;
  let d = s.replace(/\D+/g, "");
  if (!d.length) return null;
  // Garante prefixo de país (BR default 55) — telefones BR têm 10 ou 11 dígitos
  if (d.length === 10 || d.length === 11) d = "55" + d;
  return d;
}
function normText(s?: string | null) {
  return s ? s.trim().toLowerCase() : null;
}
function normZip(s?: string | null) {
  if (!s) return null;
  const d = s.replace(/\D+/g, "");
  return d.length ? d : null;
}
function normCountry(s?: string | null) {
  if (!s) return null;
  const c = s.trim().toLowerCase();
  // Aceita "Brasil"/"Brazil"/"BR" → "br"
  if (c === "brasil" || c === "brazil") return "br";
  return c.length === 2 ? c : c.slice(0, 2);
}

function splitName(full?: string | null): { fn?: string | null; ln?: string | null } {
  if (!full) return {};
  const parts = full.trim().split(/\s+/);
  if (parts.length === 1) return { fn: parts[0] };
  return { fn: parts[0], ln: parts.slice(1).join(" ") };
}

async function buildUserData(contact: any | null) {
  const ud: Record<string, unknown> = {};
  if (!contact) return ud;

  const email = normEmail(contact.email);
  const phone = normPhone(contact.phone);

  // Nome: prefere first/last; se faltar, faz split do full_name
  let fnRaw = contact.first_name as string | null | undefined;
  let lnRaw = contact.last_name as string | null | undefined;
  if ((!fnRaw || !lnRaw) && contact.full_name) {
    const split = splitName(contact.full_name);
    if (!fnRaw) fnRaw = split.fn ?? null;
    if (!lnRaw) lnRaw = split.ln ?? null;
  }
  const fn = normText(fnRaw);
  const ln = normText(lnRaw);
  const ct = normText(contact.address_city);
  const st = normText(contact.address_state);
  const zp = normZip(contact.address_zip);
  const country = normCountry(contact.address_country) || "br";

  if (email) ud.em = [await sha256Hex(email)];
  if (phone) ud.ph = [await sha256Hex(phone)];
  if (fn) ud.fn = [await sha256Hex(fn)];
  if (ln) ud.ln = [await sha256Hex(ln)];
  if (ct) ud.ct = [await sha256Hex(ct)];
  if (st) ud.st = [await sha256Hex(st)];
  if (zp) ud.zp = [await sha256Hex(zp)];
  if (country) ud.country = [await sha256Hex(country)];

  // CTWA Click ID — NÃO hashear
  if (contact.ad_referral_ctwa_clid) {
    ud.ctwa_clid = contact.ad_referral_ctwa_clid;
  }
  // Reconstrói fbc a partir de fbclid
  if (contact.fbclid) {
    const ts = contact.fbclid_captured_at
      ? Math.floor(new Date(contact.fbclid_captured_at).getTime() / 1000)
      : Math.floor(Date.now() / 1000);
    ud.fbc = `fb.1.${ts}.${contact.fbclid}`;
  }
  // External ID estável (id interno do contato)
  if (contact.id) {
    ud.external_id = [await sha256Hex(String(contact.id))];
  }
  // lead_id (Meta Lead Ads)
  if (contact.meta_lead_id) {
    ud.lead_id = String(contact.meta_lead_id);
  }

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

    // Carrega contato com TODOS os campos relevantes para EMQ + CTWA
    let contact: any = null;
    if (contact_id) {
      const { data } = await admin
        .from("contacts")
        .select(
          "id, first_name, last_name, full_name, email, phone, address_city, address_state, address_zip, ad_referral_ctwa_clid, fbclid, ad_referral_source_type, source"
        )
        .eq("id", contact_id)
        .maybeSingle();
      contact = data;
    }

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
    const userData = await buildUserData(contact);

    // NÃO injetar IP/UA do servidor (pg_net / Supabase). Esses campos só fazem sentido
    // quando vêm do navegador real do usuário. Webhooks do WhatsApp/Twilio não fornecem
    // esses dados — Meta tolera ausência e usa outros sinais (ctwa_clid, ph, fn, external_id).
    const fwdUa = req.headers.get("user-agent") || "";
    const xff = req.headers.get("x-forwarded-for") || "";
    const fwdIp = xff.split(",")[0]?.trim() || "";
    const isServerSideUa = !fwdUa || /pg_net|supabase|deno|node-fetch|curl|axios/i.test(fwdUa);
    if (!isServerSideUa) userData.client_user_agent = fwdUa;
    if (fwdIp && !isServerSideUa) userData.client_ip_address = fwdIp;

    const hasMatchKey = (userData as any).em || (userData as any).ph || (userData as any).fn || (userData as any).ln || (userData as any).external_id;
    if (!hasMatchKey) {
      userData.external_id = [await sha256Hex(`org:${organization_id}`)];
    }

    const customData: Record<string, unknown> = {};
    if (opportunity?.amount) customData.value = Number(opportunity.amount);
    if (opportunity?.currency) customData.currency = opportunity.currency;
    if (opportunity?.title) customData.content_name = opportunity.title;

    if (event_name === "Purchase") {
      if (customData.value === undefined) customData.value = 0;
      if (!customData.currency) customData.currency = "BRL";
      if (opportunity_id) customData.order_id = opportunity_id;
    }

    if (event_name === "Lead") {
      if (customData.value === undefined) customData.value = 0;
      if (!customData.currency) customData.currency = "BRL";
      // CTWA flag
      if (contact?.ad_referral_ctwa_clid || contact?.ad_referral_source_type) {
        customData.lead_event_source = "CTWA_WhatsApp";
      }
    }

    // action_source dinâmico baseado em contact.source
    const contactSource: string = (contact?.source || "").toLowerCase();
    let actionSource = "system_generated";
    let messagingChannel: string | null = null;
    if (
      contactSource === "ctwa" ||
      contactSource === "meta_ctwa" ||
      contactSource === "whatsapp" ||
      contact?.ad_referral_ctwa_clid
    ) {
      actionSource = "business_messaging";
      messagingChannel = "whatsapp";
    } else if (contactSource === "meta_lead_ads") {
      actionSource = "system_generated";
    } else if (contactSource.startsWith("landing_page")) {
      actionSource = "website";
    }

    const eventPayload: Record<string, unknown> = {
      event_name,
      event_time: eventTime,
      event_id: eventId,
      action_source: actionSource,
      user_data: userData,
    };
    if (messagingChannel) eventPayload.messaging_channel = messagingChannel;
    if (sourceUrl) eventPayload.event_source_url = sourceUrl;
    if (Object.keys(customData).length > 0) eventPayload.custom_data = customData;

    const requestBody: Record<string, unknown> = {
      data: [eventPayload],
      access_token: accessToken,
    };
    if (ca.test_event_code) requestBody.test_event_code = ca.test_event_code;

    let logId = logRow?.id as string | undefined;
    // Payload persistido SEM access_token
    const persistedPayload = { ...requestBody, access_token: "***" };
    const baseLog = {
      organization_id,
      event_id: eventId,
      event_name,
      event_time: new Date(eventTime * 1000).toISOString(),
      event_source_url: sourceUrl || null,
      contact_id: contact_id || null,
      opportunity_id: opportunity_id || null,
      payload: persistedPayload,
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

    const url = `https://graph.facebook.com/${META_API_VERSION}/${pixelId}/events`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(requestBody),
    });
    const respJson = await res.json().catch(() => ({}));

    if (!res.ok || respJson.error) {
      const err = respJson?.error || {};
      const errMsg = err.message || `HTTP ${res.status}`;
      const errCode = err.code;
      const errSubcode = err.error_subcode;
      // 100 = invalid params (geralmente permanente), 190 = token inválido, 17 = rate limit (transitório)
      const isPermanent = errCode === 100 || errCode === 190;
      const isRateLimit = errCode === 17 || errCode === 4 || errCode === 32;
      const attempts = (logRow?.attempt_count || 0) + 1;
      const giveUp = isPermanent || attempts >= 5;

      const enrichedError = {
        message: errMsg,
        code: errCode,
        error_subcode: errSubcode,
        error_user_title: err.error_user_title,
        error_user_msg: err.error_user_msg,
        fbtrace_id: respJson?.fbtrace_id,
      };

      // Backoff exponencial: 5min, 15min, 45min, 2h, 6h
      const backoffMs = isRateLimit ? 60 * 60 * 1000 : Math.min(5 * 60 * 1000 * Math.pow(3, attempts - 1), 6 * 60 * 60 * 1000);

      await admin.from("capi_event_log").update({
        status: giveUp ? "permanent_failure" : "failed",
        meta_response: respJson,
        meta_error: JSON.stringify(enrichedError),
        next_retry_at: giveUp ? null : new Date(Date.now() + backoffMs).toISOString(),
      }).eq("id", logId!);

      return json({ error: errMsg, meta_error_code: errCode, meta_error_subcode: errSubcode, fbtrace_id: respJson?.fbtrace_id, capi_event_log_id: logId }, 200);
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
