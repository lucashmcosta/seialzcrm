// Cria template Meta WhatsApp Cloud e persiste em whatsapp_templates.
// Criação na Meta = submissão para aprovação. Não há etapa separada.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { decryptSecret } from "../_shared/crypto.ts";
import { metaWaPostJson, MetaWaGraphError } from "../_shared/meta-whatsapp/graph.ts";
import { resolveAppSecretForIntegration } from "../_shared/meta-whatsapp/credentials.ts";

function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

interface Variable { key: string; name: string; example: string }
interface QuickReplyButton { id: string; title: string }

interface CreateInput {
  organizationId: string;
  name: string;
  language: string;
  category: string;
  body: string;
  header?: string;
  footer?: string;
  variables?: Variable[];
  buttons?: QuickReplyButton[];
}

function normalizeLang(l: string): string {
  return (l || "").replace("-", "_");
}

function buildComponents(input: CreateInput) {
  const components: any[] = [];
  if (input.header && input.header.trim().length > 0) {
    components.push({ type: "HEADER", format: "TEXT", text: input.header.trim() });
  }
  const bodyComp: any = { type: "BODY", text: input.body };
  const vars = (input.variables || []).filter((v) => v && v.example !== undefined);
  const matches = Array.from(input.body.matchAll(/\{\{(\d+)\}\}/g))
    .map((m) => parseInt(m[1], 10))
    .filter((n) => Number.isFinite(n));
  const uniqueVarNums = Array.from(new Set(matches)).sort((a, b) => a - b);
  if (uniqueVarNums.length > 0) {
    const examples = uniqueVarNums.map((n) => {
      const v = vars.find((x) => String(x.key) === String(n));
      return (v?.example || `exemplo${n}`).slice(0, 60);
    });
    bodyComp.example = { body_text: [examples] };
  }
  components.push(bodyComp);
  if (input.footer && input.footer.trim().length > 0) {
    components.push({ type: "FOOTER", text: input.footer.trim() });
  }
  const buttons = (input.buttons || []).filter((b) => b && b.title && b.title.trim().length > 0);
  if (buttons.length > 0) {
    components.push({
      type: "BUTTONS",
      buttons: buttons.slice(0, 10).map((b) => ({
        type: "QUICK_REPLY",
        text: b.title.trim().slice(0, 25),
      })),
    });
  }
  return components;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "method_not_allowed" });

  try {
    const input = (await req.json().catch(() => null)) as CreateInput | null;
    if (!input) return json(400, { error: "invalid_body" });
    const { organizationId, name, language, category, body } = input;
    if (!organizationId || !name || !language || !category || !body) {
      return json(400, { error: "missing_fields" });
    }
    if (!/^[a-z][a-z0-9_]*$/.test(name)) {
      return json(400, { error: "invalid_name", message: "Use letras minúsculas, números e underscores" });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: oi, error: oiErr } = await supabase
      .from("organization_integrations")
      .select("id, connected_account, config_values, is_enabled, admin_integrations!inner(slug)")
      .eq("organization_id", organizationId)
      .eq("is_enabled", true)
      .eq("admin_integrations.slug", "meta-whatsapp-cloud")
      .maybeSingle();

    if (oiErr) return json(500, { error: "integration_lookup_failed", details: oiErr.message });
    if (!oi) return json(404, { error: "integration_not_found" });

    const ca = (oi.connected_account ?? {}) as any;
    const cv = (oi.config_values ?? {}) as any;
    const wabaId = ca.waba_id || cv.waba_id;
    if (!wabaId) return json(400, { error: "missing_waba_id" });
    if (!ca.access_token_encrypted) return json(400, { error: "missing_access_token" });

    const accessToken = (await decryptSecret(ca.access_token_encrypted)).trim();
    const appSecret = await resolveAppSecretForIntegration(ca);

    const lang = normalizeLang(language);
    const cat = (category || "").toUpperCase();
    const components = buildComponents(input);

    let metaResponse: any;
    try {
      metaResponse = await metaWaPostJson(
        `/${wabaId}/message_templates`,
        {
          name,
          language: lang,
          category: cat,
          components,
          allow_category_change: true,
        },
        { accessToken, appSecret },
      );
    } catch (e) {
      if (e instanceof MetaWaGraphError) {
        let message = e.error.message;
        if (e.error.code === 192 || /already exists|duplicate/i.test(e.error.message || "")) {
          message = `Já existe um template "${name}" no idioma ${lang}.`;
        }
        return json(422, {
          error: "meta_create_failed",
          message,
          meta_error: e.error,
        });
      }
      throw e;
    }

    const metaTemplateId = metaResponse?.id ? String(metaResponse.id) : null;
    const metaStatus = (metaResponse?.status || "PENDING").toString().toUpperCase();
    const status = metaStatus === "APPROVED"
      ? "approved"
      : metaStatus === "REJECTED"
      ? "rejected"
      : "pending";
    const rejectedReason = metaResponse?.rejected_reason && String(metaResponse.rejected_reason).toUpperCase() !== "NONE"
      ? String(metaResponse.rejected_reason)
      : null;

    const row = {
      organization_id: organizationId,
      organization_integration_id: oi.id,
      provider: "meta_cloud_api",
      twilio_content_sid: null as string | null,
      meta_template_name: name,
      meta_waba_id: String(wabaId),
      friendly_name: name,
      language: lang,
      template_type: "text",
      category: cat,
      status,
      rejection_reason: status === "rejected" ? rejectedReason : null,
      body: input.body,
      header: input.header || null,
      footer: input.footer || null,
      variables: input.variables || [],
      components,
      source: "meta",
      is_active: true,
      last_synced_at: new Date().toISOString(),
      metadata: {
        meta_cloud: {
          waba_id: String(wabaId),
          template_id: metaTemplateId,
          rejected_reason: rejectedReason,
          raw: metaResponse,
        },
      },
    };


    const { data: inserted, error: insErr } = await supabase
      .from("whatsapp_templates")
      .insert(row)
      .select("id")
      .maybeSingle();

    if (insErr) {
      console.error("[meta-wa-templates-create] insert failed", insErr.message);
      return json(500, {
        error: "persist_failed",
        message: "Template criado na Meta mas falhou ao salvar localmente. Rode Sincronizar Meta para recuperar.",
        meta_template_id: metaTemplateId,
        details: insErr.message,
      });
    }

    return json(200, {
      success: true,
      id: inserted?.id,
      meta_template_id: metaTemplateId,
      status,
    });
  } catch (e) {
    console.error("[meta-whatsapp-templates-create] fatal", e);
    return json(500, { error: "internal_error", message: (e as Error).message });
  }
});
