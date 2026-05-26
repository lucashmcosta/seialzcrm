// byok-revoke-key: remove a chave criptografada e marca inativa.

import {
  corsHeaders,
  isSupported,
  json,
  readByokRow,
  writeSecretEntry,
} from "../_shared/intelligence/byok-shared.ts";
import { requireOrgAdmin } from "../_shared/intelligence/authz.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  let body: any;
  try { body = await req.json(); } catch { return json({ error: "invalid_json" }, 400); }
  const organization_id = String(body?.organization_id ?? "");
  const provider = String(body?.provider ?? "").toLowerCase();
  if (!organization_id || !isSupported(provider)) return json({ error: "invalid_params" }, 400);

  const auth = await requireOrgAdmin(req, organization_id);
  if (!auth.ok) return json({ error: auth.error }, auth.status);

  const row = await readByokRow(auth.admin, organization_id);
  if (!row || !row.secret_payload[provider]) return json({ ok: true, already_revoked: true });

  const current = row.secret_payload[provider];
  const entry = {
    last4: current.last4 ?? null,
    fingerprint: current.fingerprint ?? null,
    is_active: false,
    verified_at: null,
    api_key_encrypted: null,
    revoked_at: new Date().toISOString(),
    last_error: "revoked",
  };
  await writeSecretEntry(auth.admin, row.id, row.secret_payload, provider, entry);
  return json({ ok: true });
});
