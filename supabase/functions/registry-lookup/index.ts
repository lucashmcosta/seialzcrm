import { featureFlagEnabled } from "../_shared/feature-flags.ts";
import { requireRegistryAccess } from "../_shared/registry/auth.ts";
import {
  lookupBrasilApiCep,
  lookupBrasilApiCnpj,
  lookupCpfBrasil,
  lookupViaCep,
  isValidCnpjValue,
  isValidCpfValue,
  type LookupKind,
  type ProviderResult,
} from "../_shared/registry/providers.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const limiter = new Map<string, { window: number; count: number }>();
const MAX_REQUESTS_PER_MINUTE = 60;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function normalize(kind: LookupKind, value: unknown): string | null {
  const raw = String(value ?? "");
  const normalized = kind === "cnpj"
    ? raw.replace(/[^0-9A-Za-z]/g, "").toUpperCase()
    : raw.replace(/\D/g, "");
  const expected = kind === "cep" ? 8 : kind === "cpf" ? 11 : 14;
  return normalized.length === expected ? normalized : null;
}

function allowed(key: string): boolean {
  const window = Math.floor(Date.now() / 60_000);
  const current = limiter.get(key);
  if (!current || current.window !== window) {
    limiter.set(key, { window, count: 1 });
    return true;
  }
  current.count += 1;
  return current.count <= MAX_REQUESTS_PER_MINUTE;
}

async function identifierHash(value: string): Promise<string> {
  const secret = Deno.env.get("REGISTRY_AUDIT_HASH_KEY")
    ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")
    ?? "registry-audit";
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(value));
  return Array.from(new Uint8Array(signature))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function lookup(kind: LookupKind, value: string): Promise<ProviderResult> {
  if (kind === "cpf") return lookupCpfBrasil(value);
  if (kind === "cnpj") return lookupBrasilApiCnpj(value);
  const primary = await lookupBrasilApiCep(value);
  if (primary.ok) return primary;
  const fallback = await lookupViaCep(value);
  return fallback.ok ? fallback : primary;
}

function cpfFailureClass(result: Extract<ProviderResult, { ok: false }>): string {
  if (
    result.status === 429 || result.status >= 500 || result.status === 0 ||
    ["timeout", "network_error", "provider_circuit_open", "upstream_error"].includes(result.error)
  ) return "provider_unavailable";
  if (["invalid_or_not_found", "not_found"].includes(result.error)) return "not_found";
  if ([
    "provider_auth_error", "provider_invalid_api_key", "provider_token_expired",
    "provider_plan_expired", "provider_plan_suspended",
  ].includes(result.error)) return "auth";
  if (["provider_not_configured", "provider_missing_api_key"].includes(result.error)) return "configuration";
  return "unknown";
}

function normalizedSex(value: unknown): string | null {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (!normalized) return null;
  if (["m", "masculino", "male"].includes(normalized)) return "male";
  if (["f", "feminino", "female"].includes(normalized)) return "female";
  return "other";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ error: "invalid_json" }, 400);
  }

  const organizationId = String(body.organization_id ?? "");
  const contactId = body.contact_id ? String(body.contact_id) : null;
  let existingCpfVerification: { status: string; verifiedAt: string | null } | null = null;
  const kind = String(body.kind ?? "") as LookupKind;
  if (!organizationId || !["cep", "cnpj", "cpf"].includes(kind)) {
    return json({ error: "invalid_parameters" }, 400);
  }

  const value = normalize(kind, body.value);
  if (!value) return json({ error: `invalid_${kind}_format` }, 422);
  if (kind === "cpf" && !isValidCpfValue(value)) {
    return json({ error: "invalid_cpf" }, 422);
  }
  if (kind === "cnpj" && !isValidCnpjValue(value)) {
    return json({ error: "invalid_cnpj" }, 422);
  }

  const auth = await requireRegistryAccess(req, organizationId);
  if (!auth.ok) return json({ error: auth.error }, auth.status);
  if (!allowed(`${organizationId}:${auth.userId}`)) {
    return json({ error: "rate_limited" }, 429);
  }

  const enabled = await featureFlagEnabled(auth.admin, "registry_lookup_br", organizationId);
  if (!enabled) return json({ error: "registry_lookup_disabled" }, 503);
  if (kind === "cpf") {
    const { data: providerSettings } = await auth.admin
      .from("registry_provider_settings")
      .select("cpf_lookup_enabled, documented_purpose, privacy_notice_updated_at")
      .eq("organization_id", organizationId)
      .maybeSingle();
    if (
      providerSettings?.cpf_lookup_enabled !== true
      || !providerSettings.documented_purpose
      || !providerSettings.privacy_notice_updated_at
    ) {
      return json({ error: "cpf_lookup_not_authorized_for_organization" }, 403);
    }
  }

  if (contactId && kind !== "cpf") {
    return json({ error: "contact_id_only_supported_for_cpf" }, 400);
  }
  if (contactId) {
    const { data: contact } = await auth.admin
      .from("contacts")
      .select("id,cpf")
      .eq("id", contactId)
      .eq("organization_id", organizationId)
      .is("deleted_at", null)
      .maybeSingle();
    if (!contact) return json({ error: "contact_not_found" }, 404);
    if (String(contact.cpf ?? "").replace(/\D/g, "") !== value) {
      return json({ error: "contact_cpf_mismatch" }, 409);
    }
    const { data: identity } = await auth.admin
      .from("contact_identity_profiles")
      .select("cpf_verification_status,cpf_verified_at")
      .eq("organization_id", organizationId)
      .eq("contact_id", contactId)
      .maybeSingle();
    existingCpfVerification = identity
      ? { status: String(identity.cpf_verification_status), verifiedAt: identity.cpf_verified_at }
      : null;
  }

  const hash = await identifierHash(`${kind}:${value}`);
  if (kind !== "cpf") {
    const { data: cached } = await auth.admin
      .from("registry_lookup_cache")
      .select("normalized_payload, provider")
      .eq("lookup_kind", kind)
      .eq("identifier_hash", hash)
      .gt("expires_at", new Date().toISOString())
      .limit(1)
      .maybeSingle();
    if (cached) {
      return json({ ok: true, kind, provider: cached.provider, cached: true, data: cached.normalized_payload });
    }
  }

  const started = Date.now();
  const result = await lookup(kind, value);
  const durationMs = Date.now() - started;

  await auth.admin.from("registry_lookup_audit").insert({
    organization_id: organizationId,
    requested_by_user_id: auth.userId,
    lookup_kind: kind,
    provider: result.provider,
    identifier_hash: hash,
    identifier_suffix: value.slice(-4),
    outcome: result.ok ? "success" : "error",
    http_status: result.status || null,
    duration_ms: durationMs,
    error_code: result.ok ? null : result.error,
  });

  if (!result.ok) {
    if (kind === "cpf" && contactId) {
      const failureClass = cpfFailureClass(result);
      const { error: persistError } = await auth.admin.from("contact_identity_profiles").upsert({
        organization_id: organizationId,
        contact_id: contactId,
        cpf_verification_status: existingCpfVerification?.status === "verified"
          ? "verified"
          : failureClass === "not_found" ? "invalid" : "error",
        verification_provider: result.provider,
        verification_provider_version: result.version,
        cpf_verified_at: existingCpfVerification?.status === "verified"
          ? existingCpfVerification.verifiedAt
          : null,
        last_error_code: result.error,
        last_verification_attempt_at: new Date().toISOString(),
        last_failure_class: failureClass,
        last_provider_http_status: result.status || null,
        last_attempt_retryable: failureClass === "provider_unavailable",
        updated_at: new Date().toISOString(),
      }, { onConflict: "contact_id" });
      if (persistError) return json({ error: "cpf_verification_persist_failed" }, 500);
    }
    const status = result.error === "invalid_or_not_found" || result.error === "not_found"
      ? 422
      : result.error === "provider_not_configured"
      ? 503
      : 502;
    return json({
      ok: false,
      kind,
      provider: result.provider,
      error: result.error,
      retryable: result.retryable,
    }, status);
  }

  if (kind !== "cpf") {
    const ttlMs = kind === "cep" ? 30 * 24 * 60 * 60 * 1000 : 24 * 60 * 60 * 1000;
    await auth.admin.from("registry_lookup_cache").upsert({
      lookup_kind: kind,
      identifier_hash: hash,
      provider: result.provider,
      normalized_payload: result.payload,
      expires_at: new Date(Date.now() + ttlMs).toISOString(),
      updated_at: new Date().toISOString(),
    }, { onConflict: "lookup_kind,identifier_hash,provider" });
  }

  if (kind === "cpf" && contactId) {
    const returnedCpf = String(result.payload.cpf ?? "").replace(/\D/g, "");
    if (returnedCpf && returnedCpf !== value) {
      return json({ ok: false, kind, provider: result.provider, error: "provider_cpf_mismatch", retryable: false }, 502);
    }
    const { error: persistError } = await auth.admin.from("contact_identity_profiles").upsert({
      organization_id: organizationId,
      contact_id: contactId,
      cpf_verification_status: "verified",
      cpf_registration_status: result.payload.registration_status ?? null,
      birth_date: result.payload.birth_date ?? null,
      sex: normalizedSex(result.payload.sex),
      mother_name: result.payload.mother_name ?? null,
      verification_provider: result.provider,
      verification_provider_version: result.version,
      cpf_verified_at: new Date().toISOString(),
      last_error_code: null,
      last_verification_attempt_at: new Date().toISOString(),
      last_failure_class: null,
      last_provider_http_status: result.status,
      last_attempt_retryable: false,
      updated_at: new Date().toISOString(),
    }, { onConflict: "contact_id" });
    if (persistError) return json({ error: "cpf_verification_persist_failed" }, 500);
  }

  return json({
    ok: true,
    kind,
    provider: result.provider,
    provider_version: result.version,
    cached: false,
    persisted_contact_id: contactId,
    data: result.payload,
  });
});
