// byok-set-key: salva uma chave BYOK criptografada após teste de conexão.
// Caller envia JWT do usuário; valida que é admin da org via has_org_role.
// Service-role usado SOMENTE dentro desta function.

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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  let body: any;
  try { body = await req.json(); } catch { return json({ error: "invalid_json" }, 400); }

  const organization_id = String(body?.organization_id ?? "");
  const provider = String(body?.provider ?? "").toLowerCase();
  const api_key = String(body?.api_key ?? "");
  const fallback_to_managed = !!body?.fallback_to_managed;
  const fallback_on_rate_limit = !!body?.fallback_on_rate_limit;
  const monthly_budget_usd = body?.monthly_budget_usd != null
    ? Number(body.monthly_budget_usd) : null;

  if (!organization_id || !isSupported(provider) || api_key.length < 8) {
    return json({ error: "invalid_params" }, 400);
  }

  const auth = await requireOrgAdmin(req, organization_id);
  if (!auth.ok) return json({ error: auth.error }, auth.status);
  const { admin } = auth;

  // Test connection BEFORE persisting.
  const test = await testProviderKey(provider, api_key);
  safeLog("[byok-set-key] test", { provider, ok: test.ok, status: test.status });
  if (!test.ok) {
    return json({ error: "key_test_failed", status: test.status }, 400);
  }

  const rowId = await getOrCreateByokRow(admin, organization_id);
  const current = (await readByokRow(admin, organization_id))?.secret_payload ?? {};

  let encryptedKey = "";
  try {
    encryptedKey = await encryptSecret(api_key);
  } catch (error) {
    safeLog("[byok-set-key] encryption_failed", { provider, error: error instanceof Error ? error.message : "unknown" });
    return json({ error: "encryption_unavailable" }, 503);
  }

  const entry = {
    api_key_encrypted: encryptedKey,
    last4: last4(api_key),
    fingerprint: await fingerprint(api_key),
    verified_at: new Date().toISOString(),
    verified_model: test.verified_model ?? null,
    is_active: true,
    last_error: null,
    rotated_at: null,
    fallback_to_managed,
    fallback_on_rate_limit,
    monthly_budget_usd: monthly_budget_usd && monthly_budget_usd > 0 ? monthly_budget_usd : null,
  };

  await writeSecretEntry(admin, rowId, current, provider, entry);

  return json({
    ok: true,
    provider,
    last4: entry.last4,
    verified_at: entry.verified_at,
    is_active: true,
  });
});
