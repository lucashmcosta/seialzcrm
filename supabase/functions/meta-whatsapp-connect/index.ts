// Conecta a integração Meta WhatsApp Cloud de uma organização.
// 1) Valida JWT do usuário e descobre organization_id via user_organizations.
// 2) Valida credenciais Meta (Graph API).
// 3) Criptografa o System User Token (AES-GCM) e grava em organization_integrations.
// 4) Cria/atualiza communication_endpoint com provider='meta-cloud'.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { encryptSecret, decryptSecret } from "../_shared/crypto.ts";
import { validateCredentials, MetaWaGraphError } from "../_shared/meta-whatsapp/graph.ts";

interface ConnectBody {
  organizationId: string;
  appId: string;
  wabaId: string;
  phoneNumberId: string;
  phoneE164: string; // +5511999999999
  systemUserToken: string;
  appSecret?: string;     // per-integration — obrigatório em conexão nova
  verifyToken?: string;   // per-integration — obrigatório em conexão nova
  endpointPurpose?: "commercial" | "customer_service" | "vendor_personal" | "other";
  displayName?: string;
  skipMetaValidation?: boolean;
  // 'primary' (default): comportamento original — sobrescreve connected_account/config_values
  //                      da integração com os dados do número informado.
  // 'additional': adiciona apenas a linha em communication_endpoints na MESMA WABA já conectada.
  //               Não toca campos phone-level da integração. Requer integração já conectada e
  //               wabaId idêntico ao já armazenado. systemUserToken/appSecret/verifyToken
  //               opcionais (reaproveita os já cifrados quando ausentes).
  mode?: "primary" | "additional";
}

function err(status: number, message: string, extra: Record<string, unknown> = {}) {
  return new Response(JSON.stringify({ error: message, ...extra }), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function validationResult(message: string, extra: Record<string, unknown> = {}) {
  return new Response(JSON.stringify({ ok: false, error: message, ...extra }), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return err(405, "method_not_allowed");

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) return err(401, "unauthorized");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const supabaseUser = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsErr } = await supabaseUser.auth.getClaims(token);
    if (claimsErr || !claimsData?.claims?.sub) return err(401, "unauthorized");
    const authUid = claimsData.claims.sub as string;

    const body = (await req.json().catch(() => null)) as ConnectBody | null;
    if (!body) return err(400, "invalid_json");

    const mode: "primary" | "additional" = body.mode === "additional" ? "additional" : "primary";
    const required: (keyof ConnectBody)[] = mode === "additional"
      ? ["organizationId", "wabaId", "phoneNumberId", "phoneE164"]
      : ["organizationId", "appId", "wabaId", "phoneNumberId", "phoneE164", "systemUserToken"];
    for (const f of required) {
      if (!body[f] || typeof body[f] !== "string") {
        return err(400, "missing_field", { field: f });
      }
    }
    if (!/^\+\d{8,15}$/.test(body.phoneE164)) return err(400, "invalid_phone_e164");

    const admin = createClient(supabaseUrl, serviceKey);

    // Garante que o auth_uid pertence à organização e tem permissão de gerenciar integrações.
    const { data: userRow } = await admin
      .from("users")
      .select("id")
      .eq("auth_user_id", authUid)
      .maybeSingle();
    if (!userRow?.id) return err(403, "user_not_found");

    const { data: membership, error: memErr } = await admin
      .from("user_organizations")
      .select("organization_id, is_active")
      .eq("user_id", userRow.id)
      .eq("organization_id", body.organizationId)
      .eq("is_active", true)
      .maybeSingle();
    if (memErr) {
      console.error("[meta-whatsapp-connect] membership query error", memErr);
      return err(500, "membership_query_failed", { details: memErr.message });
    }
    if (!membership) return err(403, "not_a_member");

    // Busca integration_id e estado anterior cedo para validar credenciais per-tenant.
    const { data: integ } = await admin
      .from("admin_integrations")
      .select("id")
      .eq("slug", "meta-whatsapp-cloud")
      .maybeSingle();
    if (!integ?.id) return err(500, "integration_not_seeded");

    const { data: priorOi } = await admin
      .from("organization_integrations")
      .select("connected_account")
      .eq("organization_id", body.organizationId)
      .eq("integration_id", integ.id)
      .maybeSingle();
    const priorCa = (priorOi?.connected_account ?? {}) as any;
    const hasStoredAppSecret = !!priorCa.app_secret_encrypted;
    const hasStoredVerifyToken = !!priorCa.verify_token_encrypted;

    // === mode='additional': exige integração já conectada na MESMA WABA ===
    if (mode === "additional") {
      if (!priorOi) return err(400, "integration_not_connected");
      const priorWabaId = priorCa.waba_id as string | undefined;
      if (!priorWabaId) return err(400, "integration_missing_waba");
      if (priorWabaId !== body.wabaId) {
        return err(400, "waba_mismatch", {
          expected: priorWabaId,
          received: body.wabaId,
        });
      }
      if (!priorCa.access_token_encrypted) {
        return err(400, "integration_missing_token");
      }
    } else {
      // Fase 3: App Secret e Verify Token são obrigatórios em nova conexão.
      // Em edição, podem vir vazios — preservamos o valor já cifrado.
      if (!hasStoredAppSecret && !(body.appSecret && body.appSecret.trim())) {
        return err(400, "missing_field", { field: "appSecret" });
      }
      if (!hasStoredVerifyToken && !(body.verifyToken && body.verifyToken.trim())) {
        return err(400, "missing_field", { field: "verifyToken" });
      }
    }

    // Valida credenciais Meta (Graph API). Pode ser pulado via skipMetaValidation
    // para permitir edição manual quando a Meta recusa por motivos externos (token/permissão).
    // Fase 3: App Secret é estritamente per-integration. Sem fallback global.
    let appSecret = body.appSecret?.trim() || undefined;
    if (!appSecret && hasStoredAppSecret) {
      try {
        appSecret = (await decryptSecret(priorCa.app_secret_encrypted)).trim() || undefined;
      } catch (e) {
        console.error("[meta-whatsapp-connect] decrypt prior app_secret failed", (e as Error).message);
      }
    }

    // accessToken efetivo para validar com a Meta:
    // - primary: usa o token vindo do body (obrigatório)
    // - additional: usa o token novo se vier, senão decripta o já armazenado
    let effectiveAccessToken = body.systemUserToken?.trim() || undefined;
    if (!effectiveAccessToken && mode === "additional") {
      try {
        effectiveAccessToken = (await decryptSecret(priorCa.access_token_encrypted)).trim() || undefined;
      } catch (e) {
        console.error("[meta-whatsapp-connect] decrypt prior access_token failed", (e as Error).message);
      }
    }
    if (!effectiveAccessToken && !body.skipMetaValidation) {
      return err(400, "missing_access_token");
    }

    let meta: {
      display_phone_number: string;
      verified_name?: string | null;
      quality_rating?: string | null;
      messaging_limit_tier?: string | null;
      belongs_to_waba: boolean;
    };
    if (body.skipMetaValidation) {
      meta = {
        display_phone_number: body.phoneE164,
        verified_name: null,
        quality_rating: null,
        messaging_limit_tier: null,
        belongs_to_waba: true,
      };
    } else {
      try {
        meta = await validateCredentials({
          phoneNumberId: body.phoneNumberId,
          wabaId: body.wabaId,
          accessToken: effectiveAccessToken!,
          appSecret,
        });
      } catch (e) {
        if (e instanceof MetaWaGraphError) {
          return validationResult("meta_validation_failed", {
            meta_error: e.error,
            step: "graph_api",
          });
        }
        throw e;
      }
      if (!meta.belongs_to_waba) {
        return validationResult("phone_not_in_waba", {
          message: "O Phone Number ID informado não pertence ao WABA informado.",
        });
      }
    }

    // === Upsert organization_integrations ===
    // - primary: comportamento original (overwrite connected_account/config_values)
    // - additional: NÃO toca a integração existente; apenas reaproveita seu id.
    let orgIntegrationId: string;
    if (mode === "additional") {
      // priorOi já foi validado acima; precisamos do id.
      const { data: oiRow } = await admin
        .from("organization_integrations")
        .select("id")
        .eq("organization_id", body.organizationId)
        .eq("integration_id", integ.id)
        .maybeSingle();
      if (!oiRow?.id) return err(400, "integration_not_connected");
      orgIntegrationId = oiRow.id;
    } else {
      const encryptedToken = await encryptSecret(body.systemUserToken);

      const appSecretEncrypted = body.appSecret && body.appSecret.trim()
        ? await encryptSecret(body.appSecret.trim())
        : (priorCa.app_secret_encrypted ?? null);
      const verifyTokenEncrypted = body.verifyToken && body.verifyToken.trim()
        ? await encryptSecret(body.verifyToken.trim())
        : (priorCa.verify_token_encrypted ?? null);

      const connectedAccount = {
        app_id: body.appId,
        waba_id: body.wabaId,
        phone_number_id: body.phoneNumberId,
        display_phone_number: meta.display_phone_number,
        verified_name: meta.verified_name ?? null,
        access_token_encrypted: encryptedToken,
        app_secret_encrypted: appSecretEncrypted,
        verify_token_encrypted: verifyTokenEncrypted,
        token_stored_at: new Date().toISOString(),
      };

      const configValues = {
        app_id: body.appId,
        waba_id: body.wabaId,
        phone_number_id: body.phoneNumberId,
        phone_e164: body.phoneE164,
        display_phone_number: meta.display_phone_number,
        verified_name: meta.verified_name ?? null,
        quality_rating: meta.quality_rating ?? null,
        messaging_limit_tier: meta.messaging_limit_tier ?? null,
        last_validated_at: new Date().toISOString(),
      };

      const { data: existingOi } = await admin
        .from("organization_integrations")
        .select("id")
        .eq("organization_id", body.organizationId)
        .eq("integration_id", integ.id)
        .maybeSingle();

      if (existingOi?.id) {
        const { error: updErr } = await admin
          .from("organization_integrations")
          .update({
            is_enabled: true,
            connected_account: connectedAccount,
            config_values: configValues,
            connected_at: new Date().toISOString(),
            connected_by_user_id: userRow.id,
          })
          .eq("id", existingOi.id);
        if (updErr) return err(500, "oi_update_failed", { details: updErr.message });
        orgIntegrationId = existingOi.id;
      } else {
        const { data: ins, error: insErr } = await admin
          .from("organization_integrations")
          .insert({
            organization_id: body.organizationId,
            integration_id: integ.id,
            is_enabled: true,
            connected_account: connectedAccount,
            config_values: configValues,
            connected_at: new Date().toISOString(),
            connected_by_user_id: userRow.id,
          })
          .select("id")
          .single();
        if (insErr || !ins?.id) return err(500, "oi_insert_failed", { details: insErr?.message });
        orgIntegrationId = ins.id;
      }
    }

    // Upsert communication_endpoint (provider='meta-cloud', identificado pelo phone_number_id)
    const { data: existingEp } = await admin
      .from("communication_endpoints")
      .select("id")
      .eq("organization_id", body.organizationId)
      .eq("provider", "meta_cloud_api")
      .eq("sender_sid", body.phoneNumberId)
      .maybeSingle();

    // Fallback: também verifica colisão pelo unique (organization_id, channel, external_address).
    // Se já existir uma linha com o mesmo E.164 mas sender_sid diferente, NÃO sobrescreve —
    // retorna erro claro para proteger endpoints existentes (ex.: +16893077491 não-gerenciado).
    if (!existingEp?.id) {
      const { data: epByAddr } = await admin
        .from("communication_endpoints")
        .select("id, sender_sid, provider")
        .eq("organization_id", body.organizationId)
        .eq("channel", "whatsapp")
        .eq("external_address", body.phoneE164)
        .maybeSingle();
      if (epByAddr?.id) {
        return err(409, "endpoint_address_already_registered", {
          message: "Já existe um endpoint WhatsApp com este número nesta organização.",
          existing_endpoint_id: epByAddr.id,
          existing_provider: epByAddr.provider,
          existing_sender_sid: epByAddr.sender_sid,
        });
      }
    }

    const endpointPayload = {
      organization_id: body.organizationId,
      organization_integration_id: orgIntegrationId,
      channel: "whatsapp" as const,
      provider: "meta_cloud_api" as const,
      external_account_id: body.wabaId,
      sender_sid: body.phoneNumberId,
      external_address: body.phoneE164,
      display_name: body.displayName ?? meta.verified_name ?? meta.display_phone_number,
      purpose: body.endpointPurpose ?? "customer_service",
      is_active: true,
      status: "online",
      quality_rating: meta.quality_rating ?? null,
      current_tier: typeof meta.messaging_limit_tier === "string"
        ? Number(String(meta.messaging_limit_tier).replace(/\D/g, "")) || null
        : null,
      metadata: {
        meta: {
          verified_name: meta.verified_name ?? null,
          display_phone_number: meta.display_phone_number,
          last_validated_at: new Date().toISOString(),
        },
      },
    };

    let endpointId: string;
    if (existingEp?.id) {
      const { error: epErr } = await admin
        .from("communication_endpoints")
        .update(endpointPayload)
        .eq("id", existingEp.id);
      if (epErr) return err(500, "endpoint_update_failed", { details: epErr.message });
      endpointId = existingEp.id;
    } else {
      const { data: ins, error: epErr } = await admin
        .from("communication_endpoints")
        .insert(endpointPayload)
        .select("id")
        .single();
      if (epErr || !ins?.id) return err(500, "endpoint_insert_failed", { details: epErr?.message });
      endpointId = ins.id;
    }

    return new Response(JSON.stringify({
      ok: true,
      organization_integration_id: orgIntegrationId,
      endpoint_id: endpointId,
      meta: {
        display_phone_number: meta.display_phone_number,
        verified_name: meta.verified_name,
        quality_rating: meta.quality_rating,
        messaging_limit_tier: meta.messaging_limit_tier,
      },
    }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("[meta-whatsapp-connect] fatal", e);
    return err(500, "internal_error", { message: (e as Error).message });
  }
});
