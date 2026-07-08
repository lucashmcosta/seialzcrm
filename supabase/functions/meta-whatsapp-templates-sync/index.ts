// Sincroniza templates Meta WhatsApp Cloud de uma organização.
// Lê WABA ID + System User Token + App Secret per-integration,
// chama GET /{waba_id}/message_templates e faz upsert em
// whatsapp_templates com provider='meta_cloud_api'.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { metaWaGet, MetaWaGraphError } from "../_shared/meta-whatsapp/graph.ts";
import { resolveMetaCredentials, MetaCredentialsError } from "../_shared/meta-whatsapp/credentials.ts";

function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

interface MetaComponent {
  type: string;
  format?: string;
  text?: string;
  buttons?: unknown[];
}

interface MetaTemplate {
  id?: string;
  name: string;
  language: string;
  status: string;
  category?: string;
  components?: MetaComponent[];
  rejected_reason?: string;
}


function mapStatus(meta: string): string {
  const s = (meta || "").toUpperCase();
  if (s === "APPROVED") return "approved";
  if (s === "REJECTED") return "rejected";
  if (s === "PENDING" || s === "IN_APPEAL" || s === "PENDING_DELETION") return "pending";
  if (s === "DISABLED" || s === "PAUSED") return "not_submitted";
  return "pending";
}

function extractText(components: MetaComponent[] | undefined, type: string): string | null {
  if (!Array.isArray(components)) return null;
  const c = components.find((c) => (c?.type || "").toUpperCase() === type);
  return (c?.text as string | undefined) ?? null;
}

function extractVariables(body: string | null): Array<{ key: string; name: string; example: string }> {
  if (!body) return [];
  const matches = body.match(/\{\{(\d+)\}\}/g) || [];
  const unique = Array.from(new Set(matches.map((m) => m.replace(/[{}]/g, ""))));
  unique.sort((a, b) => parseInt(a) - parseInt(b));
  return unique.map((n) => ({ key: n, name: `var${n}`, example: "" }));
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "method_not_allowed" });

  try {
    const body = await req.json().catch(() => null);
    const organizationId = body?.organizationId as string | undefined;
    const organizationIntegrationId = body?.organizationIntegrationId as string | undefined;
    if (!organizationId) return json(400, { error: "missing_organization" });

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Resolve which organization_integration (WABA) to sync.
    // Multi-WABA (M3): an org may have several active Meta Cloud integrations.
    // - If organizationIntegrationId is provided → sync that WABA only
    //   (after validating it belongs to the org and is Meta Cloud).
    // - Otherwise → look up active Meta Cloud integrations for the org:
    //     0 → integration_not_found
    //     1 → sync it (legacy single-WABA behaviour preserved)
    //     >1 → multiple_wabas_disambiguation_required (client must pick one)
    let oi: { id: string } | null = null;

    if (organizationIntegrationId) {
      const { data, error } = await supabase
        .from("organization_integrations")
        .select("id, organization_id, is_enabled, admin_integrations!inner(slug)")
        .eq("id", organizationIntegrationId)
        .maybeSingle();
      if (error) return json(500, { error: "integration_lookup_failed", details: error.message });
      if (!data) return json(404, { error: "integration_not_found" });
      if (data.organization_id !== organizationId) {
        return json(403, { error: "integration_org_mismatch" });
      }
      if ((data as any).admin_integrations?.slug !== "meta-whatsapp-cloud") {
        return json(400, { error: "integration_not_meta_cloud" });
      }
      if (!data.is_enabled) return json(400, { error: "integration_disabled" });
      oi = { id: data.id };
    } else {
      const { data, error } = await supabase
        .from("organization_integrations")
        .select("id, admin_integrations!inner(slug)")
        .eq("organization_id", organizationId)
        .eq("is_enabled", true)
        .eq("admin_integrations.slug", "meta-whatsapp-cloud");
      if (error) return json(500, { error: "integration_lookup_failed", details: error.message });
      const rows = data ?? [];
      if (rows.length === 0) return json(404, { error: "integration_not_found" });
      if (rows.length > 1) {
        return json(409, {
          error: "multiple_wabas_disambiguation_required",
          message:
            "Esta organização tem múltiplas WABAs. Informe qual WABA deseja sincronizar (organizationIntegrationId).",
          candidates: rows.map((r) => r.id),
        });
      }
      oi = { id: rows[0].id };
    }

    // Credenciais Meta (nova fonte: meta_app_credentials; fallback: connected_account)
    let resolved;
    try {
      resolved = await resolveMetaCredentials(supabase, oi.id);
    } catch (e) {
      const code = (e as MetaCredentialsError)?.code ?? "credentials_resolve_failed";
      return json(400, { error: code });
    }
    const wabaId = resolved.wabaId;
    if (!wabaId) return json(400, { error: "missing_waba_id" });
    const accessToken = resolved.accessToken;
    const appSecret = resolved.appSecret;

    console.log("[meta-wa-templates-sync] resolved", {
      organization_id: organizationId,
      organization_integration_id: oi.id,
      meta_waba_id: wabaId,
      source: (resolved as any)?.source ?? null,
    });

    // Paginação
    const all: MetaTemplate[] = [];
    let next: string | null = null;
    let pages = 0;
    do {
      pages++;
      let page: any;
      try {
        if (next) {
          // next URL já tem token + appsecret_proof? Não — refazemos a chamada
          // mantendo cursor "after".
          const u = new URL(next);
          const after = u.searchParams.get("after") || undefined;
          page = await metaWaGet(
            `/${wabaId}/message_templates`,
            {
              fields: "name,language,status,category,components,rejected_reason",
              limit: 200,
              after,
            },
            { accessToken, appSecret },
          );
        } else {
          page = await metaWaGet(
            `/${wabaId}/message_templates`,
            { fields: "name,language,status,category,components,rejected_reason", limit: 200 },
            { accessToken, appSecret },
          );
        }

      } catch (e) {
        const err = e instanceof MetaWaGraphError
          ? { code: e.error.code, message: e.error.message, status: e.status }
          : { message: (e as Error).message };
        return json(502, { error: "meta_templates_fetch_failed", details: err });
      }
      const rows = Array.isArray(page?.data) ? page.data : [];
      all.push(...rows);
      next = page?.paging?.next || null;
      if (pages > 20) break; // safety
    } while (next);

    // Upsert
    const byStatus: Record<string, number> = {};
    let synced = 0;
    for (const tpl of all) {
      const status = mapStatus(tpl.status);
      byStatus[status] = (byStatus[status] || 0) + 1;
      const bodyText = extractText(tpl.components, "BODY");
      const headerText = extractText(tpl.components, "HEADER");
      const footerText = extractText(tpl.components, "FOOTER");
      const vars = extractVariables(bodyText);

      // Resolve id existente (índice único parcial não suporta upsert por
      // onConflict nomeado em PostgREST sem nome de constraint estável).
      const { data: existing } = await supabase
        .from("whatsapp_templates")
        .select("id")
        .eq("provider", "meta_cloud_api")
        .eq("organization_integration_id", oi.id)
        .eq("meta_template_name", tpl.name)
        .eq("language", tpl.language)
        .maybeSingle();

      const rejectedReason = (tpl as any).rejected_reason && String((tpl as any).rejected_reason).toUpperCase() !== "NONE"
        ? String((tpl as any).rejected_reason)
        : null;

      const row = {
        organization_id: organizationId,
        organization_integration_id: oi.id,
        provider: "meta_cloud_api",
        twilio_content_sid: null,
        meta_template_name: tpl.name,
        meta_waba_id: String(wabaId),
        friendly_name: tpl.name,
        language: tpl.language,
        template_type: "text",
        category: tpl.category || null,
        status,
        rejection_reason: status === "rejected" ? rejectedReason : null,
        body: bodyText || "",
        header: headerText,
        footer: footerText,
        variables: vars,
        components: tpl.components ?? [],
        source: "meta",
        is_active: true,
        last_synced_at: new Date().toISOString(),
        metadata: { meta_cloud: { waba_id: String(wabaId), rejected_reason: rejectedReason, raw: tpl } },
      };


      if (existing?.id) {
        const { error } = await supabase
          .from("whatsapp_templates")
          .update(row)
          .eq("id", existing.id);
        if (error) {
          console.error("[meta-wa-templates-sync] update failed", tpl.name, error.message);
          continue;
        }
      } else {
        const { error } = await supabase
          .from("whatsapp_templates")
          .insert(row);
        if (error) {
          console.error("[meta-wa-templates-sync] insert failed", tpl.name, error.message);
          continue;
        }
      }
      synced++;
    }

    return json(200, {
      success: true,
      synced,
      total: all.length,
      by_status: byStatus,
      approved: byStatus.approved || 0,
    });
  } catch (e) {
    console.error("[meta-whatsapp-templates-sync] fatal", e);
    return json(500, { error: "internal_error", message: (e as Error).message });
  }
});
