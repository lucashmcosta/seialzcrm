// byok-test-key: testa a chave atualmente armazenada (sem expô-la).

import {
  corsHeaders,
  isSupported,
  json,
  readByokRow,
  testProviderKey,
} from "../_shared/intelligence/byok-shared.ts";
import { requireOrgAdmin } from "../_shared/intelligence/authz.ts";
import { decryptSecret } from "../_shared/crypto.ts";

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
  const enc = row?.secret_payload?.[provider]?.api_key_encrypted;
  if (!enc) return json({ error: "no_key_configured" }, 404);

  let apiKey: string;
  try { apiKey = await decryptSecret(enc); }
  catch { return json({ error: "decrypt_failed" }, 500); }

  const r = await testProviderKey(provider, apiKey);
  return json({ ok: r.ok, status: r.status });
});
