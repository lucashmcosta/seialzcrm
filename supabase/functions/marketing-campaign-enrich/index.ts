// ============================================================================
// marketing-campaign-enrich
// ----------------------------------------------------------------------------
// Enriquece rows de marketing_campaigns chamando Meta Marketing API.
// Pega ad_id (external_id), busca campaign/adset/ad nomes, status, creative.
//
// Invocacao:
//   POST /functions/v1/marketing-campaign-enrich
//   Body (todos opcionais):
//     { marketing_campaign_id: uuid }   → so essa
//     { organization_id: uuid, limit: 50 } → so dessa org, batch
//     {} → todas pending/failed/heuristic em todas orgs (cron mode)
//
// Auth: service_role JWT (chamado por cron interno via pg_net).
//
// PROVENIENCIA: codigo recuperado em 2026-07-05 do deploy ad-hoc v14
// (dashboard, 2026-05-04 — drift P0 #2). Os _shared embutidos no bundle
// eram identicos aos do repo; imports apontados para ../_shared/.
// A versao deployada continua sendo a v14 ad-hoc ate o proximo deploy
// via pipeline.
// ============================================================================

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { decryptSecret } from "../_shared/crypto.ts";
import { isTokenError, metaGraphGet, MetaGraphError } from "../_shared/meta-graph.ts";
import { notifyOrgUsers } from "../_shared/notify.ts";
import { validateServiceRoleAuth } from "../_shared/auth.ts";

const DEFAULT_BATCH_LIMIT = 50;
const META_API_THROTTLE_MS = 200;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const auth = validateServiceRoleAuth(req);
  if (!auth.ok) {
    console.warn("Auth failed:", auth.error);
    return json({ error: "Unauthorized", details: auth.error }, 401);
  }

  try {
    const body = await req.json().catch(() => ({} as any));
    const targetCampaignId: string | undefined = body.marketing_campaign_id;
    const targetOrgId: string | undefined = body.organization_id;
    const limit: number = Math.min(body.limit ?? DEFAULT_BATCH_LIMIT, 100);

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // 1. Selecionar marketing_campaigns que precisam de enrichment
    let query = admin
      .from("marketing_campaigns")
      .select("id, organization_id, platform, channel, external_id, sync_status")
      .eq("platform", "meta")
      .is("deleted_at", null);

    if (targetCampaignId) {
      query = query.eq("id", targetCampaignId);
    } else if (targetOrgId) {
      query = query
        .eq("organization_id", targetOrgId)
        .in("sync_status", ["pending", "failed", "heuristic"])
        .order("last_synced_at", { ascending: true, nullsFirst: true })
        .limit(limit);
    } else {
      // Cron mode: pega tudo que precisa, ordenado pelos mais antigos
      query = query
        .in("sync_status", ["pending", "failed", "heuristic"])
        .order("last_synced_at", { ascending: true, nullsFirst: true })
        .limit(limit);
    }

    const { data: campaigns, error: selectErr } = await query;
    if (selectErr) throw selectErr;
    if (!campaigns || campaigns.length === 0) {
      return json({ success: true, processed: 0, message: "Nothing to enrich" });
    }

    console.log(`Enriching ${campaigns.length} marketing_campaigns`);

    // 2. Agrupar por org pra fazer 1 lookup de token por org
    const byOrg = new Map<string, typeof campaigns>();
    for (const c of campaigns) {
      if (!byOrg.has(c.organization_id)) byOrg.set(c.organization_id, []);
      byOrg.get(c.organization_id)!.push(c);
    }

    let totalSuccess = 0;
    let totalFailed = 0;
    let totalNoToken = 0;

    for (const [orgId, orgCampaigns] of byOrg.entries()) {
      // 3. Buscar tokens da org via meta-lead-ads
      const { data: integration } = await admin
        .from("organization_integrations")
        .select("id, is_enabled, connected_account, integration_id, admin_integrations!inner(slug)")
        .eq("organization_id", orgId)
        .eq("admin_integrations.slug", "meta-lead-ads")
        .eq("is_enabled", true)
        .maybeSingle();

      if (!integration?.connected_account) {
        console.log(`Org ${orgId} has no meta-lead-ads integration → marking ${orgCampaigns.length} campaigns as no_token`);
        await admin
          .from("marketing_campaigns")
          .update({
            sync_status: "no_token",
            sync_error: "Org não tem integração Meta conectada",
            last_synced_at: new Date().toISOString(),
          })
          .in("id", orgCampaigns.map((c) => c.id));
        totalNoToken += orgCampaigns.length;
        continue;
      }

      const ca: any = integration.connected_account;
      let systemUserToken: string;
      let appSecret: string | undefined;
      try {
        if (!ca.system_user_token_encrypted) throw new Error("system_user_token_encrypted missing");
        systemUserToken = await decryptSecret(ca.system_user_token_encrypted);
        appSecret = ca.app_secret_encrypted ? await decryptSecret(ca.app_secret_encrypted) : undefined;
      } catch (e: any) {
        console.error(`Org ${orgId} token decryption failed:`, e.message);
        await admin
          .from("marketing_campaigns")
          .update({
            sync_status: "failed",
            sync_error: `Decryption error: ${e.message}`,
            last_synced_at: new Date().toISOString(),
          })
          .in("id", orgCampaigns.map((c) => c.id));
        totalFailed += orgCampaigns.length;
        continue;
      }

      // 4. Pra cada campaign, chamar Meta Marketing API
      let orgTokenExpired = false;

      for (const campaign of orgCampaigns) {
        if (orgTokenExpired) {
          // Token expirou — não tenta mais nessa org
          await admin
            .from("marketing_campaigns")
            .update({
              sync_status: "failed",
              sync_error: "Token Meta expirado (skipped after first failure in batch)",
              last_synced_at: new Date().toISOString(),
            })
            .eq("id", campaign.id);
          totalFailed++;
          continue;
        }

        try {
          const fields = [
            "id",
            "name",
            "status",
            "effective_status",
            "campaign_id",
            "campaign{id,name,objective,status}",
            "adset_id",
            "adset{id,name,daily_budget,lifetime_budget,optimization_goal}",
            "creative{id,name,title,body,thumbnail_url,image_url,object_story_id,call_to_action_type}",
          ].join(",");

          const adData = await metaGraphGet(
            `/${campaign.external_id}`,
            { fields },
            { accessToken: systemUserToken, appSecret },
          );

          // Build update payload
          const adName = adData.name || `Ad ${campaign.external_id}`;
          const campaignName = adData.campaign?.name || null;
          const adsetName = adData.adset?.name || null;
          const displayName = adName;
          const displayHierarchy = [campaignName, adsetName, adName]
            .filter(Boolean)
            .join(" > ") || null;

          const statusMap: Record<string, string> = {
            ACTIVE: "active",
            PAUSED: "paused",
            ARCHIVED: "archived",
            DELETED: "deleted",
          };
          const status = statusMap[adData.effective_status || adData.status] || "unknown";

          const platformData: Record<string, any> = {
            meta_status: adData.status,
            meta_effective_status: adData.effective_status,
            campaign_objective: adData.campaign?.objective,
            adset_optimization_goal: adData.adset?.optimization_goal,
            creative_call_to_action: adData.creative?.call_to_action_type,
            adset_daily_budget_cents: adData.adset?.daily_budget ? Number(adData.adset.daily_budget) : undefined,
            adset_lifetime_budget_cents: adData.adset?.lifetime_budget ? Number(adData.adset.lifetime_budget) : undefined,
            enriched_at: new Date().toISOString(),
          };

          await admin
            .from("marketing_campaigns")
            .update({
              ad_id: adData.id || campaign.external_id,
              ad_name: adName,
              campaign_id: adData.campaign?.id || null,
              campaign_name: campaignName,
              campaign_objective: adData.campaign?.objective || null,
              adset_id: adData.adset?.id || null,
              adset_name: adsetName,
              creative_id: adData.creative?.id || null,
              creative_name: adData.creative?.name || null,
              creative_headline: adData.creative?.title || undefined,
              creative_body: adData.creative?.body || undefined,
              creative_thumbnail_url: adData.creative?.thumbnail_url || adData.creative?.image_url || undefined,
              display_name: displayName,
              display_hierarchy: displayHierarchy,
              status,
              platform_data: platformData,
              sync_status: "success",
              sync_error: null,
              last_synced_at: new Date().toISOString(),
            })
            .eq("id", campaign.id);

          totalSuccess++;
          console.log(`✓ Enriched ${campaign.external_id} → "${displayName}"`);
        } catch (e: any) {
          const errMsg = e instanceof MetaGraphError
            ? `Meta API error ${e.error.code}: ${e.error.message}`
            : (e.message || String(e));

          console.error(`✗ Enrich failed for ${campaign.external_id}:`, errMsg);

          await admin
            .from("marketing_campaigns")
            .update({
              sync_status: "failed",
              sync_error: errMsg.slice(0, 500),
              last_synced_at: new Date().toISOString(),
            })
            .eq("id", campaign.id);

          totalFailed++;

          if (isTokenError(e)) {
            orgTokenExpired = true;
            console.error(`Token Meta expirado para org ${orgId} - skipping rest of batch`);
            await notifyOrgUsers(admin, orgId, {
              type: "warning",
              title: "Token Meta expirado",
              body: "Os anúncios Meta não pôde ser enriquecidos: token expirado. Reconecte a integração Meta Lead Ads.",
              entity_type: "integration",
              entity_id: integration.id,
            });
          }
        }

        // Throttle pra não exceder rate limit Meta
        await new Promise((resolve) => setTimeout(resolve, META_API_THROTTLE_MS));
      }
    }

    return json({
      success: true,
      processed: campaigns.length,
      enriched: totalSuccess,
      failed: totalFailed,
      no_token: totalNoToken,
    });
  } catch (e: any) {
    console.error("marketing-campaign-enrich error", e);
    return json({ error: e.message || "Internal error" }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
