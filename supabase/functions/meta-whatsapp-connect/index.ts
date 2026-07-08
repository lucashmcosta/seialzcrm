// Conecta a integração Meta WhatsApp Cloud de uma organização.
// 1) Valida JWT do usuário e descobre organization_id via user_organizations.
// 2) Valida credenciais Meta (Graph API).
// 3) Criptografa o System User Token (AES-GCM) e grava em organization_integrations.
// 4) Cria/atualiza communication_endpoint com provider='meta-cloud'.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { encryptSecret, decryptSecret } from "../_shared/crypto.ts";
import { validateCredentials, metaWaSubscribeAppToWaba, MetaWaGraphError } from "../_shared/meta-whatsapp/graph.ts";

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
  // 'migrate'    : faz UPDATE in-place em um endpoint existente, trocando provider/sender_sid/
  //                organization_integration_id/external_account_id. Preserva id, external_address,
  //                display_name, purpose, histórico de mensagens/threads. Snapshot completo é
  //                gravado em metadata.migration + metadata.migrations[]. Hoje só suporta destino
  //                'meta_cloud_api'. Requer existingEndpointId + provider de destino.
  // 'migrate_dry_run': roda exatamente as mesmas validações de 'migrate', mas NÃO faz UPDATE.
  //                    Retorna before/after para preview.
  // 'add_waba'  : PR1-B. Cria uma NOVA organization_integrations Meta para a mesma org,
  //               reutilizando as credenciais compartilhadas em meta_app_credentials
  //               (populadas no M2). NÃO recebe app_id/systemUserToken/appSecret/verifyToken.
  //               Requer M3 (drop do unique antigo) para inserir a 2ª WABA da org.
  // 'resubscribe_webhook': PR2. Reinscreve o App atual na WABA existente
  //                        (POST /{waba_id}/subscribed_apps + GET de confirmação)
  //                        e atualiza config_values.webhook_subscribed*. Não altera
  //                        endpoints, credenciais nem envia mensagens.
  mode?: "primary" | "additional" | "migrate" | "migrate_dry_run" | "add_waba" | "resubscribe_webhook";
  existingEndpointId?: string;
  provider?: "meta_cloud_api"; // destino da migração
  migrationReason?: string;
  /** resubscribe_webhook: id da organization_integrations alvo. */
  organizationIntegrationId?: string;
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

/**
 * Chama POST/GET /{waba_id}/subscribed_apps e persiste em
 * organization_integrations.config_values.
 * Retorna { ok:true, result } em sucesso ou { ok:false, error, details } em falha.
 */
async function subscribeAndPersist(
  admin: ReturnType<typeof createClient>,
  params: {
    organizationIntegrationId: string;
    wabaId: string;
    accessToken: string;
    appSecret?: string;
    priorConfigValues?: Record<string, unknown> | null;
  },
): Promise<
  | { ok: true; app_ids: string[]; subscribed_apps: unknown[]; post_response: unknown }
  | { ok: false; error: string; details?: unknown }
> {
  try {
    const result = await metaWaSubscribeAppToWaba(params.wabaId, {
      accessToken: params.accessToken,
      appSecret: params.appSecret,
    });
    const nowIso = new Date().toISOString();
    const nextConfig = {
      ...(params.priorConfigValues ?? {}),
      webhook_subscribed: true,
      webhook_subscribed_at: nowIso,
      subscribed_app_ids: result.app_ids,
      subscribe_response: {
        post: result.post_response,
        apps: result.subscribed_apps,
        at: nowIso,
      },
    };
    const { error: updErr } = await admin
      .from("organization_integrations")
      .update({ config_values: nextConfig })
      .eq("id", params.organizationIntegrationId);
    if (updErr) {
      console.error("[meta-whatsapp-connect] subscribe persist failed", updErr.message);
      return { ok: false, error: "subscribe_persist_failed", details: updErr.message };
    }
    return { ok: true, ...result };
  } catch (e) {
    if (e instanceof MetaWaGraphError) {
      return { ok: false, error: "waba_subscribe_failed", details: e.error };
    }
    return { ok: false, error: "waba_subscribe_failed", details: (e as Error).message };
  }
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

    const mode: "primary" | "additional" | "migrate" | "migrate_dry_run" | "add_waba" | "resubscribe_webhook" =
      body.mode === "additional" || body.mode === "migrate" || body.mode === "migrate_dry_run" || body.mode === "add_waba" || body.mode === "resubscribe_webhook"
        ? body.mode
        : "primary";

    const isMigrateMode = mode === "migrate" || mode === "migrate_dry_run";
    const isResubscribeMode = mode === "resubscribe_webhook";

    const required: (keyof ConnectBody)[] = isResubscribeMode
      ? ["organizationId", "organizationIntegrationId"]
      : isMigrateMode
      ? ["organizationId", "wabaId", "phoneNumberId", "phoneE164"]
      : mode === "additional" || mode === "add_waba"
        ? ["organizationId", "wabaId", "phoneNumberId", "phoneE164"]
        : ["organizationId", "appId", "wabaId", "phoneNumberId", "phoneE164", "systemUserToken"];
    for (const f of required) {
      if (!body[f] || typeof body[f] !== "string") {
        return err(400, "missing_field", { field: f });
      }
    }
    if (isMigrateMode) {
      if (!body.existingEndpointId) return err(400, "missing_field", { field: "existingEndpointId" });
      if (body.provider && body.provider !== "meta_cloud_api") {
        return err(400, "unsupported_target_provider", { received: body.provider });
      }
    }
    if (!isResubscribeMode && !/^\+\d{8,15}$/.test(body.phoneE164)) return err(400, "invalid_phone_e164");


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

    // ==========================================================================
    // === MODE = 'migrate' / 'migrate_dry_run' ================================
    // Migra um endpoint existente para outro provider (hoje: meta_cloud_api).
    // Validação fail-closed: nenhum write até toda a validação Graph API passar.
    // ==========================================================================
    if (isMigrateMode) {
      const targetProvider = body.provider ?? "meta_cloud_api";
      const reason = body.migrationReason || "provider_swap";

      // 1) Lê o endpoint existente.
      const { data: existingEp, error: epErr } = await admin
        .from("communication_endpoints")
        .select("id, organization_id, organization_integration_id, channel, provider, sender_sid, external_address, external_account_id, display_name, purpose, status, is_active, quality_rating, current_tier, metadata")
        .eq("id", body.existingEndpointId!)
        .maybeSingle();
      if (epErr) return err(500, "endpoint_lookup_failed", { details: epErr.message });
      if (!existingEp) return err(404, "endpoint_not_found");
      if (existingEp.organization_id !== body.organizationId) {
        return err(403, "org_mismatch");
      }
      if (existingEp.channel !== "whatsapp") {
        return err(400, "endpoint_channel_unsupported", { channel: existingEp.channel });
      }
      if (existingEp.external_address !== body.phoneE164) {
        return err(400, "external_address_mismatch", {
          endpoint_external_address: existingEp.external_address,
          payload_phone_e164: body.phoneE164,
        });
      }
      if (existingEp.provider === targetProvider) {
        return err(400, "same_provider_noop", { provider: targetProvider });
      }

      // 2) Integração Meta de destino deve existir, estar habilitada e ter mesma WABA.
      const { data: integMeta } = await admin
        .from("admin_integrations")
        .select("id")
        .eq("slug", "meta-whatsapp-cloud")
        .maybeSingle();
      if (!integMeta?.id) return err(500, "integration_not_seeded");

      const { data: metaOi, error: metaOiErr } = await admin
        .from("organization_integrations")
        .select("id, is_enabled, connected_account")
        .eq("organization_id", body.organizationId)
        .eq("integration_id", integMeta.id)
        .maybeSingle();
      if (metaOiErr) return err(500, "meta_integration_lookup_failed", { details: metaOiErr.message });
      if (!metaOi) return err(400, "target_integration_not_connected");
      if (!metaOi.is_enabled) return err(400, "target_integration_disabled");
      const metaCa = (metaOi.connected_account ?? {}) as any;
      if (!metaCa.access_token_encrypted) return err(400, "target_integration_missing_token");
      if (metaCa.waba_id && metaCa.waba_id !== body.wabaId) {
        return err(400, "waba_mismatch", { expected: metaCa.waba_id, received: body.wabaId });
      }

      // 3) Resolve token / app secret efetivos (novos ou já cifrados na integração).
      let appSecret = body.appSecret?.trim() || undefined;
      if (!appSecret && metaCa.app_secret_encrypted) {
        try {
          appSecret = (await decryptSecret(metaCa.app_secret_encrypted)).trim() || undefined;
        } catch (e) {
          console.error("[meta-whatsapp-connect][migrate] decrypt app_secret failed", (e as Error).message);
        }
      }
      let effectiveAccessToken = body.systemUserToken?.trim() || undefined;
      if (!effectiveAccessToken) {
        try {
          effectiveAccessToken = (await decryptSecret(metaCa.access_token_encrypted)).trim() || undefined;
        } catch (e) {
          console.error("[meta-whatsapp-connect][migrate] decrypt access_token failed", (e as Error).message);
        }
      }
      if (!effectiveAccessToken) return err(400, "missing_access_token");

      // 4) Valida com a Graph API (sempre — migração não permite skip).
      let meta: {
        display_phone_number: string;
        verified_name?: string | null;
        quality_rating?: string | null;
        messaging_limit_tier?: string | null;
        belongs_to_waba: boolean;
      };
      try {
        meta = await validateCredentials({
          phoneNumberId: body.phoneNumberId,
          wabaId: body.wabaId,
          accessToken: effectiveAccessToken,
          appSecret,
        });
      } catch (e) {
        if (e instanceof MetaWaGraphError) {
          return validationResult("meta_validation_failed", { meta_error: e.error, step: "graph_api" });
        }
        throw e;
      }
      if (!meta.belongs_to_waba) {
        return validationResult("phone_not_in_waba", {
          message: "O Phone Number ID informado não pertence ao WABA informado.",
        });
      }

      // 5) display_phone_number da Meta tem que bater com o E.164 do endpoint.
      const normalize = (s: string) => "+" + String(s).replace(/[^\d]/g, "");
      if (normalize(meta.display_phone_number) !== normalize(existingEp.external_address)) {
        return err(400, "phone_number_mismatch", {
          endpoint_external_address: existingEp.external_address,
          meta_display_phone_number: meta.display_phone_number,
        });
      }

      // 6) Nenhum outro endpoint da org pode ter o mesmo sender_sid (PNID).
      const { data: collision } = await admin
        .from("communication_endpoints")
        .select("id")
        .eq("organization_id", body.organizationId)
        .eq("sender_sid", body.phoneNumberId)
        .neq("id", existingEp.id)
        .maybeSingle();
      if (collision?.id) {
        return err(409, "sender_sid_collision", {
          conflicting_endpoint_id: collision.id,
          phone_number_id: body.phoneNumberId,
        });
      }

      // 7) Monta snapshots before/after.
      const beforeSnap = {
        provider: existingEp.provider,
        sender_sid: existingEp.sender_sid,
        organization_integration_id: existingEp.organization_integration_id,
        external_account_id: existingEp.external_account_id,
        status: existingEp.status,
        is_active: existingEp.is_active,
        quality_rating: existingEp.quality_rating,
        current_tier: existingEp.current_tier,
        metadata: existingEp.metadata ?? null,
      };

      const currentTierVal = typeof meta.messaging_limit_tier === "string"
        ? Number(String(meta.messaging_limit_tier).replace(/\D/g, "")) || null
        : null;

      const prevMigrations = Array.isArray((existingEp.metadata as any)?.migrations)
        ? ((existingEp.metadata as any).migrations as any[])
        : [];
      const migrationEntry = {
        migration_version: 1,
        migration_reason: reason,
        performed_at: new Date().toISOString(),
        performed_by_user_id: userRow.id,
        previous_provider: beforeSnap.provider,
        previous_sender_sid: beforeSnap.sender_sid,
        previous_organization_integration_id: beforeSnap.organization_integration_id,
        previous_external_account_id: beforeSnap.external_account_id,
        before: beforeSnap,
        after: {
          provider: targetProvider,
          sender_sid: body.phoneNumberId,
          organization_integration_id: metaOi.id,
          external_account_id: body.wabaId,
          status: "online",
          is_active: true,
          quality_rating: meta.quality_rating ?? null,
          current_tier: currentTierVal,
        },
      };

      const mergedMetadata = {
        ...((existingEp.metadata as any) ?? {}),
        meta: {
          verified_name: meta.verified_name ?? null,
          display_phone_number: meta.display_phone_number,
          last_validated_at: new Date().toISOString(),
        },
        migration: migrationEntry,
        migrations: [...prevMigrations, migrationEntry],
      };

      const afterRow = {
        provider: targetProvider,
        sender_sid: body.phoneNumberId,
        organization_integration_id: metaOi.id,
        external_account_id: body.wabaId,
        status: "online",
        is_active: true,
        quality_rating: meta.quality_rating ?? null,
        current_tier: currentTierVal,
        metadata: mergedMetadata,
      };

      // 8) Aplica (ou simula).
      if (mode === "migrate_dry_run") {
        return new Response(JSON.stringify({
          ok: true,
          mode,
          migrationApplied: false,
          endpointId: existingEp.id,
          before: beforeSnap,
          after: { ...afterRow, metadata: { migration_preview: migrationEntry } },
          meta: {
            display_phone_number: meta.display_phone_number,
            verified_name: meta.verified_name,
            quality_rating: meta.quality_rating,
            messaging_limit_tier: meta.messaging_limit_tier,
          },
        }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      const { error: updErr } = await admin
        .from("communication_endpoints")
        .update(afterRow)
        .eq("id", existingEp.id);
      if (updErr) return err(500, "endpoint_migrate_update_failed", { details: updErr.message });

      return new Response(JSON.stringify({
        ok: true,
        mode,
        migrationApplied: true,
        endpointId: existingEp.id,
        before: beforeSnap,
        after: afterRow,
        meta: {
          display_phone_number: meta.display_phone_number,
          verified_name: meta.verified_name,
          quality_rating: meta.quality_rating,
          messaging_limit_tier: meta.messaging_limit_tier,
        },
      }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    // ==========================================================================
    // === FIM modo migrate =====================================================
    // ==========================================================================


    // ==========================================================================
    // === MODE = 'add_waba' ====================================================
    // Cria nova organization_integrations Meta para a mesma org, reutilizando
    // meta_app_credentials (M2). Requer M3 (drop do unique antigo) para o 2º WABA.
    // ==========================================================================
    if (mode === "add_waba") {
      // 1) Localiza integration meta
      const { data: integMeta } = await admin
        .from("admin_integrations")
        .select("id")
        .eq("slug", "meta-whatsapp-cloud")
        .maybeSingle();
      if (!integMeta?.id) return err(500, "integration_not_seeded");

      // 2) Credenciais compartilhadas da org
      const { data: cred, error: credErr } = await admin
        .from("meta_app_credentials")
        .select("id, app_id, app_secret_encrypted, access_token_encrypted, verify_token_encrypted")
        .eq("organization_id", body.organizationId)
        .maybeSingle();
      if (credErr) return err(500, "credentials_lookup_failed", { details: credErr.message });
      if (!cred?.id) {
        return err(400, "credentials_not_found", {
          message: "Nenhuma credencial Meta cadastrada para esta organização. Conecte a integração principal antes.",
        });
      }

      // 3) Guard duplicidade WABA na mesma org
      const { data: dupWaba } = await admin
        .from("organization_integrations")
        .select("id, display_name")
        .eq("organization_id", body.organizationId)
        .eq("integration_id", integMeta.id)
        .eq("meta_waba_id", body.wabaId)
        .maybeSingle();
      if (dupWaba?.id) {
        return err(409, "waba_already_registered", {
          message: "Esta WABA já está cadastrada nesta organização.",
          existing_organization_integration_id: dupWaba.id,
          existing_display_name: dupWaba.display_name,
        });
      }

      // 4) Guard duplicidade phone_number_id (qualquer endpoint da org)
      const { data: dupPnid } = await admin
        .from("communication_endpoints")
        .select("id, provider, external_address")
        .eq("organization_id", body.organizationId)
        .eq("sender_sid", body.phoneNumberId)
        .maybeSingle();
      if (dupPnid?.id) {
        return err(409, "phone_number_id_already_registered", {
          message: "Este Phone Number ID já está em uso por outro endpoint desta organização.",
          existing_endpoint_id: dupPnid.id,
          existing_provider: dupPnid.provider,
          existing_external_address: dupPnid.external_address,
        });
      }

      // 5) Guard colisão E.164
      const { data: dupAddr } = await admin
        .from("communication_endpoints")
        .select("id, provider, sender_sid")
        .eq("organization_id", body.organizationId)
        .eq("channel", "whatsapp")
        .eq("external_address", body.phoneE164)
        .maybeSingle();
      if (dupAddr?.id) {
        return err(409, "endpoint_address_already_registered", {
          message: "Já existe um endpoint WhatsApp com este número nesta organização.",
          existing_endpoint_id: dupAddr.id,
          existing_provider: dupAddr.provider,
          existing_sender_sid: dupAddr.sender_sid,
        });
      }

      // 6) Valida credenciais na Graph API (opcional via skipMetaValidation)
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
        let accessToken: string;
        let appSecret: string | undefined;
        try {
          accessToken = (await decryptSecret(cred.access_token_encrypted)).trim();
        } catch (e) {
          return err(500, "credentials_decrypt_failed", { details: (e as Error).message });
        }
        try {
          appSecret = cred.app_secret_encrypted
            ? (await decryptSecret(cred.app_secret_encrypted)).trim() || undefined
            : undefined;
        } catch (_e) { /* app_secret é opcional para o appsecret_proof */ }

        try {
          meta = await validateCredentials({
            phoneNumberId: body.phoneNumberId,
            wabaId: body.wabaId,
            accessToken,
            appSecret,
          });
        } catch (e) {
          if (e instanceof MetaWaGraphError) {
            return validationResult("meta_validation_failed", { meta_error: e.error, step: "graph_api" });
          }
          throw e;
        }
        if (!meta.belongs_to_waba) {
          return validationResult("phone_not_in_waba", {
            message: "O Phone Number ID informado não pertence ao WABA informado.",
          });
        }
      }

      // 7) Insere nova organization_integrations (bloqueado pelo unique antigo até M3)
      const displayName = body.displayName?.trim() || `WABA ${body.wabaId}`;
      const connectedAccount = {
        app_id: cred.app_id,
        waba_id: body.wabaId,
        phone_number_id: body.phoneNumberId,
        display_phone_number: meta.display_phone_number,
        verified_name: meta.verified_name ?? null,
        // Tokens ficam em meta_app_credentials; espelhamos referência para o fallback continuar operando.
        access_token_encrypted: cred.access_token_encrypted,
        app_secret_encrypted: cred.app_secret_encrypted,
        verify_token_encrypted: cred.verify_token_encrypted,
        token_stored_at: new Date().toISOString(),
        source: "add_waba",
      };
      const configValues = {
        app_id: cred.app_id,
        waba_id: body.wabaId,
        phone_number_id: body.phoneNumberId,
        phone_e164: body.phoneE164,
        display_phone_number: meta.display_phone_number,
        verified_name: meta.verified_name ?? null,
        quality_rating: meta.quality_rating ?? null,
        messaging_limit_tier: meta.messaging_limit_tier ?? null,
        last_validated_at: new Date().toISOString(),
      };

      const { data: newOi, error: oiErr } = await admin
        .from("organization_integrations")
        .insert({
          organization_id: body.organizationId,
          integration_id: integMeta.id,
          is_enabled: true,
          meta_credentials_id: cred.id,
          meta_waba_id: body.wabaId,
          display_name: displayName,
          connected_account: connectedAccount,
          config_values: configValues,
          connected_at: new Date().toISOString(),
          connected_by_user_id: userRow.id,
        })
        .select("id")
        .single();
      if (oiErr || !newOi?.id) {
        // 23505 = unique_violation → provavelmente unique antigo (org, integration)
        const isUnique = (oiErr as any)?.code === "23505";
        return err(isUnique ? 409 : 500, isUnique ? "unique_constraint_blocked" : "oi_insert_failed", {
          message: isUnique
            ? "O unique legado (organization_id, integration_id) ainda está ativo. Este PR só é totalmente funcional após M3."
            : oiErr?.message,
          details: oiErr?.message,
        });
      }

      // 8) Cria primeiro endpoint
      const currentTierVal = typeof meta.messaging_limit_tier === "string"
        ? Number(String(meta.messaging_limit_tier).replace(/\D/g, "")) || null
        : null;
      const { data: ep, error: epErr } = await admin
        .from("communication_endpoints")
        .insert({
          organization_id: body.organizationId,
          organization_integration_id: newOi.id,
          channel: "whatsapp",
          provider: "meta_cloud_api",
          external_account_id: body.wabaId,
          sender_sid: body.phoneNumberId,
          external_address: body.phoneE164,
          display_name: body.displayName ?? meta.verified_name ?? meta.display_phone_number,
          purpose: body.endpointPurpose ?? "customer_service",
          is_active: true,
          status: "online",
          quality_rating: meta.quality_rating ?? null,
          current_tier: currentTierVal,
          metadata: {
            meta: {
              verified_name: meta.verified_name ?? null,
              display_phone_number: meta.display_phone_number,
              last_validated_at: new Date().toISOString(),
            },
            source: "add_waba",
          },
        })
        .select("id")
        .single();
      if (epErr || !ep?.id) {
        // Rollback: remove org_integration criada
        await admin.from("organization_integrations").delete().eq("id", newOi.id);
        return err(500, "endpoint_insert_failed", { details: epErr?.message });
      }


      // 9) Subscribe do App na nova WABA (POST /{waba_id}/subscribed_apps + GET de confirmação).
      //    Falha aqui faz rollback do endpoint e da organization_integration recém-criados.
      let subAccessToken: string;
      let subAppSecret: string | undefined;
      try {
        subAccessToken = (await decryptSecret(cred.access_token_encrypted)).trim();
      } catch (e) {
        await admin.from("communication_endpoints").delete().eq("id", ep.id);
        await admin.from("organization_integrations").delete().eq("id", newOi.id);
        return err(500, "credentials_decrypt_failed", { details: (e as Error).message });
      }
      try {
        subAppSecret = cred.app_secret_encrypted
          ? (await decryptSecret(cred.app_secret_encrypted)).trim() || undefined
          : undefined;
      } catch (_e) { /* opcional */ }

      const sub = await subscribeAndPersist(admin, {
        organizationIntegrationId: newOi.id,
        wabaId: body.wabaId,
        accessToken: subAccessToken,
        appSecret: subAppSecret,
        priorConfigValues: configValues,
      });
      if (!sub.ok) {
        console.error("[meta-whatsapp-connect] add_waba subscribe failed → rollback", sub.details);
        await admin.from("communication_endpoints").delete().eq("id", ep.id);
        await admin.from("organization_integrations").delete().eq("id", newOi.id);
        return err(502, "waba_subscribe_failed", {
          message: "Não foi possível inscrever o app Meta nesta WABA. Verifique permissões do token.",
          meta_error: sub.details,
        });
      }

      return new Response(JSON.stringify({
        ok: true,
        mode: "add_waba",
        organization_integration_id: newOi.id,
        endpoint_id: ep.id,
        meta_credentials_id: cred.id,
        meta_waba_id: body.wabaId,
        display_name: displayName,
        webhook_subscribed: true,
        subscribed_app_ids: sub.app_ids,
        meta: {
          display_phone_number: meta.display_phone_number,
          verified_name: meta.verified_name,
          quality_rating: meta.quality_rating,
          messaging_limit_tier: meta.messaging_limit_tier,
        },
      }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    // ==========================================================================
    // === FIM modo add_waba ====================================================
    // ==========================================================================





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
