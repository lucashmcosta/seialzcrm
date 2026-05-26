// byok-rotate-key: atomicamente substitui a chave existente por uma nova.
// Testa antes de gravar; UPDATE atômico do jsonb -> chave anterior fica inacessível.

import {
  corsHeaders,
  encryptSecret,
  fingerprint,
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
  const new_api_key = String(body?.new_api_key ?? "");
  if (!organization_id || !isSupported(provider) || new_api_key.length < 8) {
    return json({ error: "invalid_params" }, 400);
  }

  const auth = await requireOrgAdmin(req, organization_id);
  if (!auth.ok) return json({ error: auth.error }, auth.status);

  const test = await testProviderKey(provider, new_api_key);
  if (!test.ok) return json({ error: "key_test_failed", status: test.status }, 400);

  const row = await readByokRow(auth.admin, organization_id);
  if (!row) return json({ error: "no_byok_row" }, 404);

  const previous = row.secret_payload[provider] ?? {};
  let encryptedKey = "";
  try {
    encryptedKey = await encryptSecret(new_api_key);
  } catch (error) {
    safeLog("[byok-rotate-key] encryption_failed", { provider, error: error instanceof Error ? error.message : "unknown" });
    return json({ error: "encryption_unavailable" }, 503);
  }

  const entry = {
    ...previous,
    api_key_encrypted: encryptedKey,
    last4: last4(new_api_key),
    fingerprint: await fingerprint(new_api_key),
    verified_at: new Date().toISOString(),
    is_active: true,
    last_error: null,
    rotated_at: new Date().toISOString(),
  };
  await writeSecretEntry(auth.admin, row.id, row.secret_payload, provider, entry);

  return json({
    ok: true,
    provider,
    last4: entry.last4,
    verified_at: entry.verified_at,
    rotated_at: entry.rotated_at,
  });
});
