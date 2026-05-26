// byok-update-policy: atualiza fallback flags e budget sem tocar na chave.

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
  if (!row || !row.secret_payload[provider]) return json({ error: "no_key_configured" }, 404);

  const current = row.secret_payload[provider];
  const budget = body?.monthly_budget_usd != null ? Number(body.monthly_budget_usd) : null;

  const entry = {
    ...current,
    fallback_to_managed: body?.fallback_to_managed != null
      ? !!body.fallback_to_managed
      : !!current.fallback_to_managed,
    fallback_on_rate_limit: body?.fallback_on_rate_limit != null
      ? !!body.fallback_on_rate_limit
      : !!current.fallback_on_rate_limit,
    monthly_budget_usd: budget && budget > 0 ? budget : null,
    is_active: body?.is_active != null ? !!body.is_active : !!current.is_active,
  };
  await writeSecretEntry(auth.admin, row.id, row.secret_payload, provider, entry);
  return json({ ok: true });
});
