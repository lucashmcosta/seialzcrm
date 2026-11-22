// Rotina (a cada 3 h): situação dos números WhatsApp conectados pelo app da plataforma
// (Embedded Signup). Lê na Graph API a qualidade, o status e o limite do número e o
// health_status da WABA (se pode enviar), grava em organization_integrations.config_values
// e avisa os administradores da org quando a situação muda.
// Garantia do webhook de eventos de conta: se um aviso da Meta se perder, isto encontra.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { verifyServiceRoleAuth } from "../_shared/auth.ts";
import { resolveMetaCredentials } from "../_shared/meta-whatsapp/credentials.ts";
import { metaWaGet, MetaWaGraphError } from "../_shared/meta-whatsapp/graph.ts";
import { healthAlert, summarizeHealth, type WaHealth } from "../_shared/meta-whatsapp/health.ts";
import { notifyOrgSystemAdmins } from "../_shared/notify.ts";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

serve(async (req) => {
  const auth = await verifyServiceRoleAuth(req);
  if (!auth.ok) return json({ error: "unauthorized", reason: auth.error }, 401);

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const result = { checked: 0, alerts: 0, errors: 0 };

  const { data: integ } = await admin.from("admin_integrations").select("id").eq("slug", "meta-whatsapp-cloud").maybeSingle();
  if (!integ?.id) return json({ ok: true, ...result });

  const { data: rows, error } = await admin.from("organization_integrations")
    .select("id, organization_id, connected_account, config_values")
    .eq("integration_id", integ.id).eq("is_enabled", true)
    .eq("connected_account->>source", "embedded_signup");
  if (error) return json({ error: error.message }, 500);

  for (const oi of rows ?? []) {
    const cv = (oi.config_values ?? {}) as Record<string, any>;
    try {
      const cred = await resolveMetaCredentials(admin, oi.id);
      if (!cred.phoneNumberId || !cred.wabaId) throw new Error("missing_phone_or_waba");
      const opts = { accessToken: cred.accessToken, appSecret: cred.appSecret };
      const phone = await metaWaGet(`/${cred.phoneNumberId}`,
        { fields: "display_phone_number,verified_name,quality_rating,status,messaging_limit_tier" }, opts);
      const waba = await metaWaGet(`/${cred.wabaId}`, { fields: "health_status" }, opts);
      const next = summarizeHealth(phone, waba?.health_status);
      const prev: Partial<WaHealth> | null = cv.health_checked_at
        ? { quality_rating: cv.quality_rating ?? null, can_send_message: cv.can_send_message ?? null }
        : null;
      const alert = healthAlert(prev, next, phone?.display_phone_number ?? cv.display_phone_number ?? "");

      const now = new Date().toISOString();
      // Relê antes de gravar: o webhook pode ter marcado ou liberado o bloqueio de envio agora há pouco.
      const { data: fresh } = await admin.from("organization_integrations").select("config_values").eq("id", oi.id).maybeSingle();
      const base = (fresh?.config_values ?? cv) as Record<string, any>;
      const { error: upErr } = await admin.from("organization_integrations").update({
        config_values: {
          ...base,
          ...next,
          display_phone_number: phone?.display_phone_number ?? base.display_phone_number,
          verified_name: phone?.verified_name ?? base.verified_name,
          health_checked_at: now,
          health_check_error: null,
          last_validated_at: now,
        },
      }).eq("id", oi.id);
      if (upErr) throw new Error(`update_failed:${upErr.message}`);

      await admin.from("communication_endpoints")
        .update({ quality_rating: next.quality_rating })
        .eq("organization_integration_id", oi.id).eq("provider", "meta_cloud_api");

      if (alert) {
        await notifyOrgSystemAdmins(admin, oi.organization_id, { type: "whatsapp_account_alert", title: alert.title, body: alert.body });
        result.alerts++;
      }
      result.checked++;
      console.log("[meta-wa-health-check]", JSON.stringify({ oi: oi.id, ...next, health_errors: next.health_errors.length, alert: alert?.title ?? null }));
    } catch (e) {
      result.errors++;
      const message = e instanceof MetaWaGraphError ? `graph_${e.error.code}: ${e.error.message}` : (e as Error).message;
      console.error("[meta-wa-health-check] falhou", oi.id, message);
      await admin.from("organization_integrations")
        .update({ config_values: { ...cv, health_check_error: message.slice(0, 300), health_check_error_at: new Date().toISOString() } })
        .eq("id", oi.id);
    }
  }

  console.log("[meta-wa-health-check]", result);
  return json({ ok: true, ...result });
});
