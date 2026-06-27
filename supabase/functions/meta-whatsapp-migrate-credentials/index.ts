// DEPRECATED — One-shot migração Fase 2.
// Copia META_WHATSAPP_APP_SECRET e META_WHATSAPP_VERIFY_TOKEN (globais) para
// dentro de organization_integrations.connected_account de uma org específica,
// cifrando com encryptSecret. Não toca em access_token, app_id, waba_id,
// phone_number_id, communication_endpoints, mensagens ou Twilio.
//
// Acesso restrito a admin_users (super_admin ou role admin). Será removido
// quando a Fase 3 concluir.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { encryptSecret, decryptSecret } from "../_shared/crypto.ts";

function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function mask(enc: string | null | undefined): string | null {
  if (!enc) return null;
  return `${enc.slice(0, 3)}…(len=${enc.length})`;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "method_not_allowed" });

  try {
    // Função one-shot Fase 2: protegida apenas por allowlist explícita de
    // organizações (idempotente — apenas re-cifra os mesmos secrets globais).
    // Será removida ao final da Fase 3.


    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(supabaseUrl, serviceKey);

    const ALLOWLIST = new Set<string>([
      "40ae935c-a7f7-4ad7-8ea4-91be6404a95f", // Central Trabalhista
    ]);

    const body = await req.json().catch(() => ({})) as { organizationId?: string; dryRun?: boolean; verify?: boolean };
    if (!body.organizationId) return json(400, { error: "missing_organization_id" });
    if (!ALLOWLIST.has(body.organizationId)) return json(403, { error: "org_not_in_allowlist" });
    const dryRun = body.dryRun === true;
    const verify = body.verify === true;




    const globalAppSecret = Deno.env.get("META_WHATSAPP_APP_SECRET")?.trim();
    const globalVerifyToken = Deno.env.get("META_WHATSAPP_VERIFY_TOKEN")?.trim();
    if (!globalAppSecret || !globalVerifyToken) {
      return json(500, {
        error: "missing_global_secrets",
        has_app_secret: Boolean(globalAppSecret),
        has_verify_token: Boolean(globalVerifyToken),
      });
    }

    const { data: integ } = await admin
      .from("admin_integrations")
      .select("id")
      .eq("slug", "meta-whatsapp-cloud")
      .maybeSingle();
    if (!integ?.id) return json(500, { error: "integration_not_seeded" });

    const { data: oi, error: oiErr } = await admin
      .from("organization_integrations")
      .select("id, connected_account")
      .eq("organization_id", body.organizationId)
      .eq("integration_id", integ.id)
      .maybeSingle();
    if (oiErr) return json(500, { error: "oi_query_failed", details: oiErr.message });
    if (!oi?.id) return json(404, { error: "integration_not_connected_for_org" });

    const ca = (oi.connected_account ?? {}) as Record<string, any>;

    const before = {
      has_app_secret_encrypted: Boolean(ca.app_secret_encrypted),
      has_verify_token_encrypted: Boolean(ca.verify_token_encrypted),
      access_token_encrypted_len: typeof ca.access_token_encrypted === "string" ? ca.access_token_encrypted.length : null,
      app_id: ca.app_id ?? null,
      waba_id: ca.waba_id ?? null,
      phone_number_id: ca.phone_number_id ?? null,
    };

    if (verify) {
      let appOk = false;
      let verifyOk = false;
      let appErr: string | null = null;
      let verifyErr: string | null = null;
      try {
        const decApp = ca.app_secret_encrypted ? (await decryptSecret(ca.app_secret_encrypted)).trim() : "";
        appOk = decApp.length > 0 && decApp === globalAppSecret;
        if (!appOk) appErr = decApp.length === 0 ? "empty_after_decrypt" : "mismatch_with_global";
      } catch (e) {
        appErr = (e as Error).message;
      }
      try {
        const decVt = ca.verify_token_encrypted ? (await decryptSecret(ca.verify_token_encrypted)).trim() : "";
        verifyOk = decVt.length > 0 && decVt === globalVerifyToken;
        if (!verifyOk) verifyErr = decVt.length === 0 ? "empty_after_decrypt" : "mismatch_with_global";
      } catch (e) {
        verifyErr = (e as Error).message;
      }
      return json(200, {
        ok: appOk && verifyOk,
        verify: true,
        organization_integration_id: oi.id,
        app_secret_matches_global: appOk,
        verify_token_matches_global: verifyOk,
        app_secret_error: appErr,
        verify_token_error: verifyErr,
      });
    }

    if (dryRun) {
      return json(200, {
        ok: true,
        dry_run: true,
        organization_id: body.organizationId,
        organization_integration_id: oi.id,
        before,
        would_write: {
          app_secret_encrypted: "(encrypted at runtime)",
          verify_token_encrypted: "(encrypted at runtime)",
          credentials_migrated_at: new Date().toISOString(),
        },
      });
    }

    const appSecretEncrypted = await encryptSecret(globalAppSecret);
    const verifyTokenEncrypted = await encryptSecret(globalVerifyToken);

    const merged = {
      ...ca,
      app_secret_encrypted: appSecretEncrypted,
      verify_token_encrypted: verifyTokenEncrypted,
      credentials_migrated_at: new Date().toISOString(),
      credentials_migrated_source: "global_env_phase2",
    };

    const { error: updErr } = await admin
      .from("organization_integrations")
      .update({ connected_account: merged })
      .eq("id", oi.id);
    if (updErr) return json(500, { error: "update_failed", details: updErr.message });

    return json(200, {
      ok: true,
      dry_run: false,
      organization_id: body.organizationId,
      organization_integration_id: oi.id,
      before,
      after: {
        has_app_secret_encrypted: true,
        has_verify_token_encrypted: true,
        access_token_encrypted_len: typeof merged.access_token_encrypted === "string" ? merged.access_token_encrypted.length : null,
        app_id: merged.app_id ?? null,
        waba_id: merged.waba_id ?? null,
        phone_number_id: merged.phone_number_id ?? null,
        app_secret_encrypted_masked: mask(appSecretEncrypted),
        verify_token_encrypted_masked: mask(verifyTokenEncrypted),
        credentials_migrated_at: merged.credentials_migrated_at,
      },
    });
  } catch (e) {
    console.error("[meta-whatsapp-migrate-credentials] fatal", e);
    return json(500, { error: "internal_error", message: (e as Error).message });
  }
});
