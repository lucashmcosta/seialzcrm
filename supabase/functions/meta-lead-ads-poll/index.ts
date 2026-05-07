import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { decryptSecret } from "../_shared/crypto.ts";
import { isTokenError, metaGraphGet } from "../_shared/meta-graph.ts";
import { notifyOrgUsers } from "../_shared/notify.ts";
import { validateServiceRoleAuth } from "../_shared/auth.ts";

const PAGE_SIZE = 50;
const MAX_PAGES = 5;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const auth = validateServiceRoleAuth(req);
  if (!auth.ok) {
    console.warn("Auth failed:", auth.error);
    return json({ error: "Unauthorized", details: auth.error }, 401);
  }

  try {
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Fetch service_role key from Vault (env var may diverge after key rotation)
    const { data: internalAuthToken, error: tokenErr } = await admin.rpc(
      "get_internal_function_auth_token",
    );
    if (tokenErr || !internalAuthToken) {
      console.error("Failed to fetch internal auth token from Vault:", tokenErr);
      return json({ error: "Internal auth token not available" }, 500);
    }

    // Find candidate forms
    const { data: forms } = await admin
      .from("lead_forms")
      .select(
        "id, organization_id, provider_form_id, provider_form_name, last_synced_lead_created_time, organization_integration_id, meta_lead_page_id",
      )
      .eq("provider", "meta_lead_ads")
      .eq("is_monitored", true)
      .lt("consecutive_errors", 5);

    if (!forms || forms.length === 0) return json({ success: true, processed: 0 });

    let processed = 0;
    let totalLeads = 0;

    for (const form of forms) {
      // Try advisory lock
      const { data: lockOk } = await admin.rpc("try_lead_form_polling_lock", {
        p_lead_form_id: form.id,
      });
      if (!lockOk) continue;

      // Load page + integration to get tokens + ensure both active + integration enabled
      const { data: page } = await admin
        .from("meta_lead_pages")
        .select("id, page_access_token_encrypted, is_active, organization_integration_id")
        .eq("id", form.meta_lead_page_id!)
        .maybeSingle();
      if (!page || !page.is_active) continue;

      const { data: orgIntegration } = await admin
        .from("organization_integrations")
        .select("id, is_enabled, connected_account, config_values")
        .eq("id", page.organization_integration_id)
        .maybeSingle();
      if (!orgIntegration || !orgIntegration.is_enabled) continue;

      const ca: any = orgIntegration.connected_account || {};
      const settings = (orgIntegration.config_values as any)?.meta_lead_ads_settings || {};

      let pageToken: string;
      let appSecret: string | undefined;
      try {
        pageToken = await decryptSecret(page.page_access_token_encrypted);
        appSecret = ca.app_secret_encrypted
          ? await decryptSecret(ca.app_secret_encrypted)
          : undefined;
      } catch (e: any) {
        console.error("Failed to decrypt tokens for form", form.id, e.message);
        continue;
      }

      const sinceMs = form.last_synced_lead_created_time
        ? new Date(form.last_synced_lead_created_time).getTime()
        : Date.now() - 60 * 60 * 1000;
      const sinceUnix = Math.floor(sinceMs / 1000);

      let cursor: string | undefined;
      let pagesFetched = 0;
      let formLeads = 0;
      let lastLeadTime: string | null = null;
      let formError: string | null = null;
      let tokenExpired = false;

      try {
        while (pagesFetched < MAX_PAGES) {
          const params: Record<string, string | number> = {
            limit: PAGE_SIZE,
            filtering: JSON.stringify([
              { field: "time_created", operator: "GREATER_THAN", value: sinceUnix },
            ]),
            fields:
              "id,created_time,field_data,ad_id,ad_name,adset_id,adset_name,campaign_id,campaign_name,form_id,platform,is_organic",
          };
          if (cursor) params.after = cursor;

          const resp = await metaGraphGet(`/${form.provider_form_id}/leads`, params, {
            accessToken: pageToken,
            appSecret,
          });
          const leads: any[] = resp.data || [];
          pagesFetched++;

          for (const lead of leads) {
            // Fire process-lead with explicit Authorization header
            const url = `${Deno.env.get("SUPABASE_URL")}/functions/v1/meta-lead-ads-process-lead`;
            fetch(url, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${internalAuthToken}`,
              },
              body: JSON.stringify({
                lead,
                organization_id: form.organization_id,
                lead_form_id: form.id,
                lead_form_name: form.provider_form_name,
                settings,
              }),
            }).catch((e) => console.warn("process-lead invoke error", e));

            formLeads++;
            if (!lastLeadTime || lead.created_time > lastLeadTime) {
              lastLeadTime = lead.created_time;
            }
          }

          cursor = resp.paging?.cursors?.after;
          if (!cursor || leads.length < PAGE_SIZE) break;
        }

        await admin
          .from("lead_forms")
          .update({
            last_synced_at: new Date().toISOString(),
            last_sync_status: "success",
            last_sync_error: null,
            consecutive_errors: 0,
            ...(lastLeadTime ? { last_synced_lead_created_time: lastLeadTime } : {}),
          })
          .eq("id", form.id);
      } catch (e: any) {
        formError = e.message || String(e);
        tokenExpired = isTokenError(e);
        console.error(`Form ${form.id} polling error:`, formError);

        await admin
          .from("lead_forms")
          .update({
            last_sync_status: "error",
            last_sync_error: formError,
          })
          .eq("id", form.id);

        // Increment consecutive_errors via RPC-less approach
        const { data: cur } = await admin
          .from("lead_forms")
          .select("consecutive_errors")
          .eq("id", form.id)
          .maybeSingle();
        await admin
          .from("lead_forms")
          .update({ consecutive_errors: (cur?.consecutive_errors ?? 0) + 1 })
          .eq("id", form.id);

        if (tokenExpired) {
          await admin
            .from("meta_lead_pages")
            .update({
              last_health_check_status: "expired",
              last_health_check_error: formError,
              last_health_check_at: new Date().toISOString(),
            })
            .eq("id", page.id);
          await notifyOrgUsers(admin, form.organization_id, {
            type: "warning",
            title: "Token Meta Lead Ads expirado",
            body: `O formulário "${form.provider_form_name}" não pôde ser sincronizado: token expirado.`,
            entity_type: "integration",
            entity_id: orgIntegration.id,
          });
        }
      }

      if (formLeads > 0) {
        // increment total_synced_leads
        const { data: cur } = await admin
          .from("lead_forms")
          .select("total_synced_leads")
          .eq("id", form.id)
          .maybeSingle();
        await admin
          .from("lead_forms")
          .update({ total_synced_leads: (cur?.total_synced_leads ?? 0) + formLeads })
          .eq("id", form.id);
      }

      processed++;
      totalLeads += formLeads;
    }

    return json({ success: true, processed, total_leads: totalLeads });
  } catch (e: any) {
    console.error("meta-lead-ads-poll error", e);
    return json({ error: e.message || "Internal error" }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
