// meta-whatsapp-embedded-signup — conclui o WhatsApp Embedded Signup (v4) da plataforma.
//
// Fluxo (Tech Provider, docs Meta "Onboarding business customers as a Tech Provider"):
//   1) consome o intent one-time (meta_connection_intents) — mesmo org + user, não expirado;
//   2) troca o `code` do FB.login por business token (FACEBOOK_APP_ID/SECRET);
//   3) debug_token → só aceita WABA presente nos target_ids granulares do token;
//   4) valida número ∈ WABA (Graph) e deriva o E.164 do display_phone_number;
//   5) POST /{waba}/subscribed_apps (webhook do app da plataforma) — fail-closed, antes de gravar;
//   6) registra o número na Cloud API se ainda não estiver (PIN 2FA gerado e cifrado) — não bloqueia;
//   7) grava organization_integrations (meta_waba_id) + communication_endpoints de forma
//      idempotente: mesma WABA via Embedded Signup = re-autoriza; conexão manual = recusa;
//   8) vincula à Route (provision_line_endpoint), como o modo manual.
// O webhook e o envio continuam lendo connected_account (resolveMetaCredentials, fallback legado),
// então nada no caminho quente muda. verify_jwt=true. Nunca loga token, code ou PIN.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { encryptSecret } from "../_shared/crypto.ts";
import {
  exchangeCodeForToken,
  facebookAppId,
  facebookAppSecret,
  facebookConfigured,
  introspectToken,
} from "../_shared/meta/connection.ts";
import {
  metaWaGet,
  metaWaPostJson,
  metaWaSubscribeAppToWaba,
  MetaWaGraphError,
  validateCredentials,
} from "../_shared/meta-whatsapp/graph.ts";
import {
  EMBEDDED_ERROR_MESSAGES,
  EMBEDDED_SOURCE,
  findMovedNumberRow,
  generateTwoStepPin,
  multiWabaEnabledFor,
  planEmbeddedWrite,
  resolveSignupAssets,
  toE164,
  wabaIdsFromGranularScopes,
} from "../_shared/meta-whatsapp/embedded-signup.ts";

type Purpose = "customer_service" | "commercial";

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
function fail(status: number, error: string, extra: Record<string, unknown> = {}) {
  return json({ ok: false, error, message: EMBEDDED_ERROR_MESSAGES[error], ...extra }, status);
}
function graphErr(e: unknown) {
  return e instanceof MetaWaGraphError ? e.error : { message: (e as Error)?.message ?? "unknown" };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return fail(405, "method_not_allowed");

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) return fail(401, "unauthorized");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseUser = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: claims, error: claimsErr } = await supabaseUser.auth.getClaims(
      authHeader.replace("Bearer ", ""),
    );
    if (claimsErr || !claims?.claims?.sub) return fail(401, "unauthorized");

    const body = await req.json().catch(() => null) as Record<string, unknown> | null;
    if (!body) return fail(400, "invalid_json");
    const organizationId = String(body.organization_id ?? "");
    const intentId = String(body.intent_id ?? "");
    const code = String(body.code ?? "");
    const sessionWabaId = typeof body.waba_id === "string" ? body.waba_id : null;
    const sessionPhoneId = typeof body.phone_number_id === "string" ? body.phone_number_id : null;
    const sessionBusinessId = typeof body.business_id === "string" ? body.business_id : null;
    const purpose: Purpose = body.purpose === "commercial" ? "commercial" : "customer_service";
    if (!organizationId || !intentId || !code) return fail(400, "missing_fields");
    if (!facebookConfigured()) return fail(503, "facebook_not_configured");

    const appId = facebookAppId()!;
    const appSecret = facebookAppSecret()!;
    const admin = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    // ---- 0) usuário + membership ----
    const { data: userRow } = await admin
      .from("users").select("id").eq("auth_user_id", claims.claims.sub).maybeSingle();
    if (!userRow?.id) return fail(403, "user_not_found");
    const { data: membership } = await admin
      .from("user_organizations").select("organization_id")
      .eq("user_id", userRow.id).eq("organization_id", organizationId).eq("is_active", true)
      .maybeSingle();
    if (!membership) return fail(403, "not_a_member");

    // ---- 1) intent one-time ----
    const { data: consumed } = await admin
      .from("meta_connection_intents")
      .update({ used_at: new Date().toISOString() })
      .eq("id", intentId)
      .eq("organization_id", organizationId)
      .eq("user_id", userRow.id)
      .is("used_at", null)
      .gt("expires_at", new Date().toISOString())
      .select("id").maybeSingle();
    if (!consumed) return fail(400, "invalid_or_expired_intent");

    // ---- 2) code → business token ----
    let accessToken: string;
    try {
      accessToken = (await exchangeCodeForToken(code)).access_token;
    } catch {
      return fail(400, "token_exchange_failed");
    }

    // ---- 3) quais WABAs o token realmente autoriza ----
    let grantedWabaIds: string[];
    let tokenType: string;
    try {
      const debug = await introspectToken(accessToken);
      grantedWabaIds = wabaIdsFromGranularScopes(debug.granular_scopes);
      tokenType = debug.token_type;
      const scopes = new Set(debug.scopes);
      if (!scopes.has("whatsapp_business_management") || !scopes.has("whatsapp_business_messaging")) {
        return fail(400, "missing_whatsapp_scopes", { granted_scopes: debug.scopes });
      }
    } catch {
      return fail(400, "token_introspection_failed");
    }

    const callOpts = { accessToken, appSecret };
    const phonesByWaba = new Map<string, string[]>();
    if (!sessionPhoneId) {
      // Sem session info do popup: precisa listar os números para escolher o único.
      for (const w of grantedWabaIds) {
        try {
          const r = await metaWaGet(`/${w}/phone_numbers`, { fields: "id" }, callOpts);
          phonesByWaba.set(w, (r?.data ?? []).map((p: { id: string }) => String(p.id)));
        } catch (e) {
          return fail(502, "waba_phone_list_failed", { meta_error: graphErr(e) });
        }
      }
    }
    const resolved = resolveSignupAssets({
      sessionWabaId,
      sessionPhoneNumberId: sessionPhoneId,
      grantedWabaIds,
      // Com session info, validateCredentials abaixo confere o vínculo número ∈ WABA.
      wabaPhoneIds: (w) => sessionPhoneId ? [sessionPhoneId] : (phonesByWaba.get(w) ?? []),
    });
    if (!resolved.ok) return fail(400, resolved.error);
    const { wabaId, phoneNumberId } = resolved;

    // ---- 4) valida número ∈ WABA ----
    let meta: Awaited<ReturnType<typeof validateCredentials>>;
    try {
      meta = await validateCredentials({ phoneNumberId, wabaId, ...callOpts });
    } catch (e) {
      return fail(502, "meta_validation_failed", { meta_error: graphErr(e) });
    }
    if (!meta.belongs_to_waba) return fail(400, "phone_not_in_waba");
    const phoneE164 = toE164(meta.display_phone_number);
    if (!phoneE164) return fail(400, "invalid_phone_e164", { display_phone_number: meta.display_phone_number });

    // ---- plano de gravação (antes de qualquer efeito na Meta além de leitura) ----
    const { data: integ } = await admin
      .from("admin_integrations").select("id").eq("slug", "meta-whatsapp-cloud").maybeSingle();
    if (!integ?.id) return fail(500, "integration_not_seeded");

    const { data: orgWaRows, error: orgWaErr } = await admin
      .from("organization_integrations")
      .select("id, meta_waba_id, connected_account, config_values")
      .eq("organization_id", organizationId)
      .eq("integration_id", integ.id);
    if (orgWaErr) return fail(500, "oi_lookup_failed", { details: orgWaErr.message });
    // Linhas legadas têm meta_waba_id nulo e a WABA só em connected_account.
    const rowWaba = (r: { meta_waba_id: string | null; connected_account: unknown }) =>
      r.meta_waba_id ?? ((r.connected_account ?? {}) as Record<string, unknown>).waba_id ?? null;
    const exactWabaRow = (orgWaRows ?? []).find((r) => rowWaba(r) === wabaId) ?? null;
    const { data: epByPhone } = await admin
      .from("communication_endpoints")
      .select("id, organization_id, organization_integration_id, provider, sender_sid, purpose")
      .eq("sender_sid", phoneNumberId)
      .in("provider", ["meta_cloud_api", "meta_cloud_api_coexistence"])
      .maybeSingle();
    // Mesmo número que mudou de conta na Meta: re-aponta a linha antiga para a WABA nova.
    const movedRow = findMovedNumberRow({
      organizationId,
      hasRowForNewWaba: !!exactWabaRow,
      endpointByPhoneId: epByPhone ?? null,
      orgRows: orgWaRows ?? [],
    });
    const wabaRow = exactWabaRow ?? movedRow;
    if (movedRow) {
      console.log("[meta-wa-es] number_moved_waba", { from: rowWaba(movedRow), to: wabaId, phoneNumberId });
    }
    // Sem multi-WABA, telas/funções legadas leem a integração da org com maybeSingle:
    // uma 2ª linha quebraria essas leituras. Só re-autoriza a mesma WABA nesse caso.
    if ((orgWaRows ?? []).some((r) => r.id !== wabaRow?.id && rowWaba(r) !== wabaId)) {
      const { data: flag } = await admin
        .from("feature_flags").select("is_enabled, organization_ids")
        .eq("name", "meta_multi_waba").maybeSingle();
      if (!multiWabaEnabledFor(flag, organizationId)) return fail(409, "another_waba_connected");
    }
    const digits = phoneE164.slice(1);
    const { data: sameOrgWa } = await admin
      .from("communication_endpoints")
      .select("id, organization_id, organization_integration_id, provider, sender_sid, external_address, is_active")
      .eq("organization_id", organizationId)
      .eq("channel", "whatsapp");
    // Espelha os índices únicos: (org, dígitos) entre ativos e (org, dígitos, provider) sempre.
    const epByAddress = (sameOrgWa ?? []).find(
      (e) =>
        String(e.external_address ?? "").replace(/\D/g, "") === digits &&
        (e.is_active || e.provider === "meta_cloud_api"),
    ) ?? null;

    const priorCa = (wabaRow?.connected_account ?? {}) as Record<string, unknown>;
    const plan = planEmbeddedWrite({
      organizationId,
      existingWaba: wabaRow ? { id: wabaRow.id, source: (priorCa.source as string) ?? null } : null,
      endpointByPhoneId: epByPhone ?? null,
      endpointByAddress: epByAddress,
    });
    if (plan.action === "conflict") {
      return fail(409, plan.error, {
        existing_endpoint_id: plan.existingEndpointId,
        existing_provider: plan.existingProvider,
      });
    }
    if (plan.action === "reauthorize" && epByPhone?.purpose && epByPhone.purpose !== purpose) {
      // Nunca reclassifica a finalidade de um endpoint existente (mesma regra do modo manual).
      return fail(409, "endpoint_purpose_conflict", { existing_purpose: epByPhone.purpose });
    }

    // ---- 5) webhook do app da plataforma nesta WABA (idempotente) ----
    let subscription: Awaited<ReturnType<typeof metaWaSubscribeAppToWaba>>;
    try {
      subscription = await metaWaSubscribeAppToWaba(wabaId, callOpts);
    } catch (e) {
      return fail(502, "waba_subscribe_failed", { meta_error: graphErr(e) });
    }

    // ---- 6) registro na Cloud API (não bloqueia: o número pode já estar registrado) ----
    let registration: { status: "already_registered" | "registered" | "failed"; error?: unknown } = {
      status: "failed",
    };
    let pinEncrypted = (priorCa.two_step_pin_encrypted as string | undefined) ?? null;
    try {
      const info = await metaWaGet(`/${phoneNumberId}`, { fields: "platform_type,status" }, callOpts);
      if (info?.platform_type === "CLOUD_API") {
        registration = { status: "already_registered" };
      } else {
        const pin = generateTwoStepPin();
        await metaWaPostJson(`/${phoneNumberId}/register`, { messaging_product: "whatsapp", pin }, callOpts);
        pinEncrypted = await encryptSecret(pin);
        registration = { status: "registered" };
      }
    } catch (e) {
      registration = { status: "failed", error: graphErr(e) };
      console.warn("[meta-wa-es] register failed", { wabaId, phoneNumberId, error: graphErr(e) });
    }

    // ---- 7) gravação ----
    const nowIso = new Date().toISOString();
    const connectedAccount = {
      app_id: appId,
      waba_id: wabaId,
      phone_number_id: phoneNumberId,
      business_id: sessionBusinessId,
      display_phone_number: meta.display_phone_number,
      verified_name: meta.verified_name ?? null,
      access_token_encrypted: await encryptSecret(accessToken),
      // Sem cópia de segredos da plataforma: com source='embedded_signup', webhook/envio
      // leem FACEBOOK_APP_SECRET do env (platformAppSecretFor) e o handshake usa
      // META_WA_WEBHOOK_VERIFY_TOKEN. Rotacionar qualquer um não exige reconectar.
      app_secret_encrypted: null,
      verify_token_encrypted: null,
      two_step_pin_encrypted: pinEncrypted,
      token_type: tokenType,
      token_stored_at: nowIso,
      source: EMBEDDED_SOURCE,
    };
    const configValues = {
      ...((wabaRow?.config_values ?? {}) as Record<string, unknown>),
      app_id: appId,
      waba_id: wabaId,
      phone_number_id: phoneNumberId,
      phone_e164: phoneE164,
      display_phone_number: meta.display_phone_number,
      verified_name: meta.verified_name ?? null,
      quality_rating: meta.quality_rating ?? null,
      messaging_limit_tier: meta.messaging_limit_tier ?? null,
      last_validated_at: nowIso,
      webhook_subscribed: true,
      webhook_subscribed_at: nowIso,
      subscribed_app_ids: subscription.app_ids,
      registration_status: registration.status,
      connection_source: EMBEDDED_SOURCE,
    };
    const displayName = meta.verified_name || `WhatsApp ${phoneE164}`;

    let oiId: string;
    let createdOi = false;
    if (plan.action === "reauthorize") {
      const { error } = await admin.from("organization_integrations").update({
        is_enabled: true,
        meta_waba_id: wabaId,
        connected_account: connectedAccount,
        config_values: configValues,
        connected_at: nowIso,
        connected_by_user_id: userRow.id,
      }).eq("id", plan.organizationIntegrationId);
      if (error) return fail(500, "oi_update_failed", { details: error.message });
      oiId = plan.organizationIntegrationId;
    } else {
      const { data: ins, error } = await admin.from("organization_integrations").insert({
        organization_id: organizationId,
        integration_id: integ.id,
        is_enabled: true,
        meta_waba_id: wabaId,
        display_name: displayName,
        connected_account: connectedAccount,
        config_values: configValues,
        connected_at: nowIso,
        connected_by_user_id: userRow.id,
      }).select("id").single();
      if (error || !ins?.id) {
        const unique = (error as { code?: string } | null)?.code === "23505";
        return fail(unique ? 409 : 500, unique ? "concurrent_connection" : "oi_insert_failed", {
          details: error?.message,
        });
      }
      oiId = ins.id;
      createdOi = true;
    }

    const currentTier = typeof meta.messaging_limit_tier === "string"
      ? Number(meta.messaging_limit_tier.replace(/\D/g, "")) || null
      : null;
    const endpointPayload = {
      organization_id: organizationId,
      organization_integration_id: oiId,
      channel: "whatsapp",
      provider: "meta_cloud_api",
      external_account_id: wabaId,
      sender_sid: phoneNumberId,
      external_address: phoneE164,
      display_name: meta.verified_name ?? meta.display_phone_number,
      purpose,
      is_active: true,
      status: "online",
      quality_rating: meta.quality_rating ?? null,
      current_tier: currentTier,
      metadata: {
        meta: {
          verified_name: meta.verified_name ?? null,
          display_phone_number: meta.display_phone_number,
          last_validated_at: nowIso,
        },
        source: EMBEDDED_SOURCE,
      },
    };
    const existingEpId = plan.action === "reauthorize" ? plan.endpointId : null;
    let endpointId: string;
    if (existingEpId) {
      const { error } = await admin.from("communication_endpoints")
        .update(endpointPayload).eq("id", existingEpId);
      if (error) return fail(500, "endpoint_update_failed", { details: error.message });
      endpointId = existingEpId;
    } else {
      const { data: ep, error } = await admin.from("communication_endpoints")
        .insert(endpointPayload).select("id").single();
      if (error || !ep?.id) {
        if (createdOi) await admin.from("organization_integrations").delete().eq("id", oiId);
        const unique = (error as { code?: string } | null)?.code === "23505";
        return fail(unique ? 409 : 500, unique ? "concurrent_connection" : "endpoint_insert_failed", {
          details: error?.message,
        });
      }
      endpointId = ep.id;
    }

    // ---- 8) Route (Comercial / Atendimento) — falha não invalida a conexão ----
    let routeLinkError: string | null = null;
    const wantedInbox = purpose === "customer_service" ? "customer_service" : "sales";
    const { data: line } = await admin
      .from("messaging_lines").select("id")
      .eq("organization_id", organizationId).eq("channel", "whatsapp")
      .eq("inbox_key", wantedInbox).eq("is_active", true)
      .order("created_at", { ascending: true }).limit(1).maybeSingle();
    if (!line?.id) {
      routeLinkError = "route_not_found";
    } else {
      const { error: provErr } = await supabaseUser.rpc("provision_line_endpoint", {
        p_organization_id: organizationId,
        p_line_id: line.id,
        p_provider: "meta",
        p_address: phoneE164,
        p_purpose: purpose,
        p_display_name: null,
        p_instance_name: null,
        p_assigned_user_id: null,
      });
      if (provErr) routeLinkError = provErr.message;
    }

    console.log("[meta-wa-es] connected", {
      organizationId, oiId, endpointId, wabaId, phoneNumberId,
      plan: plan.action, registration: registration.status, routeLinkError,
    });
    return json({
      ok: true,
      mode: plan.action,
      organization_integration_id: oiId,
      endpoint_id: endpointId,
      waba_id: wabaId,
      phone_number_id: phoneNumberId,
      phone_e164: phoneE164,
      verified_name: meta.verified_name ?? null,
      registration_status: registration.status,
      registration_error: registration.error ?? null,
      route_link_error: routeLinkError,
    });
  } catch (e) {
    console.error("[meta-wa-es] fatal", (e as Error).message);
    return fail(500, "internal_error");
  }
});
