// Cria template Meta WhatsApp Cloud e persiste em whatsapp_templates.
// Criação na Meta = submissão para aprovação. Não há etapa separada.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { decryptSecret } from "../_shared/crypto.ts";
import { metaWaPostJson, metaWaResumableUpload, MetaWaGraphError } from "../_shared/meta-whatsapp/graph.ts";
import { resolveAppSecretForIntegration } from "../_shared/meta-whatsapp/credentials.ts";

function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

import {
  buildComponents,
  fileNameFromUrl,
  guessMimeFromUrl,
  headerFormatOf,
  isAllowedSampleUrl,
  localTemplateType,
  MEDIA_LIMITS,
  normalizeLang,
  validateSampleMedia,
  validateTemplateInput,
  type CreateInput,
  type MediaHeaderFormat,
} from "./components.ts";
import { handleAuthentication } from "./auth.ts";

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "method_not_allowed" });

  try {
    const input = (await req.json().catch(() => null)) as CreateInput | null;
    if (!input) return json(400, { error: "invalid_body" });
    if (String((input as any).category || "").toUpperCase() === "AUTHENTICATION") {
      return await handleAuthentication(input as any, json);
    }
    const { organizationId, name, language, category, body } = input;
    if (!organizationId || !name || !language || !category || !body) {
      return json(400, { error: "missing_fields" });
    }
    if (!/^[a-z][a-z0-9_]*$/.test(name)) {
      return json(400, { error: "invalid_name", message: "Use letras minúsculas, números e underscores" });
    }
    const invalid = validateTemplateInput(input);
    if (invalid) return json(422, { error: "invalid_template", message: invalid });
    const headerFormat = headerFormatOf(input);
    const headerMediaUrl = headerFormat !== "TEXT" ? (input.headerMediaUrl || "").trim() : "";
    if (headerMediaUrl && !isAllowedSampleUrl(headerMediaUrl, Deno.env.get("SUPABASE_URL")!, organizationId)) {
      return json(422, { error: "invalid_header_media", message: "O arquivo do cabeçalho precisa ser enviado pelo formulário de templates." });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: oiRows, error: oiErr } = await supabase
      .from("organization_integrations")
      .select("id, connected_account, config_values, is_enabled, admin_integrations!inner(slug)")
      .eq("organization_id", organizationId)
      .eq("is_enabled", true)
      .eq("admin_integrations.slug", "meta-whatsapp-cloud");
      const __oiId = typeof (input as any)?.organizationIntegrationId === "string" ? (input as any).organizationIntegrationId : "";
      const __rows = (oiRows ?? []).filter((r: any) => !__oiId || r.id === __oiId);
      if (!oiErr && !__oiId && __rows.length > 1) {
        return json(422, { error: "multiple_meta_accounts", message: "Esta organização tem mais de uma conta Meta conectada. Escolha a conta (número) do template." });
      }
      const oi = __rows[0] ?? null;

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

    // Cabeçalho de mídia: baixa o exemplo do storage da org e sobe na Meta (Resumable Upload).
    let headerHandle: string | undefined;
    if (headerMediaUrl) {
      const format = headerFormat as MediaHeaderFormat;
      // O upload é feito no app dono do token: Embedded Signup = app da plataforma.
      const appId = String(
        ca.app_id || cv.app_id || (ca.source === "embedded_signup" ? Deno.env.get("FACEBOOK_APP_ID") ?? "" : ""),
      ).trim();
      if (!appId) {
        return json(422, {
          error: "missing_app_id",
          message: "Esta conta Meta não tem o App ID salvo. Reconecte a conta para criar templates com mídia.",
        });
      }
      const mediaRes = await fetch(headerMediaUrl);
      if (!mediaRes.ok) {
        return json(422, { error: "header_media_download_failed", message: "Não foi possível ler o arquivo do cabeçalho. Envie novamente." });
      }
      const declared = Number(mediaRes.headers.get("content-length") || 0);
      if (declared > MEDIA_LIMITS[format].maxBytes) {
        await mediaRes.body?.cancel();
        return json(422, { error: "invalid_header_media", message: validateSampleMedia(format, MEDIA_LIMITS[format].types[0], declared) });
      }
      const bytes = new Uint8Array(await mediaRes.arrayBuffer());
      let mime = (mediaRes.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
      if (!mime || mime === "application/octet-stream") mime = guessMimeFromUrl(headerMediaUrl) || mime;
      const mediaErr = validateSampleMedia(format, mime, bytes.byteLength);
      if (mediaErr) return json(422, { error: "invalid_header_media", message: mediaErr });
      try {
        headerHandle = await metaWaResumableUpload(appId, bytes, mime, fileNameFromUrl(headerMediaUrl), { accessToken, appSecret });
      } catch (e) {
        if (e instanceof MetaWaGraphError) {
          const errAny = e.error as any;
          return json(422, {
            error: "meta_upload_failed",
            message: `A Meta recusou o arquivo do cabeçalho: ${errAny.error_user_msg || errAny.message || "erro desconhecido"}`,
            meta_error: e.error,
          });
        }
        throw e;
      }
    }

    const components = buildComponents(input, headerHandle);

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
        const errAny = e.error as any;
        let message = errAny.error_user_msg || errAny.message || "Erro ao criar template na Meta.";
        if (errAny.code === 192 || /already exists|duplicate/i.test(errAny.message || "")) {
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
      template_type: localTemplateType(input),
      category: cat,
      status,
      rejection_reason: status === "rejected" ? rejectedReason : null,
      body: input.body,
      header: headerFormat === "TEXT" ? (input.header || null) : null,
      footer: input.footer || null,
      variables: input.variables || [],
      components,
      source: "meta",
      is_active: true,
      last_synced_at: new Date().toISOString(),
      metadata: {
        // Reaproveitado no envio quando nenhuma mídia é informada (meta-whatsapp-send).
        ...(headerMediaUrl
          ? {
            header_format: headerFormat,
            header_media_url: headerMediaUrl,
            header_media_filename: fileNameFromUrl(headerMediaUrl),
          }
          : {}),
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
