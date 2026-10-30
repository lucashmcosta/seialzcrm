// Ramo isolado para templates AUTHENTICATION (OTP COPY_CODE).
// Valida e prepara a gravação local ANTES de chamar a Meta.
import { createClient } from "npm:@supabase/supabase-js@2";
import { decryptSecret } from "../_shared/crypto.ts";
import { metaWaPostJson, MetaWaGraphError } from "../_shared/meta-whatsapp/graph.ts";
import { resolveAppSecretForIntegration } from "../_shared/meta-whatsapp/credentials.ts";
import { normalizeLang } from "./components.ts";

type JsonFn = (status: number, body: Record<string, unknown>) => Response;

export interface AuthOptions {
  addSecurityRecommendation: boolean;
  codeExpirationMinutes: number;
  buttonText: string;
}

export interface AuthInput {
  organizationId?: unknown;
  name?: unknown;
  language?: unknown;
  category?: unknown;
  authentication?: {
    add_security_recommendation?: unknown;
    code_expiration_minutes?: unknown;
    button_text?: unknown;
  };
}

export type AuthValidation =
  | { ok: true; organizationId: string; name: string; language: string; options: AuthOptions }
  | { ok: false; error: string; message: string };

export function validateAuthInput(input: AuthInput): AuthValidation {
  const organizationId = typeof input.organizationId === "string" ? input.organizationId.trim() : "";
  const name = typeof input.name === "string" ? input.name.trim() : "";
  const language = typeof input.language === "string" ? input.language.trim() : "";
  if (!organizationId || !name || !language) {
    return { ok: false, error: "missing_fields", message: "Nome, idioma e organização são obrigatórios." };
  }
  if (!/^[a-z][a-z0-9_]*$/.test(name) || name.length > 512) {
    return { ok: false, error: "invalid_name", message: "Use letras minúsculas, números e underscores" };
  }
  const a = input.authentication ?? {};
  const sec = a.add_security_recommendation === undefined ? true : a.add_security_recommendation;
  if (typeof sec !== "boolean") {
    return { ok: false, error: "invalid_security", message: "Aviso de segurança inválido." };
  }
  const minutes = a.code_expiration_minutes === undefined ? 5 : a.code_expiration_minutes;
  if (typeof minutes !== "number" || !Number.isInteger(minutes) || minutes < 1 || minutes > 90) {
    return { ok: false, error: "invalid_expiration", message: "A validade do código deve ser entre 1 e 90 minutos." };
  }
  const rawText = a.button_text === undefined ? "Copiar código" : a.button_text;
  const text = typeof rawText === "string" ? rawText.trim() : "";
  if (!text || text.length > 25) {
    return { ok: false, error: "invalid_button_text", message: "O texto do botão deve ter de 1 a 25 caracteres." };
  }
  return {
    ok: true,
    organizationId,
    name,
    language,
    options: { addSecurityRecommendation: sec, codeExpirationMinutes: minutes, buttonText: text },
  };
}

export function buildAuthComponents(o: AuthOptions) {
  return [
    { type: "BODY", add_security_recommendation: o.addSecurityRecommendation },
    { type: "FOOTER", code_expiration_minutes: o.codeExpirationMinutes },
    { type: "BUTTONS", buttons: [{ type: "OTP", otp_type: "COPY_CODE", text: o.buttonText }] },
  ];
}

export function buildAuthPreviewTexts(o: AuthOptions) {
  return {
    body: o.addSecurityRecommendation
      ? "*{{1}}* é seu código de verificação. Para sua segurança, não o compartilhe."
      : "*{{1}}* é seu código de verificação.",
    footer: `Este código expira em ${o.codeExpirationMinutes} minutos.`,
  };
}

export function buildAuthPayload(name: string, language: string, o: AuthOptions) {
  return {
    name,
    language: normalizeLang(language),
    category: "AUTHENTICATION",
    components: buildAuthComponents(o),
  };
}

export async function handleAuthentication(input: AuthInput, json: JsonFn): Promise<Response> {
  const v = validateAuthInput(input);
  if (!v.ok) return json(v.error === "missing_fields" ? 400 : 422, { error: v.error, message: v.message });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const { data: oiRows, error: oiErr } = await supabase
    .from("organization_integrations")
    .select("id, connected_account, config_values, is_enabled, admin_integrations!inner(slug)")
    .eq("organization_id", v.organizationId)
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

  const payload = buildAuthPayload(v.name, v.language, v.options);
  const texts = buildAuthPreviewTexts(v.options);

  // Pré-checagem local antes de criar na Meta: evita template órfão na Meta.
  const { data: dup, error: dupErr } = await supabase
    .from("whatsapp_templates")
    .select("id")
    .eq("organization_integration_id", oi.id)
    .eq("meta_template_name", v.name)
    .eq("language", payload.language)
    .maybeSingle();
  if (dupErr) return json(500, { error: "persist_precheck_failed", details: dupErr.message });
  if (dup) {
    return json(422, {
      error: "meta_create_failed",
      message: `Já existe um template "${v.name}" no idioma ${payload.language}.`,
    });
  }

  const baseRow = {
    organization_id: v.organizationId,
    organization_integration_id: oi.id,
    provider: "meta_cloud_api",
    twilio_content_sid: null as string | null,
    meta_template_name: v.name,
    meta_waba_id: String(wabaId),
    friendly_name: v.name,
    language: payload.language,
    template_type: "authentication",
    category: "AUTHENTICATION",
    body: texts.body,
    header: null,
    footer: texts.footer,
    variables: [],
    components: payload.components,
    source: "meta",
    is_active: true,
  };

  const accessToken = (await decryptSecret(ca.access_token_encrypted)).trim();
  const appSecret = await resolveAppSecretForIntegration(ca);

  let metaResponse: any;
  try {
    metaResponse = await metaWaPostJson(`/${wabaId}/message_templates`, payload, { accessToken, appSecret });
  } catch (e) {
    if (e instanceof MetaWaGraphError) {
      const errAny = e.error as any;
      let message = errAny.error_user_msg || errAny.message || "Erro ao criar template na Meta.";
      if (errAny.code === 192 || /already exists|duplicate/i.test(errAny.message || "")) {
        message = `Já existe um template "${v.name}" no idioma ${payload.language}.`;
      } else if (errAny.code === 200 || errAny.code === 10 || /permission/i.test(errAny.message || "")) {
        message = `A Meta recusou por permissão: ${message}`;
      }
      return json(422, { error: "meta_create_failed", message, meta_error: e.error });
    }
    throw e;
  }

  const metaTemplateId = metaResponse?.id ? String(metaResponse.id) : null;
  const metaStatus = (metaResponse?.status || "PENDING").toString().toUpperCase();
  const status = metaStatus === "APPROVED" ? "approved" : metaStatus === "REJECTED" ? "rejected" : "pending";
  const rejectedReason = metaResponse?.rejected_reason && String(metaResponse.rejected_reason).toUpperCase() !== "NONE"
    ? String(metaResponse.rejected_reason)
    : null;

  const row = {
    ...baseRow,
    status,
    rejection_reason: status === "rejected" ? rejectedReason : null,
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
    console.error("[meta-wa-templates-create:auth] insert failed", insErr.message);
    return json(500, {
      error: "persist_failed",
      message: "Template criado na Meta mas falhou ao salvar localmente. Rode Sincronizar Meta para recuperar.",
      meta_template_id: metaTemplateId,
      details: insErr.message,
    });
  }

  return json(200, { success: true, id: inserted?.id, meta_template_id: metaTemplateId, status });
}
