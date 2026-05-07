import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { decryptSecret } from "../_shared/crypto.ts";
import { isTokenError, metaGraphGet } from "../_shared/meta-graph.ts";
import { notifyOrgUsers } from "../_shared/notify.ts";

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Find admin integration
    const { data: integ } = await admin
      .from("admin_integrations")
      .select("id")
      .eq("slug", "meta-lead-ads")
      .maybeSingle();
    if (!integ) return json({ success: true, checked: 0 });

    const { data: orgIntegrations } = await admin
      .from("organization_integrations")
      .select("id, organization_id, connected_account, is_enabled")
      .eq("integration_id", integ.id)
      .eq("is_enabled", true);

    let checked = 0;
    let errors = 0;

    for (const oi of orgIntegrations || []) {
      const ca: any = oi.connected_account || {};
      if (!ca.system_user_token_encrypted) continue;
      try {
        const accessToken = await decryptSecret(ca.system_user_token_encrypted);
        const appSecret = await decryptSecret(ca.app_secret_encrypted);
        await metaGraphGet("/me", { fields: "id" }, { accessToken, appSecret });

        await admin
          .from("organization_integrations")
          .update({
            connected_account: {
              ...ca,
              status: "connected",
              last_token_check_at: new Date().toISOString(),
              last_token_check_error: null,
            },
          })
          .eq("id", oi.id);
      } catch (e: any) {
        errors++;
        const expired = isTokenError(e);
        await admin
          .from("organization_integrations")
          .update({
            connected_account: {
              ...ca,
              status: expired ? "expired" : "error",
              last_token_check_at: new Date().toISOString(),
              last_token_check_error: e.message,
            },
          })
          .eq("id", oi.id);
        await notifyOrgUsers(admin, oi.organization_id, {
          type: expired ? "error" : "warning",
          title: expired ? "Token Meta Lead Ads expirado" : "Erro ao validar Meta Lead Ads",
          body: e.message,
          entity_type: "integration",
          entity_id: oi.id,
        });
      }
      checked++;
    }

    return json({ success: true, checked, errors });
  } catch (e: any) {
    console.error("meta-lead-ads-token-health error", e);
    return json({ error: e.message || "Internal error" }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
