// migrate-legacy-ai-key: migrates a plaintext legacy AI provider key stored in
// organization_integrations.config_values.api_key into the encrypted BYOK
// secret_payload. Admin-only. The legacy plaintext is preserved and marked
// with legacy_ai_key_migrated=true (no deletion in this step).

import {
  corsHeaders,
  encryptSecret,
  fingerprint,
  getOrCreateByokRow,
  isSupported,
  json,
  last4,
  readByokRow,
  testProviderKey,
  writeSecretEntry,
} from "../_shared/intelligence/byok-shared.ts";
import { requireOrgAdmin } from "../_shared/intelligence/authz.ts";
import { safeLog } from "../_shared/intelligence/sanitize.ts";

// Provider id -> legacy admin_integrations slug
const PROVIDER_SLUG: Record<string, string> = {
  openai:     "openai-gpt",
  anthropic:  "claude-ai",
  gemini:     "google-gemini",
  elevenlabs: "elevenlabs",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  let body: any;
  try { body = await req.json(); } catch { return json({ error: "invalid_json" }, 400); }

  const organization_id = String(body?.organization_id ?? "");
  const provider = String(body?.provider ?? "").toLowerCase();
  if (!organization_id || !isSupported(provider)) {
    return json({ error: "invalid_params" }, 400);
  }

  const auth = await requireOrgAdmin(req, organization_id);
  if (!auth.ok) return json({ error: auth.error }, auth.status);
  const { admin } = auth;

  // Refuse to overwrite an existing encrypted BYOK entry — caller should rotate instead.
  const existing = await readByokRow(admin, organization_id);
  if (existing?.secret_payload?.[provider]?.api_key_encrypted) {
    return json({ error: "byok_already_configured" }, 409);
  }

  // 1. Find the legacy integration row for this provider in this org.
  const slug = PROVIDER_SLUG[provider];
  const { data: integration } = await admin
    .from("admin_integrations")
    .select("id")
    .eq("slug", slug)
    .maybeSingle();
  if (!integration?.id) {
    return json({ error: "legacy_integration_not_found" }, 404);
  }

  const { data: orgInt } = await admin
    .from("organization_integrations")
    .select("id, config_values")
    .eq("organization_id", organization_id)
    .eq("integration_id", integration.id)
    .maybeSingle();

  const legacyKey = String(orgInt?.config_values?.api_key ?? "");
  if (!legacyKey || legacyKey.length < 8) {
    return json({ error: "no_legacy_key" }, 404);
  }

  // 2. Test the legacy key against the provider BEFORE persisting.
  const test = await testProviderKey(provider, legacyKey);
  safeLog("[migrate-legacy-ai-key] test", { provider, ok: test.ok, status: test.status });
  if (!test.ok) {
    return json({ error: "key_test_failed", status: test.status }, 400);
  }

  // 3. Encrypt and persist into the BYOK row.
  const rowId = await getOrCreateByokRow(admin, organization_id);
  const current = (await readByokRow(admin, organization_id))?.secret_payload ?? {};

  const entry = {
    api_key_encrypted: "",
    last4: last4(legacyKey),
    fingerprint: await fingerprint(legacyKey),
    verified_at: new Date().toISOString(),
    verified_model: test.verified_model ?? null,
    is_active: true,
    last_error: null,
    rotated_at: null,
    fallback_to_managed: false,
    fallback_on_rate_limit: false,
    monthly_budget_usd: null,
    migrated_from_legacy: true,
  };
  try {
    entry.api_key_encrypted = await encryptSecret(legacyKey);
  } catch (error) {
    safeLog("[migrate-legacy-ai-key] encryption_failed", { provider, error: error instanceof Error ? error.message : "unknown" });
    return json({ error: "migration_temporarily_unavailable" }, 503);
  }
  await writeSecretEntry(admin, rowId, current, provider, entry);

  // 4. Mark the legacy row as migrated (preserve api_key for rollback safety).
  if (orgInt?.id) {
    const nextConfig = {
      ...(orgInt.config_values ?? {}),
      legacy_ai_key_migrated: true,
      legacy_ai_key_migrated_at: new Date().toISOString(),
    };
    await admin
      .from("organization_integrations")
      .update({ config_values: nextConfig })
      .eq("id", orgInt.id);
  }

  return json({
    ok: true,
    provider,
    last4: entry.last4,
    verified_at: entry.verified_at,
    is_active: true,
  });
});
