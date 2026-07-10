// webchat-heartbeat — atualiza last_seen_at (indicador "online" no inbox).
// Auth: session token. Barato e idempotente.

import { preflight, json, serviceClient, sha256Hex } from "../_shared/webchat.ts";

Deno.serve(async (req) => {
  const pf = preflight(req);
  if (pf) return pf;

  try {
    const body = await req.json().catch(() => ({}));
    const token = req.headers.get("x-webchat-token") || body.session_token;
    if (!token) return json({ error: "missing_token" }, 401);

    const sb = serviceClient();
    const tokenHash = await sha256Hex(token);
    const { error } = await sb.from("webchat_sessions")
      .update({ last_seen_at: new Date().toISOString() })
      .eq("token_hash", tokenHash)
      .in("status", ["active", "qualified", "promoted"]);
    if (error) return json({ error: "update_failed" }, 500);
    return json({ ok: true });
  } catch (e) {
    console.error("[webchat-heartbeat] error", (e as Error)?.message);
    return json({ error: "internal_error" }, 500);
  }
});
